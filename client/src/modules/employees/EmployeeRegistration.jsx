import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import QRCode from 'qrcode';

const EmployeeRegistration = () => {
  const { currentUser } = useAuth();
  const [formData, setFormData] = useState({
    empId: '',
    name: '',
    mobile: '',
    email: '',
    address: '',
    photo: null
  });
  const [currentPhoto, setCurrentPhoto] = useState(null);
  const [videoStream, setVideoStream] = useState(null);
  const [loading, setLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [idCardVisible, setIdCardVisible] = useState(false);
  const [employees, setEmployees] = useState([]);
  const videoRef = useRef(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    generateEmployeeId();
    loadEmployees();
  }, []);

  const generateEmployeeId = () => {
    const prefix = 'EMP';
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    const empId = prefix + randomNum;
    setFormData(prev => ({ ...prev, empId }));
  };

  const loadEmployees = async () => {
    try {
      const q = query(collection(db, 'employees'));
      const snapshot = await getDocs(q);
      const employeesList = [];
      snapshot.forEach((doc) => {
        employeesList.push({ id: doc.id, ...doc.data() });
      });
      setEmployees(employeesList.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      }));
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      setVideoStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert('Error accessing camera: ' + err.message);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !videoStream) {
      alert('Please start the camera first');
      return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
    
    const photoDataUrl = canvas.toDataURL('image/jpeg');
    setCurrentPhoto(photoDataUrl);
    setFormData(prev => ({ ...prev, photo: photoDataUrl }));
    stopCamera();
  };

  const stopCamera = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const photoDataUrl = e.target.result;
        setCurrentPhoto(photoDataUrl);
        setFormData(prev => ({ ...prev, photo: photoDataUrl }));
      };
      reader.readAsDataURL(file);
    }
  };

  const generateQRCode = async (employeeData) => {
    try {
      const qrData = JSON.stringify({
        empId: employeeData.empId,
        name: employeeData.name,
        mobile: employeeData.mobile,
        email: employeeData.email
      });
      const qrUrl = await QRCode.toDataURL(qrData, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrCodeUrl(qrUrl);
      return qrUrl;
    } catch (error) {
      console.error('Error generating QR code:', error);
      alert('Error generating QR code');
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.photo) {
      alert('Please capture or upload employee photo');
      return;
    }

    if (!formData.name || !formData.mobile || !formData.address) {
      alert('Please fill all required fields');
      return;
    }

    setLoading(true);

    try {
      // Generate QR code
      const qrUrl = await generateQRCode(formData);
      if (!qrUrl) {
        setLoading(false);
        return;
      }

      // Save to Firebase
      const employeeData = {
        ...formData,
        qrCode: qrUrl,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'employees'), employeeData);
      
      alert('Employee registered successfully!');
      
      // Show ID card
      setIdCardVisible(true);
      
      // Reset form
      setFormData({
        empId: '',
        name: '',
        mobile: '',
        email: '',
        address: '',
        photo: null
      });
      setCurrentPhoto(null);
      generateEmployeeId();
      loadEmployees();
    } catch (error) {
      console.error('Error registering employee:', error);
      alert('Error registering employee: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadIDCard = () => {
    const idCard = document.getElementById('idCard');
    if (!idCard) return;

    // Use html2canvas if available, otherwise alert
    if (window.html2canvas) {
      window.html2canvas(idCard).then(canvas => {
        const link = document.createElement('a');
        link.download = `ID_Card_${formData.empId}.png`;
        link.href = canvas.toDataURL();
        link.click();
      });
    } else {
      alert('Download feature requires html2canvas library. Please use Print instead.');
    }
  };

  const printIDCard = () => {
    window.print();
  };

  const resetForm = () => {
    setFormData({
      empId: '',
      name: '',
      mobile: '',
      email: '',
      address: '',
      photo: null
    });
    setCurrentPhoto(null);
    setIdCardVisible(false);
    setQrCodeUrl('');
    generateEmployeeId();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ 
      width: '100%',
      maxWidth: '100%',
      padding: windowWidth <= 768 ? '1rem' : '2rem',
      boxSizing: 'border-box'
    }}>
      <h1 style={{ 
        margin: '0 0 2rem 0', 
        fontSize: windowWidth <= 480 ? '1.5rem' : '2rem',
        color: '#1f2937'
      }}>
        Worker Registration
      </h1>

      <form onSubmit={handleSubmit} style={{
        background: 'white',
        borderRadius: '16px',
        padding: windowWidth <= 480 ? '1.5rem' : '2rem',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        marginBottom: '2rem'
      }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: windowWidth <= 480 ? '1fr' : '1fr 1fr',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          <div>
            <label style={{ 
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#374151',
              fontSize: '0.875rem'
            }}>
              Worker ID
            </label>
            <input
              type="text"
              value={formData.empId}
              readOnly
              style={{ 
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
                backgroundColor: '#f9fafb'
              }}
            />
          </div>
          <div>
            <label style={{ 
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#374151',
              fontSize: '0.875rem'
            }}>
              Full Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter full name"
              required
              style={{ 
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem'
              }}
            />
          </div>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: windowWidth <= 480 ? '1fr' : '1fr 1fr',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          <div>
            <label style={{ 
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#374151',
              fontSize: '0.875rem'
            }}>
              Mobile Number *
            </label>
            <input
              type="tel"
              value={formData.mobile}
              onChange={(e) => setFormData(prev => ({ ...prev, mobile: e.target.value }))}
              placeholder="Enter mobile number"
              required
              pattern="[0-9]{10}"
              style={{ 
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem'
              }}
            />
          </div>
          <div>
            <label style={{ 
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#374151',
              fontSize: '0.875rem'
            }}>
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="Enter email"
              style={{ 
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem'
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: '600',
            color: '#374151',
            fontSize: '0.875rem'
          }}>
            Address *
          </label>
          <textarea
            value={formData.address}
            onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
            placeholder="Enter complete address"
            required
            rows="3"
            style={{ 
              width: '100%',
              padding: '0.75rem',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '1rem',
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
          />
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          margin: '16px 0',
          padding: '16px',
          background: '#f8fafc',
          borderRadius: '8px'
        }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#3730a3' }}>Employee Photo</h4>
          {currentPhoto && (
            <img 
              src={currentPhoto} 
              alt="Employee" 
              style={{
                width: '150px',
                height: '150px',
                borderRadius: '8px',
                objectFit: 'cover',
                border: '3px solid #c7d2fe'
              }}
            />
          )}
          <video 
            ref={videoRef}
            autoPlay
            style={{
              width: '100%',
              maxWidth: '320px',
              borderRadius: '8px',
              display: videoStream ? 'block' : 'none'
            }}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button 
              type="button"
              onClick={startCamera}
              style={{
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Open Camera
            </button>
            <button 
              type="button"
              onClick={capturePhoto}
              disabled={!videoStream}
              style={{
                background: videoStream ? '#2563eb' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: videoStream ? 'pointer' : 'not-allowed'
              }}
            >
              Capture Photo
            </button>
            <button 
              type="button"
              onClick={stopCamera}
              disabled={!videoStream}
              style={{
                background: videoStream ? '#2563eb' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: videoStream ? 'pointer' : 'not-allowed'
              }}
            >
              Close Camera
            </button>
            <input 
              type="file" 
              id="photoUpload" 
              accept="image/*" 
              style={{ display: 'none' }} 
              onChange={handleFileUpload}
            />
            <button 
              type="button"
              onClick={() => document.getElementById('photoUpload').click()}
              style={{
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Upload Photo
            </button>
          </div>
        </div>

        <button 
          type="submit"
          disabled={loading}
          style={{
            width: '25%',
            padding: '1rem',
            background: loading ? '#9ca3af' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: '16px'
          }}
        >
          {loading ? 'Registering...' : 'Generate ID Card'}
        </button>
      </form>

      {idCardVisible && formData.photo && (
        <div id="idCard" style={{
          background: '#2563eb',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '400px',
          margin: '0 auto 32px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.5rem', textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>
              EMPLOYEE ID CARD
            </h3>
            <p style={{ margin: 0, opacity: 0.9, fontSize: '0.9rem' }}>SiteSync</p>
          </div>
          
          <img 
            src={formData.photo} 
            alt="Employee" 
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '4px solid #fff',
              display: 'block',
              margin: '0 auto 16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
          />
          
          <div style={{
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(10px)',
            padding: '16px',
            borderRadius: '12px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', marginBottom: '8px', fontSize: '0.95rem' }}>
              <span style={{ fontWeight: '600', minWidth: '100px', opacity: 0.9 }}>Name:</span>
              <span style={{ flex: 1 }}>{formData.name}</span>
            </div>
            <div style={{ display: 'flex', marginBottom: '8px', fontSize: '0.95rem' }}>
              <span style={{ fontWeight: '600', minWidth: '100px', opacity: 0.9 }}>ID:</span>
              <span style={{ flex: 1 }}>{formData.empId}</span>
            </div>
            <div style={{ display: 'flex', marginBottom: '8px', fontSize: '0.95rem' }}>
              <span style={{ fontWeight: '600', minWidth: '100px', opacity: 0.9 }}>Mobile:</span>
              <span style={{ flex: 1 }}>{formData.mobile}</span>
            </div>
            <div style={{ display: 'flex', marginBottom: '8px', fontSize: '0.95rem' }}>
              <span style={{ fontWeight: '600', minWidth: '100px', opacity: 0.9 }}>Email:</span>
              <span style={{ flex: 1 }}>{formData.email || 'N/A'}</span>
            </div>
            <div style={{ display: 'flex', fontSize: '0.95rem' }}>
              <span style={{ fontWeight: '600', minWidth: '100px', opacity: 0.9 }}>Address:</span>
              <span style={{ flex: 1 }}>{formData.address}</span>
            </div>
          </div>

          {qrCodeUrl && (
            <div style={{
              background: '#fff',
              padding: '12px',
              borderRadius: '12px',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <img src={qrCodeUrl} alt="QR Code" style={{ width: '150px', height: '150px' }} />
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px', flexWrap: 'wrap' }}>
            <button 
              onClick={downloadIDCard}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                border: '2px solid #fff',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Download ID Card
            </button>
            <button 
              onClick={printIDCard}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                border: '2px solid #fff',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Print ID Card
            </button>
            <button 
              onClick={resetForm}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#fff',
                border: '2px solid #fff',
                borderRadius: '6px',
                padding: '10px 20px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Create New
            </button>
          </div>
        </div>
      )}

      {employees.length > 0 && (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: windowWidth <= 480 ? '1.5rem' : '2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ margin: '0 0 1.5rem 0', color: '#1f2937' }}>Registered Employees</h2>
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
            {employees.map((emp) => (
              <div
                key={emp.id}
                style={{
                  padding: '1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  background: '#f9fafb',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  minHeight: '120px',
                }}
              >
                <div style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.25rem' }}>{emp.name}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  ID: {emp.empId} | Mobile: {emp.mobile}
                </div>
                {emp.qrCode && (
                  <img src={emp.qrCode} alt="QR Code" style={{ width: '80px', height: '80px', alignSelf: 'flex-end' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeRegistration;
