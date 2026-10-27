import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';

const DPR = () => {
  const { currentUser, userRole } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [location, setLocation] = useState(null);
    // Fetch location on mount (engineer only)
    useEffect(() => {
      if (userRole === 'site_engineer' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp
            });
          },
          (err) => {
            setLocation({ error: err.message });
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      }
    }, [userRole]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dprs, setDprs] = useState([]);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [photoPreview, setPhotoPreview] = useState([]);
  const [engineerDetails, setEngineerDetails] = useState({}); // For managers: userId -> engineer info

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (userRole === 'site_engineer') {
      loadProjects();
    }
    loadDPRs();
    const queue = localStorage.getItem('dprOfflineQueue');
    if (queue) {
      setOfflineQueue(JSON.parse(queue));
    }
  }, [currentUser, userRole]);

  useEffect(() => {
    if (userRole === 'manager' && dprs.length > 0) {
      loadEngineerDetails();
    }
  }, [dprs, userRole]);

  useEffect(() => {
    if (navigator.onLine && offlineQueue.length > 0) {
      syncOfflineQueue();
    }
  }, [navigator.onLine]);

  const loadProjects = async () => {
    try {
      const q = query(
        collection(db, 'projects'),
        where('assignedUsers', 'array-contains', currentUser.uid)
      );
      const snapshot = await getDocs(q);
      const projectsList = [];
      snapshot.forEach((doc) => {
        projectsList.push({ id: doc.id, ...doc.data() });
      });
      setProjects(projectsList);
      if (projectsList.length > 0 && !selectedProject) {
        setSelectedProject(projectsList[0].id);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const loadDPRs = async () => {
    try {
      let q;
      if (userRole === 'manager') {
        // Managers see all DPRs
        q = query(collection(db, 'dprs'));
      } else {
        // Engineers see only their own DPRs
        q = query(
          collection(db, 'dprs'),
          where('createdBy', '==', currentUser.uid)
        );
      }
      
      const snapshot = await getDocs(q);
      const dprsList = [];
      snapshot.forEach((doc) => {
        dprsList.push({ id: doc.id, ...doc.data() });
      });
      setDprs(dprsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (error) {
      console.error('Error loading DPRs:', error);
    }
  };

  const loadEngineerDetails = async () => {
    try {
      const uniqueUserIds = [...new Set(dprs.map(dpr => dpr.createdBy))];
      const details = {};
      
      for (const userId of uniqueUserIds) {
        if (!engineerDetails[userId]) {
          try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              details[userId] = {
                name: userData.name || userData.email || 'Unknown',
                email: userData.email || 'N/A',
                role: userData.role || 'site_engineer'
              };
            } else {
              details[userId] = {
                name: 'Unknown Engineer',
                email: 'N/A',
                role: 'site_engineer'
              };
            }
          } catch (error) {
            console.error(`Error loading engineer details for ${userId}:`, error);
            details[userId] = {
              name: 'Unknown Engineer',
              email: 'N/A',
              role: 'site_engineer'
            };
          }
        } else {
          details[userId] = engineerDetails[userId];
        }
      }
      
      setEngineerDetails(prev => ({ ...prev, ...details }));
    } catch (error) {
      console.error('Error loading engineer details:', error);
    }
  };

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    setPhotos(files);
    
    // Create preview URLs
    const previews = files.map(file => URL.createObjectURL(file));
    setPhotoPreview(previews);
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
        formData.append('folder', `dprs/${currentUser.uid}`); // Organize by user
        
        console.log(`Uploading DPR photo ${i + 1} to Cloudinary...`);
        
        // Upload to Cloudinary
        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          {
            method: 'POST',
            body: formData
          }
        );
        
        const responseText = await response.text();
        
        if (!response.ok) {
          let errorData;
          try {
            errorData = JSON.parse(responseText);
          } catch (e) {
            errorData = { error: { message: responseText } };
          }
          
          const errorMessage = errorData.error?.message || `Upload failed with status ${response.status}`;
          console.error(`Cloudinary upload error for DPR photo ${i + 1}:`, errorData);
          throw new Error(errorMessage);
        }
        
        const data = JSON.parse(responseText);
        if (data.secure_url) {
          photoUrls.push(data.secure_url);
          console.log(`✓ DPR Photo ${i + 1} uploaded successfully`);
        } else {
          throw new Error('No URL returned from Cloudinary');
        }
      } catch (error) {
        console.error(`Error uploading DPR photo ${i + 1}:`, error);
        errors.push(`Photo ${i + 1}: ${error.message || 'Unknown error'}`);
      }
    }
    
    if (errors.length > 0) {
      console.warn('Some DPR photos failed to upload:', errors);
      console.log(`Successfully uploaded ${photoUrls.length} out of ${photoFiles.length} photos`);
    }
    
    return photoUrls;
  };

  const syncOfflineQueue = async () => {
    if (!navigator.onLine) return;
    const queue = JSON.parse(localStorage.getItem('dprOfflineQueue') || '[]');
    if (queue.length === 0) return;
    
    for (const item of queue) {
      try {
        await addDoc(collection(db, 'dprs'), {
          ...item,
          photoUrls: [],
          synced: true,
          syncedAt: serverTimestamp()
        });
      } catch (error) {
        console.error('Error syncing offline DPR:', error);
      }
    }
    localStorage.removeItem('dprOfflineQueue');
    setOfflineQueue([]);
    loadDPRs();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProject) {
      alert('Please select a project');
      return;
    }

    setLoading(true);
    const dprData = {
      projectId: selectedProject,
      projectName: projects.find(p => p.id === selectedProject)?.name || '',
      workDescription,
      createdBy: currentUser.uid,
      createdAt: new Date().toISOString(),
      synced: navigator.onLine,
      location: location && !location.error ? location : null
    };

    try {
      if (navigator.onLine) {
        let photoUrls = [];
        if (photos.length > 0) {
          try {
            photoUrls = await uploadPhotos(photos);
          } catch (error) {
            console.error('Photo upload error:', error);
            alert('Warning: Photos could not be uploaded to Cloudinary, but DPR will be saved.');
          }
        }
        
        // Build document data, only including photoUrls if they have values
        const documentData = {
          ...dprData,
          synced: true
        };
        
        if (photoUrls.length > 0) {
          documentData.photoUrls = photoUrls;
        }
        
        await addDoc(collection(db, 'dprs'), documentData);
      } else {
        const queue = JSON.parse(localStorage.getItem('dprOfflineQueue') || '[]');
        queue.push({
          ...dprData,
          photoCount: photos.length
        });
        localStorage.setItem('dprOfflineQueue', JSON.stringify(queue));
        setOfflineQueue(queue);
        alert('DPR saved offline (photos will be lost). Will sync when connection is restored.');
      }

      setWorkDescription('');
      setPhotos([]);
      setPhotoPreview([]);
      loadDPRs();
    } catch (error) {
      console.error('Error saving DPR:', error);
      alert('Failed to save DPR');
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
        <h1 style={{ margin: 0, fontSize: windowWidth <= 480 ? '1.5rem' : '2rem' }}>
          {userRole === 'manager' ? '👷 Engineers\' DPRs' : '📝 Daily Progress Report'}
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

      {/* Offline Queue Warning - Only for Engineers */}
      {userRole === 'site_engineer' && offlineQueue.length > 0 && (
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
              {offlineQueue.length} DPR(s) pending sync
            </strong>
            <p style={{ fontSize: '0.875rem', color: '#78350f', margin: '0.25rem 0 0 0' }}>
              Reports will be synced when connection is restored
            </p>
          </div>
        </div>
      )}

      {/* Create DPR Form - Only for Engineers */}
      {userRole === 'site_engineer' && (
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
          Create New DPR
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Project Selection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#374151',
              fontSize: '0.875rem'
            }}>
              Project *
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ 
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '1.25rem',
                color: '#9ca3af',
                pointerEvents: 'none'
              }}>
                🏗️
              </span>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                required
                style={{ 
                  paddingLeft: '3rem',
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 3rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                  background: 'white'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              >
                <option value="">Select Project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            {projects.length === 0 && (
              <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>
                No projects assigned. Contact your manager.
              </p>
            )}
          </div>

          {/* Location (Auto) */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#374151',
              fontSize: '0.875rem'
            }}>
              Location (Auto-fetched)
            </label>
            <div style={{
              background: '#f9fafb',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              padding: '0.75rem',
              fontSize: '0.95rem',
              color: location && !location.error ? '#2563eb' : '#ef4444',
              marginBottom: '0.25rem'
            }}>
              {location && !location.error
                ? `Lat: ${location.latitude.toFixed(6)}, Lng: ${location.longitude.toFixed(6)} (±${location.accuracy}m)`
                : location && location.error
                ? `Location error: ${location.error}`
                : 'Fetching location...'}
            </div>
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#374151',
              fontSize: '0.875rem'
            }}>
              Work Description *
            </label>
            <textarea
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              rows={windowWidth <= 480 ? 4 : 6}
              placeholder="Describe today's work progress in detail..."
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
              Photos (Optional - Max 10MB, uploaded to Cloudinary)
            </label>
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

          {/* Submit Button */}
          <button 
            type="submit" 
            disabled={loading || projects.length === 0}
            style={{
              width: '100%',
              padding: '1rem',
              background: (loading || projects.length === 0)
                ? '#9ca3af' 
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: (loading || projects.length === 0) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: (loading || projects.length === 0) ? 'none' : '0 4px 12px rgba(102, 126, 234, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
            onMouseEnter={(e) => {
              if (!loading && projects.length > 0) e.target.style.transform = 'translateY(-2px)';
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
                Saving DPR...
              </>
            ) : (
              <>
                <span style={{ fontSize: '1.25rem' }}>💾</span>
                Save DPR
              </>
            )}
          </button>
        </form>
      </div>
      )}

      {/* Recent DPRs / All Engineers' DPRs */}
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
          {userRole === 'manager' ? 'All Engineers\' DPRs' : 'Recent DPRs'}
        </h2>
        {userRole === 'manager' && (
          <p style={{ 
            fontSize: '0.875rem', 
            color: '#6b7280', 
            marginTop: '0.25rem',
            marginBottom: '1rem'
          }}>
            Review daily progress reports submitted by engineers
          </p>
        )}
      </div>

      {dprs.length === 0 ? (
  /* --- IMPROVED EMPTY STATE --- */
  <div style={{
    background: 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(10px)',
    borderRadius: '24px',
    padding: windowWidth <= 480 ? '3rem 1.5rem' : '5rem 2rem',
    border: '1px solid rgba(229, 231, 235, 0.5)',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05)',
    textAlign: 'center'
  }}>
    <div style={{ 
      fontSize: '4rem', 
      marginBottom: '1rem',
      filter: 'drop-shadow(0 10px 8px rgba(0,0,0,0.1))'
    }}>📂</div>
    <h3 style={{ color: '#111827', fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.5rem' }}>
      {userRole === 'manager' ? 'All clear!' : 'No reports yet'}
    </h3>
    <p style={{ color: '#6b7280', fontSize: '1rem', maxWidth: '300px', margin: '0 auto', lineHeight: '1.5' }}>
      {userRole === 'manager' 
        ? 'DPRs will appear here as soon as engineers submit their daily progress.'
        : 'Your journey starts here. Submit your first daily progress report today.'}
    </p>
  </div>
) : (
  /* --- IMPROVED GRID CONTAINER --- */
  <div
    style={{
      display: 'grid',
      gap: '1.5rem',
      gridTemplateColumns:
        windowWidth <= 480
          ? '1fr'
          : windowWidth <= 900
          ? 'repeat(2, 1fr)'
          : 'repeat(3, 1fr)',
      alignItems: 'stretch',
      width: '100%',
    }}
  >
    {dprs.map((dpr) => (
      <div key={dpr.id} style={{
        background: 'white',
        borderRadius: '20px',
        padding: windowWidth <= 480 ? '1.25rem' : '1.75rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 10px 15px -3px rgba(0,0,0,0.03)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        border: '1px solid #f3f4f6',
        position: 'relative',
        overflow: 'hidden'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02), 0 10px 15px -3px rgba(0,0,0,0.03)';
      }}
      >
        {/* Top Accent Bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: dpr.synced ? '#10b981' : '#f59e0b'
        }} />

        {/* --- HEADER SECTION --- */}
        <div style={{ 
          display: 'flex', 
          flexDirection: windowWidth <= 600 ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: windowWidth <= 600 ? 'flex-start' : 'center',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ flex: 1 }}>
            {/* User Badge for Managers */}
            {userRole === 'manager' && engineerDetails[dpr.createdBy] && (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: '#f3f4f6',
                padding: '0.4rem 0.8rem',
                borderRadius: '100px',
                marginBottom: '0.75rem',
                border: '1px solid #e5e7eb'
              }}>
                <span style={{ fontSize: '1rem' }}>👷</span>
                <span style={{ fontWeight: '600', fontSize: '0.8rem', color: '#374151' }}>
                  {engineerDetails[dpr.createdBy].name}
                </span>
              </div>
            )}
            
            <h3 style={{ 
              margin: '0 0 0.35rem 0', 
              fontSize: '1.25rem',
              fontWeight: '700',
              color: '#111827',
              letterSpacing: '-0.025em'
            }}>
              {dpr.projectName}
            </h3>
            
            <div style={{ display: 'flex', gap: '1rem', color: '#6b7280', fontSize: '0.8rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                📅 {new Date(dpr.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              {dpr.location && dpr.location.latitude && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  📍 {dpr.location.latitude.toFixed(5)}, {dpr.location.longitude.toFixed(5)}
                </span>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                🕒 {new Date(dpr.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Sync Status Badge */}
          <div style={{
            padding: '0.4rem 0.75rem',
            borderRadius: '8px',
            fontSize: '0.75rem',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            background: dpr.synced ? '#ecfdf5' : '#fffbeb',
            color: dpr.synced ? '#065f46' : '#92400e',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}>
            <span style={{ 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%', 
              background: dpr.synced ? '#10b981' : '#f59e0b' 
            }} />
            {dpr.synced ? 'Synced' : 'Offline'}
          </div>
        </div>

        {/* --- DESCRIPTION BOX --- */}
        {/* --- CONTENT SECTION: Desktop par Row, Mobile par Column --- */}
{/* --- Ready to Paste: Description & Photos Section --- */}
<div style={{
  display: 'flex',
  flexDirection: windowWidth <= 768 ? 'column' : 'row',
  gap: '1.25rem',
  alignItems: 'stretch', // Dono side ki height equal rakhta hai
  marginTop: '1rem'
}}>
  
  {/* 1. Left Side: Description Text */}
  <div style={{
    flex: 1, 
    background: '#f8fafc',
    padding: '0.5rem',
    borderRadius: '12px',
    border: '1px solid #f1f5f9',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  }}>
    <p style={{ 
      margin: 0, 
      color: '#374151', 
      lineHeight: '1.6', 
      fontSize: '0.95rem',
      whiteSpace: 'pre-wrap'
    }}>
      {dpr.workDescription}
    </p>
  </div>

  {/* 2. Right Side: Photo Container */}
  {dpr.photoUrls && dpr.photoUrls.length > 0 && (
    <div style={{ 
      width: windowWidth <= 768 ? '100%' : '140px', // Desktop par narrow width takki bahar na nikle
      flexShrink: 0 // Desktop par photos ko squeeze hone se rokta hai
    }}>
      <div style={{ 
        fontSize: '0.7rem',
        fontWeight: '800',
        color: '#94a3b8',
        marginBottom: '0.5rem',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        📸 Photos ({dpr.photoUrls.length})
      </div>
      
      <div style={{ 
        display: 'grid', 
        // Agar desktop par 1 photo hai to badi dikhegi, zyada hai to grid banega
        gridTemplateColumns: dpr.photoUrls.length > 1 ? 'repeat(2, 1fr)' : '1fr',
        gap: '6px'
      }}>
        {dpr.photoUrls.map((url, idx) => (
          <a key={idx} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
            <img 
              src={url} 
              alt="Work" 
              style={{ 
                width: '100%',
                aspectRatio: '1',
                objectFit: 'cover',
                borderRadius: '10px',
                border: '1.5px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
            />
          </a>
        ))}
      </div>
    </div>
  )}
</div>
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

export default DPR;