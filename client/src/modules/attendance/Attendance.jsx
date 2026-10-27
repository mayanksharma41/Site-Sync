import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';

const Attendance = () => {
  const { currentUser, userRole } = useAuth();
  const [scannerActive, setScannerActive] = useState(false);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const scannerRef = useRef(null);
  const [Html5Qrcode, setHtml5Qrcode] = useState(null);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Load html5-qrcode library
    if (userRole === 'worker') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';
      script.async = true;
      script.onload = () => {
        if (window.Html5Qrcode) {
          setHtml5Qrcode(() => window.Html5Qrcode);
        }
      };
      document.body.appendChild(script);
      return () => {
        document.body.removeChild(script);
      };
    }
  }, [userRole]);

  useEffect(() => {
    if (userRole === 'site_engineer') {
      loadAttendanceLogs();
    }
  }, [userRole]);

  const loadAttendanceLogs = async () => {
    try {
      const q = query(collection(db, 'attendance'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logs = [];
        snapshot.forEach((doc) => {
          logs.push({ id: doc.id, ...doc.data() });
        });
        setAttendanceLogs(logs.sort((a, b) => {
          const dateA = a.timestamp?.toDate?.() || new Date(a.timestamp);
          const dateB = b.timestamp?.toDate?.() || new Date(b.timestamp);
          return dateB - dateA;
        }));
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Error loading attendance logs:', error);
    }
  };

  const startScanner = async () => {
    if (!Html5Qrcode) {
      alert('QR Scanner library is loading. Please wait a moment and try again.');
      return;
    }
    // Check if scanner div is present
    if (!document.getElementById('reader')) {
      alert('Scanner area not ready. Please wait and try again.');
      return;
    }
    // Check for camera support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera not supported on this device/browser');
      return;
    }

    try {
      setScannerActive(true);
      const html5QrCode = new Html5Qrcode('reader');

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 400, height: 400 }
        },
        async (decodedText) => {
          // Stop scanner before processing to avoid conflicts
          try {
            await html5QrCode.stop();
          } catch (stopErr) {
            // Ignore stop errors - scanner might already be stopped
            console.log('Scanner stop note:', stopErr);
          }
          // Add a short delay before hiding the scanner to avoid play() interruption error
          setTimeout(() => {
            setScannerActive(false);
            scannerRef.current = null;
          }, 200);
          // Process QR scan after stopping scanner
          await handleQRScan(decodedText);
        },
        (errorMessage) => {
          // Ignore scan errors
        }
      );
      scannerRef.current = html5QrCode;
    } catch (err) {
      console.error('Error starting scanner:', err);
      let errorMsg = 'Unknown error';
      if (err && typeof err === 'object') {
        errorMsg = err.message || JSON.stringify(err);
      } else if (typeof err === 'string') {
        errorMsg = err;
      }
      alert('Error starting scanner: ' + errorMsg + '\n\nPossible causes: camera permission denied, camera in use, or QR library not loaded.');
      setScannerActive(false);
      scannerRef.current = null;
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        // Ignore errors if scanner is already stopped
        console.log('Scanner stop note:', err.message);
      }
      scannerRef.current = null;
    }
    // Add a short delay before hiding the scanner to avoid play() interruption error
    setTimeout(() => {
      setScannerActive(false);
    }, 200);
  };

  const handleQRScan = async (decodedText) => {
    try {
      const employeeData = JSON.parse(decodedText);
      
      if (!employeeData.empId || !employeeData.name) {
        alert('Invalid QR code format');
        return;
      }

      // Check if employee exists in Firebase
      const empQuery = query(
        collection(db, 'employees'),
        where('empId', '==', employeeData.empId)
      );
      const empSnapshot = await getDocs(empQuery);
      
      if (empSnapshot.empty) {
        alert('Employee not found in system');
        return;
      }

      const employee = { id: empSnapshot.docs[0].id, ...empSnapshot.docs[0].data() };

      // Check if already marked today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('empId', '==', employeeData.empId),
        where('date', '==', todayStr)
      );
      const attendanceSnapshot = await getDocs(attendanceQuery);

      if (!attendanceSnapshot.empty) {
        alert(`Attendance already marked for ${employeeData.name} today!`);
        return;
      }

      // Mark attendance
      const timestamp = new Date();
      const attendanceData = {
        empId: employee.empId,
        employeeName: employee.name,
        employeeMobile: employee.mobile,
        employeeEmail: employee.email,
        employeeAddress: employee.address,
        employeePhoto: employee.photo,
        timestamp: serverTimestamp(),
        date: todayStr,
        time: timestamp.toLocaleTimeString(),
        markedBy: currentUser.uid
      };

      await addDoc(collection(db, 'attendance'), attendanceData);
      
      alert(`Attendance marked successfully!\n\nName: ${employee.name}\nID: ${employee.empId}\nTime: ${attendanceData.time}`);
      
      if (userRole === 'site_engineer') {
        loadAttendanceLogs();
      }
    } catch (err) {
      console.error('Error processing QR scan:', err);
      if (err.message.includes('JSON')) {
        alert('Invalid QR code format');
      } else {
        alert('Error marking attendance: ' + err.message);
      }
    }
  };

  const exportAttendance = () => {
    if (attendanceLogs.length === 0) {
      alert('No attendance records to export');
      return;
    }

    const csv = [
      ['Employee ID', 'Name', 'Mobile', 'Date', 'Time'],
      ...attendanceLogs.map(log => [
        log.empId,
        log.employeeName,
        log.employeeMobile || '',
        log.date,
        log.time
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Worker View - QR Scanner
  if (userRole === 'worker') {
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
          color: '#1f2937',
          textAlign: 'center'
        }}>
          📱 QR Attendance Scanner
        </h1>

        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: windowWidth <= 480 ? '1.5rem' : '2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          marginBottom: '2rem',
          textAlign: 'center'
        }}>
          <p style={{ 
            marginBottom: '1.5rem', 
            color: '#6b7280',
            fontSize: windowWidth <= 480 ? '0.875rem' : '1rem'
          }}>
            Scan your employee QR code to mark attendance
          </p>

          <div 
            id="reader" 
            style={{
              margin: '0 auto 24px',
              background: '#f9fafb',
              border: '2px dashed #d1d5db',
              borderRadius: '12px',
              width: windowWidth <= 480 ? '100%' : '270px',
              height: '270px',
              display: scannerActive ? 'block' : 'none',
              position: 'relative',
              overflow: 'hidden'
            }}
          ></div>

          {!scannerActive && (
            <div style={{
              background: '#f9fafb',
              border: '2px dashed #d1d5db',
              borderRadius: '12px',
              width: windowWidth <= 480 ? '100%' : '270px',
              height: '270px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: '1rem',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ fontSize: '4rem' }}>📷</div>
              <p style={{ color: '#6b7280', fontSize: '1rem' }}>
                Click "Start Scanner" to begin scanning QR codes
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={startScanner}
              disabled={scannerActive || !Html5Qrcode}
              style={{
                padding: '12px 24px',
                background: scannerActive || !Html5Qrcode
                  ? '#9ca3af'
                  : 'linear-gradient(90deg, #6366f1 0%, #818cf8 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: scannerActive || !Html5Qrcode ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {Html5Qrcode ? 'Start Scanner' : 'Loading Scanner...'}
            </button>
            <button
              onClick={stopScanner}
              disabled={!scannerActive}
              style={{
                padding: '12px 24px',
                background: scannerActive
                  ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)'
                  : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: scannerActive ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s'
              }}
            >
              Stop Scanner
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Site Engineer View - Attendance Logs
  return (
    <div style={{ 
      width: '100%',
      maxWidth: '100%',
      padding: windowWidth <= 768 ? '1rem' : '2rem',
      boxSizing: 'border-box'
    }}>
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
          color: '#1f2937'
        }}>
          👥 Worker Attendance Logs
        </h1>
        <button
          onClick={exportAttendance}
          disabled={attendanceLogs.length === 0}
          style={{
            padding: '0.75rem 1.5rem',
            background: attendanceLogs.length === 0
              ? '#9ca3af'
              : 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            fontWeight: '600',
            cursor: attendanceLogs.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Export to CSV
        </button>
      </div>

      {attendanceLogs.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '3rem 2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
          <p style={{ color: '#6b7280' }}>No attendance records yet</p>
        </div>
      ) : (
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
          {attendanceLogs.map((log) => (
            <div key={log.id} style={{
              background: 'white',
              borderRadius: '16px',
              padding: windowWidth <= 480 ? '1rem' : '1.5rem',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              display: 'grid',
              gridTemplateColumns: windowWidth <= 480 ? '1fr' : '2fr 1fr 2fr',
              gap: '12px',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.25rem', fontSize: windowWidth <= 480 ? '0.875rem' : '1rem' }}>
                  {log.employeeName}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  ID: {log.empId} | Mobile: {log.employeeMobile || 'N/A'}
                </div>
                {log.employeeEmail && (
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                    {log.employeeEmail}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#64748b', textAlign: windowWidth <= 480 ? 'left' : 'center' }}>
                {log.employeeMobile || 'N/A'}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#475569', textAlign: windowWidth <= 480 ? 'left' : 'right' }}>
                <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                  {log.date}
                </div>
                <div>
                  {log.time}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Attendance;
