import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';

const DailyWorkLogs = () => {
  const { currentUser, userRole } = useAuth();
  const [workDescription, setWorkDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreview, setPhotoPreview] = useState([]);
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [loading, setLoading] = useState(false);
  const [workLogs, setWorkLogs] = useState([]);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [todayLog, setTodayLog] = useState(null);
  const [workerDetails, setWorkerDetails] = useState({}); // For engineers: userId -> worker info

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (userRole === 'worker') {
      getCurrentLocation();
      loadTodayLog();
    }
    loadWorkLogs();
    const queue = localStorage.getItem('workLogsOfflineQueue');
    if (queue) {
      setOfflineQueue(JSON.parse(queue));
    }
  }, [currentUser, userRole]);

  useEffect(() => {
    if (userRole === 'site_engineer' && workLogs.length > 0) {
      loadWorkerDetails();
    }
  }, [workLogs, userRole]);

  useEffect(() => {
    if (navigator.onLine && offlineQueue.length > 0) {
      syncOfflineQueue();
    }
  }, [navigator.onLine]);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setLocationError('');
      },
      (error) => {
        setLocationError('Unable to retrieve location: ' + error.message);
      }
    );
  };

  const loadTodayLog = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const q = query(
        collection(db, 'workLogs'),
        where('userId', '==', currentUser.uid),
        where('date', '==', todayStr)
      );

      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        setTodayLog({ id: doc.id, ...doc.data() });
      } else {
        setTodayLog(null);
      }
    } catch (error) {
      console.error('Error loading today log:', error);
    }
  };

  const loadWorkLogs = async () => {
    try {
      let q;
      if (userRole === 'site_engineer') {
        // Engineers see all work logs
        q = query(collection(db, 'workLogs'));
      } else {
        // Workers see only their own logs
        q = query(
          collection(db, 'workLogs'),
          where('userId', '==', currentUser.uid)
        );
      }
      
      const snapshot = await getDocs(q);
      const logsList = [];
      snapshot.forEach((doc) => {
        logsList.push({ id: doc.id, ...doc.data() });
      });
      setWorkLogs(logsList.sort((a, b) => {
        const dateA = new Date(a.date || a.createdAt);
        const dateB = new Date(b.date || b.createdAt);
        return dateB - dateA;
      }).slice(0, userRole === 'site_engineer' ? 50 : 10)); // Engineers see more logs
    } catch (error) {
      console.error('Error loading work logs:', error);
    }
  };

  const loadWorkerDetails = async () => {
    try {
      const uniqueUserIds = [...new Set(workLogs.map(log => log.userId))];
      const details = {};
      
      for (const userId of uniqueUserIds) {
        if (!workerDetails[userId]) {
          try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              details[userId] = {
                name: userData.name || userData.email || 'Unknown',
                email: userData.email || 'N/A',
                role: userData.role || 'worker'
              };
            } else {
              details[userId] = {
                name: 'Unknown User',
                email: 'N/A',
                role: 'worker'
              };
            }
          } catch (error) {
            console.error(`Error loading user details for ${userId}:`, error);
            details[userId] = {
              name: 'Unknown User',
              email: 'N/A',
              role: 'worker'
            };
          }
        } else {
          details[userId] = workerDetails[userId];
        }
      }
      
      setWorkerDetails(prev => ({ ...prev, ...details }));
    } catch (error) {
      console.error('Error loading worker details:', error);
    }
  };

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    
    // Filter out files that are too large
    const validFiles = [];
    const errors = [];
    
    files.forEach((file, index) => {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit for Cloudinary
        errors.push(`Photo ${index + 1} is too large (max 10MB)`);
      } else if (!file.type.startsWith('image/')) {
        errors.push(`File ${index + 1} is not an image`);
      } else {
        validFiles.push(file);
      }
    });
    
    if (errors.length > 0) {
      alert('Some files were rejected:\n' + errors.join('\n'));
    }
    
    if (validFiles.length > 0) {
      setPhotos(validFiles);
      // Create preview URLs
      const previews = validFiles.map(file => URL.createObjectURL(file));
      setPhotoPreview(previews);
    }
  };

  const removePhoto = (index) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    const newPreviews = photoPreview.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    setPhotoPreview(newPreviews);
  };

  const uploadPhotos = async (photoFiles) => {
    const photoUrls = [];
    const errors = [];
    
    const cloudName = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET;
    
    if (!cloudName || !uploadPreset) {
      throw new Error('Cloudinary credentials not configured. Please check .env file and restart the app.');
    }
    
    for (let i = 0; i < photoFiles.length; i++) {
      const file = photoFiles[i];
      
      // Check file size (max 10MB per photo for Cloudinary)
      if (file.size > 10 * 1024 * 1024) {
        errors.push(`Photo ${i + 1} is too large (max 10MB)`);
        continue;
      }
      
      try {
        // Create FormData for Cloudinary upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', uploadPreset);
        
        // Add folder only if upload preset supports it (unsigned presets work fine with folders)
        // If you get errors, try removing this line temporarily
        formData.append('folder', `worklogs/${currentUser.uid}`); // Organize by user
        
        console.log(`Uploading photo ${i + 1} to Cloudinary...`, {
          fileName: file.name,
          fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
          fileType: file.type
        });
        
        // Upload to Cloudinary
        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          {
            method: 'POST',
            body: formData
          }
        );
        
        const responseText = await response.text();
        console.log(`Cloudinary response for photo ${i + 1}:`, {
          status: response.status,
          statusText: response.statusText,
          responsePreview: responseText.substring(0, 200)
        });
        
        if (!response.ok) {
          let errorData;
          try {
            errorData = JSON.parse(responseText);
          } catch (e) {
            errorData = { error: { message: responseText } };
          }
          
          const errorMessage = errorData.error?.message || errorData.message || `Upload failed with status ${response.status}`;
          console.error(`Cloudinary upload error for photo ${i + 1}:`, errorData);
          throw new Error(errorMessage);
        }
        
        const data = JSON.parse(responseText);
        if (data.secure_url) {
          photoUrls.push(data.secure_url);
          console.log(`✓ Photo ${i + 1} uploaded successfully:`, data.secure_url);
        } else {
          console.error(`No secure_url in response for photo ${i + 1}:`, data);
          throw new Error('No URL returned from Cloudinary');
        }
      } catch (error) {
        console.error(`Error uploading photo ${i + 1} to Cloudinary:`, error);
        errors.push(`Photo ${i + 1}: ${error.message || 'Unknown error'}`);
      }
    }
    
    if (errors.length > 0 && photoUrls.length === 0) {
      // All photos failed
      const errorMessage = `All photos failed to upload: ${errors.join('; ')}`;
      console.error('Cloudinary upload failed:', errorMessage);
      throw new Error(errorMessage);
    } else if (errors.length > 0) {
      // Some photos failed
      console.warn('Some photos failed to upload:', errors);
      console.log(`Successfully uploaded ${photoUrls.length} out of ${photoFiles.length} photos`);
    }
    
    return photoUrls;
  };

  // Alternative: Convert photo to base64 (for small images, max 1MB)
  const convertPhotoToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      if (file.size > 1024 * 1024) { // 1MB limit for base64
        reject(new Error('Photo too large for base64 (max 1MB)'));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const syncOfflineQueue = async () => {
    if (!navigator.onLine) return;
    const queue = JSON.parse(localStorage.getItem('workLogsOfflineQueue') || '[]');
    if (queue.length === 0) return;
    
    for (const item of queue) {
      try {
        // Try to upload base64 photos to Cloudinary if they exist
        let photoUrls = [];
        if (item.photoBase64 && item.photoBase64.length > 0) {
          // Note: We can't convert base64 back to files easily for Cloudinary upload
          // So we'll keep base64 photos in the synced document
          // Future: Could convert base64 to File and upload to Cloudinary during sync
          console.log('Keeping base64 photos from offline queue (Cloudinary upload skipped)');
        }
        
        // Build document data, only including photo fields if they have values
        const documentData = {
          ...item,
          synced: true,
          syncedAt: serverTimestamp()
        };
        
        if (photoUrls.length > 0) {
          documentData.photoUrls = photoUrls;
        }
        
        if (item.photoBase64 && item.photoBase64.length > 0) {
          documentData.photoBase64 = item.photoBase64;
        }
        
        await addDoc(collection(db, 'workLogs'), documentData);
      } catch (error) {
        console.error('Error syncing offline work log:', error);
      }
    }
    localStorage.removeItem('workLogsOfflineQueue');
    setOfflineQueue([]);
    loadWorkLogs();
    loadTodayLog();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!workDescription.trim()) {
      alert('Please describe the work done');
      return;
    }

    if (!location) {
      alert('Please allow location access to submit work log');
      getCurrentLocation();
      return;
    }

    setLoading(true);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const workLogData = {
      userId: currentUser.uid,
      date: todayStr,
      workDescription: workDescription.trim(),
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy
      },
      createdAt: new Date().toISOString(),
      synced: navigator.onLine
    };

    try {
      if (navigator.onLine) {
        let photoUrls = [];
        let photoBase64 = [];
        
        // Try to upload photos to Cloudinary
        if (photos.length > 0) {
          try {
            photoUrls = await uploadPhotos(photos);
            
            // If Cloudinary upload fails, try base64 as alternative (for small images only)
            if (photoUrls.length === 0 && photos.length > 0) {
              console.log('Cloudinary upload failed, trying base64 alternative...');
              for (const photo of photos) {
                try {
                  const base64 = await convertPhotoToBase64(photo);
                  photoBase64.push(base64);
                } catch (err) {
                  console.warn('Base64 conversion failed for photo:', err);
                }
              }
            }
          } catch (error) {
            console.error('Photo upload error:', error);
            // Show detailed error to user
            const errorMessage = error.message || 'Unknown error';
            console.error('Full error details:', {
              message: errorMessage,
              stack: error.stack,
              name: error.name
            });
            
            // Try base64 as fallback for small images
            if (photos.length > 0) {
              console.log('Attempting base64 fallback for failed uploads...');
              for (const photo of photos) {
                try {
                  const base64 = await convertPhotoToBase64(photo);
                  photoBase64.push(base64);
                } catch (err) {
                  console.warn('Base64 conversion also failed:', err);
                }
              }
            }
            
            // Show user-friendly error
            alert(`Photo upload failed: ${errorMessage}\n\nWork log will be saved without photos. Please check:\n1. Cloudinary credentials in .env file\n2. Upload preset is configured correctly\n3. Internet connection`);
          }
        }
        
        // Build document data, only including photo fields if they have values
        const documentData = {
          ...workLogData,
          synced: true
        };
        
        if (photoUrls.length > 0) {
          documentData.photoUrls = photoUrls;
        }
        
        if (photoBase64.length > 0) {
          documentData.photoBase64 = photoBase64;
        }
        
        await addDoc(collection(db, 'workLogs'), documentData);
      } else {
        // Offline mode - try to save photos as base64
        let photoBase64 = [];
        if (photos.length > 0) {
          for (const photo of photos) {
            try {
              const base64 = await convertPhotoToBase64(photo);
              photoBase64.push(base64);
            } catch (err) {
              console.warn('Base64 conversion failed:', err);
            }
          }
        }
        
        const queue = JSON.parse(localStorage.getItem('workLogsOfflineQueue') || '[]');
        
        // Build queue item, only including photoBase64 if it has values
        const queueItem = {
          ...workLogData,
          photoCount: photos.length
        };
        
        if (photoBase64.length > 0) {
          queueItem.photoBase64 = photoBase64;
        }
        
        queue.push(queueItem);
        localStorage.setItem('workLogsOfflineQueue', JSON.stringify(queue));
        setOfflineQueue(queue);
        alert('Work log saved offline. Will sync when connection is restored.');
      }

      setWorkDescription('');
      setPhotos([]);
      setPhotoPreview([]);
      loadWorkLogs();
      loadTodayLog();
      alert('Work log submitted successfully! Shift completed.');
    } catch (error) {
      console.error('Error saving work log:', error);
      alert(`Failed to save work log: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      width: '100%',
      maxWidth: '100%',
      padding: windowWidth <= 768 ? '1rem' : '2rem',
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex',
        flexDirection: windowWidth <= 768 ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: windowWidth <= 768 ? 'flex-start' : 'center',
        marginBottom: '2rem',
        gap: '1rem'
      }}>
        <h1 style={{ 
          margin: 0, 
          fontSize: windowWidth <= 480 ? '1.5rem' : '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          {userRole === 'site_engineer' ? '👷 Workers\' Work Logs' : '📝 Daily Work Log'}
        </h1>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          background: navigator.onLine ? '#d1fae5' : '#fee2e2',
          borderRadius: '20px',
          fontSize: '0.875rem',
          fontWeight: '600',
          color: navigator.onLine ? '#065f46' : '#991b1b'
        }}>
          <span style={{ fontSize: '1rem' }}>{navigator.onLine ? '🟢' : '🔴'}</span>
          {navigator.onLine ? 'Online' : 'Offline'}
        </div>
      </div>

      {/* Today's Log Status - Only for Workers */}
      {userRole === 'worker' && todayLog && (
        <div style={{ 
          background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
          border: '2px solid #6ee7b7',
          padding: '1rem',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <span style={{ fontSize: '1.5rem' }}>✅</span>
          <div>
            <strong style={{ color: '#065f46' }}>Work log already submitted for today</strong>
            <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#047857' }}>
              Submitted at {new Date(todayLog.createdAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
      )}

      {/* Offline Queue Warning - Only for Workers */}
      {userRole === 'worker' && offlineQueue.length > 0 && (
        <div style={{ 
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          border: '2px solid #fcd34d',
          padding: '1rem',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <div>
            <strong style={{ color: '#92400e' }}>
              {offlineQueue.length} work log(s) pending sync
            </strong>
            <p style={{ fontSize: '0.875rem', color: '#78350f', margin: '0.25rem 0 0 0' }}>
              Logs will be synced when connection is restored
            </p>
          </div>
        </div>
      )}

      {/* Location Status - Only for Workers */}
      {userRole === 'worker' && locationError && (
        <div style={{ 
          background: '#fee2e2',
          border: '2px solid #fecaca',
          color: '#991b1b',
          padding: '1rem',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <div>
            <span>{locationError}</span>
            <button
              onClick={getCurrentLocation}
              style={{
                marginLeft: '1rem',
                padding: '0.25rem 0.75rem',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {userRole === 'worker' && location && (
        <div style={{ 
          background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
          border: '2px solid #93c5fd',
          padding: '1rem',
          borderRadius: '12px',
          marginBottom: '1.5rem',
          display: 'flex',
          flexDirection: windowWidth <= 480 ? 'column' : 'row',
          alignItems: windowWidth <= 480 ? 'flex-start' : 'center',
          gap: '0.75rem'
        }}>
          <span style={{ fontSize: '1.5rem' }}>📍</span>
          <div>
            <strong style={{ color: '#1e40af' }}>Location Captured</strong>
            <p style={{ fontSize: '0.875rem', marginTop: '0.25rem', color: '#1e3a8a' }}>
              Lat: {location.latitude.toFixed(6)}, Lng: {location.longitude.toFixed(6)}
              {location.accuracy && ` • Accuracy: ${Math.round(location.accuracy)}m`}
            </p>
          </div>
        </div>
      )}

      {/* Create Work Log Form - Only for Workers */}
      {userRole === 'worker' && !todayLog && (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: windowWidth <= 480 ? '1.5rem' : '2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          marginBottom: '2rem'
        }}>
          <h2 style={{ 
            margin: '0 0 1.5rem 0', 
            fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.5rem' }}>✍️</span>
            Submit Daily Work Log (Finish Shift)
          </h2>

          <form onSubmit={handleSubmit}>
            {/* Work Description */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Work Done Today *
              </label>
              <textarea
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                rows={windowWidth <= 480 ? 5 : 6}
                placeholder="Describe all the work you completed today...\n\nExample:\n- Completed foundation work for Building A\n- Installed electrical wiring in 3 rooms\n- Mixed and poured concrete for parking area"
                required
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  transition: 'all 0.2s',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
              <div style={{ 
                fontSize: '0.75rem', 
                color: '#6b7280', 
                marginTop: '0.25rem',
                textAlign: 'right'
              }}>
                {workDescription.length} characters
              </div>
            </div>

            {/* Photo Upload */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Photos of Work (Optional - Max 10MB per photo, uploaded to Cloudinary)
              </label>
              <p style={{ 
                fontSize: '0.75rem', 
                color: '#6b7280', 
                marginBottom: '0.5rem',
                fontStyle: 'italic'
              }}>
                Note: If photo upload fails, work log will still be saved without photos.
              </p>
              <div style={{
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                padding: '1.5rem',
                textAlign: 'center',
                background: '#f9fafb',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative'
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.background = '#eef2ff';
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.background = '#f9fafb';
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.background = '#f9fafb';
                handlePhotoChange({ target: { files: e.dataTransfer.files } });
              }}
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoChange}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer'
                  }}
                />
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📷</div>
                <p style={{ color: '#6b7280', marginBottom: '0.25rem' }}>
                  Click to upload or drag and drop
                </p>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  PNG, JPG, GIF up to 10MB each
                </p>
              </div>

              {/* Photo Preview */}
              {photoPreview.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: windowWidth <= 480 
                      ? 'repeat(2, 1fr)' 
                      : 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '0.75rem'
                  }}>
                    {photoPreview.map((preview, idx) => (
                      <div key={idx} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
                        <img 
                          src={preview} 
                          alt={`Preview ${idx + 1}`} 
                          style={{ 
                            width: '100%', 
                            aspectRatio: '1',
                            objectFit: 'cover',
                            display: 'block'
                          }} 
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          style={{
                            position: 'absolute',
                            top: '0.25rem',
                            right: '0.25rem',
                            background: 'rgba(239, 68, 68, 0.9)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1rem',
                            fontWeight: 'bold'
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#059669',
                    marginTop: '0.75rem',
                    fontWeight: '500'
                  }}>
                    ✓ {photos.length} photo(s) selected
                  </p>
                </div>
              )}
            </div>

            {/* Info Message */}
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              padding: '0.75rem',
              borderRadius: '8px',
              marginBottom: '1rem',
              fontSize: '0.875rem',
              color: '#1e40af'
            }}>
              <strong>💡 Tip:</strong> Work log can be submitted even if photos fail to upload. Your work description and location are the most important.
            </div>

            {/* Submit Button */}
            <button 
              type="submit"
              disabled={loading || !location}
              style={{
                width: '100%',
                padding: '1rem',
                background: (loading || !location)
                  ? '#9ca3af' 
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: (loading || !location) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: (loading || !location) ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => {
                if (!loading && location) e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite'
                  }}></span>
                  Submitting...
                </>
              ) : (
                <>
                  <span style={{ fontSize: '1.25rem' }}>✓</span>
                  Finish Shift & Submit Work Log
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Recent Work Logs / All Workers' Logs */}
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ 
          margin: 0, 
          marginBottom: '1rem',
          fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span style={{ fontSize: '1.5rem' }}>📋</span>
          {userRole === 'site_engineer' ? 'All Workers\' Work Logs' : 'Recent Work Logs'}
        </h2>
        {userRole === 'site_engineer' && (
          <p style={{ 
            fontSize: '0.875rem', 
            color: '#6b7280', 
            marginTop: '0.25rem',
            marginBottom: '1rem'
          }}>
            Review workers' daily work logs to verify task completion
          </p>
        )}
      </div>

      {workLogs.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '3rem 2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
          <p style={{ color: '#6b7280' }}>
            {userRole === 'site_engineer' 
              ? 'No work logs submitted by workers yet' 
              : 'No work logs submitted yet'}
          </p>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>
            {userRole === 'site_engineer' 
              ? 'Work logs will appear here when workers submit them'
              : 'Submit your first work log at the end of your shift'}
          </p>
        </div>
      ) : (
        <div style={{ 
          display: 'grid',
          gap: '1rem'
        }}>
          {workLogs.map((log) => (
            <div key={log.id} style={{
              background: 'white',
              borderRadius: '16px',
              padding: windowWidth <= 480 ? '1rem' : '1.5rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.2s',
              border: '2px solid #f3f4f6'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
              e.currentTarget.style.borderColor = '#667eea';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
              e.currentTarget.style.borderColor = '#f3f4f6';
            }}
            >
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '1rem',
                gap: '1rem',
                flexWrap: 'wrap'
              }}>
                <div style={{ flex: 1 }}>
                  {/* Worker Details - For Engineers */}
                  {userRole === 'site_engineer' && workerDetails[log.userId] && (
                    <div style={{
                      background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      marginBottom: '0.75rem',
                      border: '1px solid #a5b4fc'
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        marginBottom: '0.25rem'
                      }}>
                        <span style={{ fontSize: '1.25rem' }}>👷</span>
                        <strong style={{ color: '#3730a3', fontSize: '0.875rem' }}>
                          {workerDetails[log.userId].name}
                        </strong>
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#4f46e5',
                        marginLeft: '1.75rem'
                      }}>
                        📧 {workerDetails[log.userId].email}
                      </div>
                    </div>
                  )}
                  
                  <h3 style={{ 
                    margin: '0 0 0.5rem 0', 
                    fontSize: windowWidth <= 480 ? '1rem' : '1.125rem',
                    color: '#1f2937'
                  }}>
                    {new Date(log.date || log.createdAt).toLocaleDateString('en-US', { 
                      weekday: 'long',
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </h3>
                  <p style={{ 
                    fontSize: '0.75rem', 
                    color: '#6b7280',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    <span>🕐</span>
                    {new Date(log.createdAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  background: log.synced 
                    ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' 
                    : 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  color: log.synced ? '#065f46' : '#92400e',
                  border: log.synced ? '1px solid #6ee7b7' : '1px solid #fcd34d',
                  whiteSpace: 'nowrap'
                }}>
                  {log.synced ? '✓ Synced' : '⏱ Offline'}
                </span>
              </div>

              {/* Work Description */}
              <div style={{
                background: '#f9fafb',
                padding: '1rem',
                borderRadius: '8px',
                marginBottom: '1rem',
                border: '1px solid #e5e7eb'
              }}>
                <p style={{ 
                  margin: 0,
                  color: '#374151',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap'
                }}>
                  {log.workDescription}
                </p>
              </div>

              {/* Location */}
              {log.location && (
                <div style={{
                  background: '#eff6ff',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#1e40af'
                }}>
                  <span>📍</span>
                  <span>
                    {log.location.latitude.toFixed(4)}, {log.location.longitude.toFixed(4)}
                  </span>
                </div>
              )}

              {/* Photos */}
              {((log.photoUrls && log.photoUrls.length > 0) || (log.photoBase64 && log.photoBase64.length > 0)) && (
                <div>
                  <div style={{ 
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: '#6b7280',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    <span>📸</span>
                    Work Photos ({(log.photoUrls?.length || 0) + (log.photoBase64?.length || 0)})
                  </div>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: windowWidth <= 480 
                      ? 'repeat(2, 1fr)' 
                      : 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '0.5rem'
                  }}>
                    {/* Cloudinary URLs */}
                    {log.photoUrls && log.photoUrls.map((url, idx) => (
                      <a 
                        key={`url-${idx}`} 
                        href={url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ display: 'block' }}
                      >
                        <img 
                          src={url} 
                          alt={`Work photo ${idx + 1}`} 
                          style={{ 
                            width: '100%',
                            aspectRatio: '1',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            border: '2px solid #e5e7eb'
                          }}
                          onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                          onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                        />
                      </a>
                    ))}
                    {/* Base64 Images */}
                    {log.photoBase64 && log.photoBase64.map((base64, idx) => (
                      <div key={`base64-${idx}`} style={{ display: 'block' }}>
                        <img 
                          src={base64} 
                          alt={`Work photo ${idx + 1}`} 
                          style={{ 
                            width: '100%',
                            aspectRatio: '1',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            border: '2px solid #e5e7eb'
                          }}
                          onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                          onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default DailyWorkLogs;
