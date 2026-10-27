import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  orderBy
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import QRCode from 'qrcode';

const ToolLibrary = () => {
  const { currentUser, userRole } = useAuth();
  const isSiteEngineer = userRole === 'site_engineer';
  const isWorker = userRole === 'worker';

  // Tool Management States (Site Engineer Only)
  const [tools, setTools] = useState([]);
  const [toolFormData, setToolFormData] = useState({
    name: '',
    category: '',
    description: ''
  });
  const [showAddTool, setShowAddTool] = useState(false);
  const [loading, setLoading] = useState(false);

  // Worker Checkout Request States
  const [scannerActive, setScannerActive] = useState(false);
  const [manualToolId, setManualToolId] = useState('');
  const [selectedTool, setSelectedTool] = useState(null);
  const [checkoutRequests, setCheckoutRequests] = useState([]);
  const [returnRequests, setReturnRequests] = useState([]);

  // Transaction History
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState(isWorker ? 'scan' : 'tools'); // 'tools', 'scan', 'requests', 'returns', 'history'

  const scannerRef = useRef(null);
  const [Html5Qrcode, setHtml5Qrcode] = useState(null);

  useEffect(() => {
    // Load html5-qrcode library for scanning
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
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    loadTools();
    loadTransactions();
    if (isSiteEngineer) {
      loadCheckoutRequests();
      loadReturnRequests();
    }
  }, [isSiteEngineer]);

  const generateToolId = () => {
    const prefix = 'TOOL';
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return prefix + randomNum;
  };

  const loadTools = async () => {
    try {
      const q = query(collection(db, 'tools'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const toolsList = [];
        snapshot.forEach((doc) => {
          toolsList.push({ id: doc.id, ...doc.data() });
        });
        setTools(toolsList);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Error loading tools:', error);
    }
  };

  const loadTransactions = async () => {
    try {
      const q = query(collection(db, 'toolTransactions'), orderBy('checkoutDate', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const transactionsList = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          transactionsList.push({
            id: doc.id,
            ...data,
            checkoutDate: data.checkoutDate?.toDate?.() || new Date(data.checkoutDate),
            returnDate: data.returnDate?.toDate?.() || (data.returnDate ? new Date(data.returnDate) : null)
          });
        });
        setTransactions(transactionsList);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  const loadCheckoutRequests = async () => {
    try {
      const q = query(
        collection(db, 'toolCheckoutRequests'),
        where('status', '==', 'pending'),
        orderBy('requestedAt', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const requestsList = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          requestsList.push({
            id: doc.id,
            ...data,
            requestedAt: data.requestedAt?.toDate?.() || new Date(data.requestedAt)
          });
        });
        setCheckoutRequests(requestsList);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Error loading checkout requests:', error);
    }
  };

  const loadReturnRequests = async () => {
    try {
      const q = query(
        collection(db, 'toolReturnRequests'),
        where('status', '==', 'pending'),
        orderBy('requestedAt', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const requestsList = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          requestsList.push({
            id: doc.id,
            ...data,
            requestedAt: data.requestedAt?.toDate?.() || new Date(data.requestedAt)
          });
        });
        setReturnRequests(requestsList);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Error loading return requests:', error);
    }
  };

  const generateQRCode = async (toolData) => {
    try {
      const qrData = JSON.stringify({
        toolId: toolData.toolId,
        name: toolData.name
      });
      const qrUrl = await QRCode.toDataURL(qrData, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      return qrUrl;
    } catch (error) {
      console.error('Error generating QR code:', error);
      return null;
    }
  };

  const handleAddTool = async (e) => {
    e.preventDefault();
    if (!toolFormData.name || !toolFormData.category) {
      alert('Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      const toolId = generateToolId();
      const toolData = {
        ...toolFormData,
        toolId,
        status: 'available',
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      };

      const qrUrl = await generateQRCode({ ...toolData, toolId });
      if (qrUrl) {
        toolData.qrCode = qrUrl;
      }

      await addDoc(collection(db, 'tools'), toolData);
      alert('Tool added successfully!');
      setToolFormData({ name: '', category: '', description: '' });
      setShowAddTool(false);
    } catch (error) {
      console.error('Error adding tool:', error);
      alert('Error adding tool: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const startScanner = async () => {
    // 1. Library Check
    const Html5QrcodeLib = Html5Qrcode || window.Html5Qrcode;
    if (!Html5QrcodeLib) {
      alert('QR Scanner library is still loading. Please wait a moment.');
      return;
    }

    // 2. Camera Support Check
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera access is not supported. Please ensure you are using HTTPS or localhost.');
      return;
    }

    try {
      // 3. Request Permission
      await navigator.mediaDevices.getUserMedia({ video: true });
      
      // 4. Activate UI (This puts the 'tool-scanner' div in the DOM)
      setScannerActive(true);

      // 5. Wait for React to render the div before initializing
      setTimeout(async () => {
        try {
          const scannerElement = document.getElementById('tool-scanner');
          if (!scannerElement) {
            throw new Error('Scanner container element not found in DOM');
          }

          const html5QrCode = new Html5QrcodeLib('tool-scanner');
          
          // Get cameras
          const devices = await Html5QrcodeLib.getCameras();
          if (!devices || devices.length === 0) {
            throw new Error('No cameras found');
          }

          // Camera selection logic
          let cameraId = devices[0].id;
          const backCamera = devices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('rear') ||
            device.label.toLowerCase().includes('environment')
          );
          if (backCamera) cameraId = backCamera.id;

          // 6. Start the scanner
          await html5QrCode.start(
            cameraId,
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0
            },
            async (decodedText) => {
              // On Success
              try {
                await html5QrCode.stop();
                await html5QrCode.clear();
              } catch (e) { console.log(e); }
              
              setScannerActive(false);
              scannerRef.current = null;
              await handleQRScan(decodedText);
            },
            () => { /* Ignore constant scan logs */ }
          );

          // Save to ref for stopping later
          scannerRef.current = html5QrCode;

        } catch (innerErr) {
          console.error('Initialization Error:', innerErr);
          setScannerActive(false);
          alert('Failed to initialize scanner: ' + innerErr.message);
        }
      }, 300); // 300ms delay to ensure DOM is ready

    } catch (err) {
      console.error('Permission Error:', err);
      setScannerActive(false);
      alert('Camera permission denied or camera in use.');
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        // Only call stop if the scanner is actually running
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.log('Stop Error:', err.message);
      } finally {
        scannerRef.current = null;
        setScannerActive(false);
      }
    } else {
      setScannerActive(false);
    }
  };

  const handleQRScan = async (decodedText) => {
    try {
      const toolData = JSON.parse(decodedText);
      
      if (!toolData.toolId) {
        alert('Invalid QR code format');
        return;
      }

      // Find tool in database
      const toolQuery = query(collection(db, 'tools'), where('toolId', '==', toolData.toolId));
      const toolSnapshot = await getDocs(toolQuery);
      
      if (toolSnapshot.empty) {
        alert('Tool not found in system');
        return;
      }

      const tool = { id: toolSnapshot.docs[0].id, ...toolSnapshot.docs[0].data() };
      setSelectedTool(tool);
      setManualToolId(toolData.toolId);
    } catch (err) {
      console.error('Error processing QR scan:', err);
      if (err.message.includes('JSON')) {
        alert('Invalid QR code format');
      } else {
        alert('Error processing QR code: ' + err.message);
      }
    }
  };

  const handleManualToolId = async () => {
    if (!manualToolId.trim()) {
      alert('Please enter or scan a tool ID');
      return;
    }

    try {
      const toolQuery = query(collection(db, 'tools'), where('toolId', '==', manualToolId.trim()));
      const toolSnapshot = await getDocs(toolQuery);
      
      if (toolSnapshot.empty) {
        alert('Tool not found in system');
        return;
      }

      const tool = { id: toolSnapshot.docs[0].id, ...toolSnapshot.docs[0].data() };
      setSelectedTool(tool);
    } catch (error) {
      console.error('Error finding tool:', error);
      alert('Error finding tool: ' + error.message);
    }
  };

  // Worker: Request checkout
  const handleRequestCheckout = async () => {
    if (!selectedTool) {
      alert('Please select a tool first');
      return;
    }

    if (selectedTool.status === 'checked_out') {
      alert('This tool is already checked out');
      return;
    }

    // Check if already requested
    const existingRequest = checkoutRequests.find(r => r.toolId === selectedTool.toolId && r.workerId === currentUser.uid && r.status === 'pending');
    if (existingRequest) {
      alert('You already have a pending checkout request for this tool');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'toolCheckoutRequests'), {
        toolId: selectedTool.toolId,
        toolName: selectedTool.name,
        toolCategory: selectedTool.category,
        workerId: currentUser.uid,
        workerName: currentUser.displayName || currentUser.email || 'Worker',
        status: 'pending',
        requestedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      });

      alert('Checkout request submitted! Waiting for site engineer approval.');
      setSelectedTool(null);
      setManualToolId('');
    } catch (error) {
      console.error('Error requesting checkout:', error);
      alert('Error submitting request: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Worker: Request return
  const handleRequestReturn = async () => {
    if (!selectedTool) {
      alert('Please select a tool first');
      return;
    }

    // Check if worker has this tool checked out
    const activeTransaction = transactions.find(
      t => t.toolId === selectedTool.toolId && 
           t.workerId === currentUser.uid && 
           t.status === 'checked_out'
    );

    if (!activeTransaction) {
      alert('You do not have this tool checked out');
      return;
    }

    // Check if already requested return
    const existingRequest = returnRequests.find(r => r.toolId === selectedTool.toolId && r.workerId === currentUser.uid && r.status === 'pending');
    if (existingRequest) {
      alert('You already have a pending return request for this tool');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'toolReturnRequests'), {
        toolId: selectedTool.toolId,
        toolName: selectedTool.name,
        transactionId: activeTransaction.id,
        workerId: currentUser.uid,
        workerName: currentUser.displayName || currentUser.email || 'Worker',
        status: 'pending',
        requestedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      });

      alert('Return request submitted! Waiting for site engineer approval.');
      setSelectedTool(null);
      setManualToolId('');
    } catch (error) {
      console.error('Error requesting return:', error);
      alert('Error submitting request: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Site Engineer: Approve checkout
  const handleApproveCheckout = async (request) => {
    setLoading(true);
    try {
      // Update tool status
      const toolQuery = query(collection(db, 'tools'), where('toolId', '==', request.toolId));
      const toolSnapshot = await getDocs(toolQuery);
      
      if (!toolSnapshot.empty) {
        const tool = { id: toolSnapshot.docs[0].id, ...toolSnapshot.docs[0].data() };
        await updateDoc(doc(db, 'tools', tool.id), {
          status: 'checked_out',
          currentBorrower: request.workerId,
          currentBorrowerName: request.workerName,
          updatedAt: serverTimestamp()
        });
      }

      // Create transaction record
      await addDoc(collection(db, 'toolTransactions'), {
        toolId: request.toolId,
        toolName: request.toolName,
        toolCategory: request.toolCategory,
        workerId: request.workerId,
        workerName: request.workerName,
        checkoutDate: serverTimestamp(),
        status: 'checked_out',
        approvedBy: currentUser.uid,
        approvedByName: currentUser.displayName || currentUser.email || '',
        createdAt: serverTimestamp()
      });

      // Update request status
      await updateDoc(doc(db, 'toolCheckoutRequests', request.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: currentUser.uid,
        updatedAt: serverTimestamp()
      });

      alert('Checkout approved successfully!');
    } catch (error) {
      console.error('Error approving checkout:', error);
      alert('Error approving checkout: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Site Engineer: Reject checkout
  const handleRejectCheckout = async (request) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'toolCheckoutRequests', request.id), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: currentUser.uid,
        updatedAt: serverTimestamp()
      });
      alert('Checkout request rejected');
    } catch (error) {
      console.error('Error rejecting checkout:', error);
      alert('Error rejecting request: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Site Engineer: Approve return
  const handleApproveReturn = async (request) => {
    setLoading(true);
    try {
      // Update tool status
      const toolQuery = query(collection(db, 'tools'), where('toolId', '==', request.toolId));
      const toolSnapshot = await getDocs(toolQuery);
      
      if (!toolSnapshot.empty) {
        const tool = { id: toolSnapshot.docs[0].id, ...toolSnapshot.docs[0].data() };
        await updateDoc(doc(db, 'tools', tool.id), {
          status: 'available',
          currentBorrower: null,
          currentBorrowerName: null,
          updatedAt: serverTimestamp()
        });
      }

      // Update transaction
      if (request.transactionId) {
        await updateDoc(doc(db, 'toolTransactions', request.transactionId), {
          status: 'returned',
          returnDate: serverTimestamp(),
          returnedBy: currentUser.uid,
          returnedByName: currentUser.displayName || currentUser.email || '',
          updatedAt: serverTimestamp()
        });
      }

      // Update return request status
      await updateDoc(doc(db, 'toolReturnRequests', request.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: currentUser.uid,
        updatedAt: serverTimestamp()
      });

      alert('Return approved successfully!');
    } catch (error) {
      console.error('Error approving return:', error);
      alert('Error approving return: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Site Engineer: Reject return
  const handleRejectReturn = async (request) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'toolReturnRequests', request.id), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        rejectedBy: currentUser.uid,
        updatedAt: serverTimestamp()
      });
      alert('Return request rejected');
    } catch (error) {
      console.error('Error rejecting return:', error);
      alert('Error rejecting request: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getMyBorrowedTools = () => {
    if (!isWorker) return [];
    return transactions.filter(
      t => t.workerId === currentUser?.uid && t.status === 'checked_out'
    );
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', padding: '20px', background: '#f3f4f6' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ color: 'white', marginBottom: 20, fontSize: 28, textAlign: 'center' }}>🔧 Tool Library</h1>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'white', padding: 8, borderRadius: 12, flexWrap: 'wrap' }}>
          {isSiteEngineer && (
            <button
              onClick={() => setActiveTab('tools')}
              style={{
                padding: 12,
                border: 'none',
                borderRadius: 8,
                background: activeTab === 'tools' ? '#667eea' : '#f3f4f6',
                color: activeTab === 'tools' ? 'white' : '#374151',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              📦 Tools
            </button>
          )}
          {isWorker && (
            <button
              onClick={() => setActiveTab('scan')}
              style={{
                padding: 12,
                border: 'none',
                borderRadius: 8,
                background: activeTab === 'scan' ? '#667eea' : '#f3f4f6',
                color: activeTab === 'scan' ? 'white' : '#374151',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              📷 Scan Tool
            </button>
          )}
          {isSiteEngineer && (
            <>
              <button
                onClick={() => setActiveTab('requests')}
                style={{
                  padding: 12,
                  border: 'none',
                  borderRadius: 8,
                  background: activeTab === 'requests' ? '#667eea' : '#f3f4f6',
                  color: activeTab === 'requests' ? 'white' : '#374151',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 14
                }}
              >
                📤 Checkout ({checkoutRequests.length})
              </button>
              <button
                onClick={() => setActiveTab('returns')}
                style={{
                  padding: 12,
                  border: 'none',
                  borderRadius: 8,
                  background: activeTab === 'returns' ? '#667eea' : '#f3f4f6',
                  color: activeTab === 'returns' ? 'white' : '#374151',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 14
                }}
              >
                📥 Return ({returnRequests.length})
              </button>
            </>
          )}
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: 12,
              border: 'none',
              borderRadius: 8,
              background: activeTab === 'history' ? '#667eea' : '#f3f4f6',
              color: activeTab === 'history' ? 'white' : '#374151',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            📋 History
          </button>
        </div>

        {/* Manage Tools Tab (Site Engineer Only) */}
        {isSiteEngineer && activeTab === 'tools' && (
          <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ color: '#333', fontSize: 24 }}>Tool Inventory</h2>
              <button
                onClick={() => setShowAddTool(!showAddTool)}
                style={{
                  padding: '10px 20px',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {showAddTool ? 'Cancel' : '+ Add Tool'}
              </button>
            </div>

            {showAddTool && (
              <form onSubmit={handleAddTool} style={{ marginBottom: 24, padding: 20, background: '#f9fafb', borderRadius: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>Tool Name *</label>
                    <input
                      type="text"
                      value={toolFormData.name}
                      onChange={(e) => setToolFormData({ ...toolFormData, name: e.target.value })}
                      required
                      style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>Category *</label>
                    <select
                      value={toolFormData.category}
                      onChange={(e) => setToolFormData({ ...toolFormData, category: e.target.value })}
                      required
                      style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8 }}
                    >
                      <option value="">Select category</option>
                      <option value="Hand Tools">Hand Tools</option>
                      <option value="Power Tools">Power Tools</option>
                      <option value="Measuring">Measuring</option>
                      <option value="Safety Equipment">Safety Equipment</option>
                      <option value="Machinery">Machinery</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>Description</label>
                  <textarea
                    value={toolFormData.description}
                    onChange={(e) => setToolFormData({ ...toolFormData, description: e.target.value })}
                    style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8, minHeight: 80 }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '12px 24px',
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  {loading ? 'Adding...' : 'Add Tool'}
                </button>
              </form>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Tool ID</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Category</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Borrower</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>QR Code</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((tool) => (
                    <tr key={tool.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: 12 }}>{tool.toolId}</td>
                      <td style={{ padding: 12, fontWeight: 500 }}>{tool.name}</td>
                      <td style={{ padding: 12 }}>{tool.category}</td>
                      <td style={{ padding: 12 }}>
                        <span
                          style={{
                            padding: '4px 12px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            background: tool.status === 'available' ? '#d4edda' : '#f8d7da',
                            color: tool.status === 'available' ? '#155724' : '#721c24'
                          }}
                        >
                          {tool.status === 'available' ? 'Available' : 'Checked Out'}
                        </span>
                      </td>
                      <td style={{ padding: 12 }}>{tool.currentBorrowerName || '-'}</td>
                      <td style={{ padding: 12 }}>
                        {tool.qrCode && (
                          <img src={tool.qrCode} alt="QR Code" style={{ width: 60, height: 60 }} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Worker Scan Tab */}
        {isWorker && activeTab === 'scan' && (
          <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#333', marginBottom: 20, fontSize: 24 }}>Scan Tool QR Code</h2>

            {/* QR Scanner */}
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={scannerActive ? stopScanner : startScanner}
                style={{
                  width: '25%',
                  padding: 14,
                  background: scannerActive ? '#ef4444' : '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 16,
                  marginBottom: 16
                }}
              >
                {scannerActive ? '🛑 Stop Scanner' : '📷 Start Scanner'}
              </button>
              {scannerActive && (
                <div id="tool-scanner" style={{ width: '100%', maxWidth: 400, margin: '0 auto', borderRadius: 8, overflow: 'hidden' }}></div>
              )}
            </div>

            {/* Manual Entry */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>Or Enter Tool ID</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={manualToolId}
                  onChange={(e) => setManualToolId(e.target.value)}
                  placeholder="Enter Tool ID"
                  style={{ flex: 1, padding: 12, border: '2px solid #e0e0e0', borderRadius: 8 }}
                />
                <button
                  onClick={handleManualToolId}
                  style={{
                    padding: '12px 24px',
                    background: '#111827',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Find
                </button>
              </div>
            </div>

            {/* Selected Tool Info */}
            {selectedTool && (
              <div style={{ marginBottom: 24, padding: 20, background: '#f9fafb', borderRadius: 12 }}>
                <h3 style={{ marginBottom: 12, color: '#333' }}>Tool: {selectedTool.name}</h3>
                <p><strong>ID:</strong> {selectedTool.toolId}</p>
                <p><strong>Category:</strong> {selectedTool.category}</p>
                <p><strong>Status:</strong> 
                  <span style={{ 
                    marginLeft: 8, 
                    padding: '4px 8px', 
                    borderRadius: 4,
                    background: selectedTool.status === 'available' ? '#d4edda' : '#f8d7da',
                    color: selectedTool.status === 'available' ? '#155724' : '#721c24',
                    fontSize: 12
                  }}>
                    {selectedTool.status === 'available' ? 'Available' : 'Checked Out'}
                  </span>
                </p>
                {selectedTool.status === 'checked_out' && (
                  <p style={{ marginTop: 8, color: '#856404' }}>Currently borrowed by: {selectedTool.currentBorrowerName || 'Unknown'}</p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            {selectedTool && (
              <div style={{ display: 'flex', gap: 12 }}>
                {selectedTool.status === 'available' && (
                  <button
                    onClick={handleRequestCheckout}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: 14,
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: 16
                    }}
                  >
                    {loading ? 'Submitting...' : 'Request Checkout'}
                  </button>
                )}
                {selectedTool.status === 'checked_out' && selectedTool.currentBorrower === currentUser.uid && (
                  <button
                    onClick={handleRequestReturn}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: 14,
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: 16
                    }}
                  >
                    {loading ? 'Submitting...' : 'Request Return'}
                  </button>
                )}
              </div>
            )}

            {/* My Borrowed Tools */}
            {getMyBorrowedTools().length > 0 && (
              <div style={{ marginTop: 24, padding: 16, background: '#fff3cd', borderRadius: 8 }}>
                <h3 style={{ marginBottom: 12 }}>My Borrowed Tools ({getMyBorrowedTools().length})</h3>
                {getMyBorrowedTools().map((t) => (
                  <div key={t.id} style={{ marginBottom: 8, padding: 12, background: 'white', borderRadius: 8 }}>
                    <strong>{t.toolName}</strong> (ID: {t.toolId})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Checkout Requests Tab (Site Engineer) */}
        {isSiteEngineer && activeTab === 'requests' && (
          <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#333', marginBottom: 20, fontSize: 24 }}>Checkout Requests</h2>
            {checkoutRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>No pending checkout requests</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {checkoutRequests.map((request) => (
                  <div key={request.id} style={{ padding: 20, background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                    <div style={{ marginBottom: 12 }}>
                      <h3 style={{ marginBottom: 8, color: '#333' }}>{request.toolName}</h3>
                      <p style={{ color: '#666', fontSize: 14 }}><strong>Tool ID:</strong> {request.toolId}</p>
                      <p style={{ color: '#666', fontSize: 14 }}><strong>Worker:</strong> {request.workerName}</p>
                      <p style={{ color: '#666', fontSize: 14 }}><strong>Requested:</strong> {request.requestedAt?.toLocaleString()}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleApproveCheckout(request)}
                        disabled={loading}
                        style={{
                          flex: 1,
                          padding: 12,
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 600,
                          cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectCheckout(request)}
                        disabled={loading}
                        style={{
                          flex: 1,
                          padding: 12,
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 600,
                          cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Return Requests Tab (Site Engineer) */}
        {isSiteEngineer && activeTab === 'returns' && (
          <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#333', marginBottom: 20, fontSize: 24 }}>Return Requests</h2>
            {returnRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>No pending return requests</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {returnRequests.map((request) => (
                  <div key={request.id} style={{ padding: 20, background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                    <div style={{ marginBottom: 12 }}>
                      <h3 style={{ marginBottom: 8, color: '#333' }}>{request.toolName}</h3>
                      <p style={{ color: '#666', fontSize: 14 }}><strong>Tool ID:</strong> {request.toolId}</p>
                      <p style={{ color: '#666', fontSize: 14 }}><strong>Worker:</strong> {request.workerName}</p>
                      <p style={{ color: '#666', fontSize: 14 }}><strong>Requested:</strong> {request.requestedAt?.toLocaleString()}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleApproveReturn(request)}
                        disabled={loading}
                        style={{
                          flex: 1,
                          padding: 12,
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 600,
                          cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectReturn(request)}
                        disabled={loading}
                        style={{
                          flex: 1,
                          padding: 12,
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 600,
                          cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#333', marginBottom: 20, fontSize: 24 }}>
              {isWorker ? 'My Tool History' : 'All Transactions'}
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Date</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Tool</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Worker</th>
                    <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(isWorker ? transactions.filter(t => t.workerId === currentUser?.uid) : transactions).map((transaction) => (
                    <tr key={transaction.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: 12 }}>
                        {transaction.checkoutDate?.toLocaleDateString() || 'N/A'}
                      </td>
                      <td style={{ padding: 12, fontWeight: 500 }}>{transaction.toolName}</td>
                      <td style={{ padding: 12 }}>{transaction.workerName}</td>
                      <td style={{ padding: 12 }}>
                        <span
                          style={{
                            padding: '4px 12px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            background: transaction.status === 'returned' ? '#d4edda' : '#fff3cd',
                            color: transaction.status === 'returned' ? '#155724' : '#856404'
                          }}
                        >
                          {transaction.status === 'returned' ? 'Returned' : 'Checked Out'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolLibrary;
