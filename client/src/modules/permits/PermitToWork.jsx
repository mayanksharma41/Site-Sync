import React, { useState, useEffect } from 'react';
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

const PermitToWork = () => {
  const { currentUser, userRole } = useAuth();
  const isSiteEngineer = userRole === 'site_engineer';

  // Permit Request States
  const [permitRequests, setPermitRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('create'); // 'create', 'pending', 'approved'

  // Request Form States
  const [taskDescription, setTaskDescription] = useState('');
  const [taskLocation, setTaskLocation] = useState('');
  const [workerId, setWorkerId] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [hazards, setHazards] = useState('');
  const [safetyMeasures, setSafetyMeasures] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [requestNote, setRequestNote] = useState('');

  // OTP Verification
  const [selectedPermit, setSelectedPermit] = useState(null);
  const [otpInput, setOtpInput] = useState('');

  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  useEffect(() => {
    if (isSiteEngineer) {
      loadPermitRequests();
      loadWorkers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSiteEngineer]);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  const generateOTP = () => {
    // Fixed OTP for site engineer
    return '123456';
  };

  const loadWorkers = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'worker'));
      const snapshot = await getDocs(q);
      const workersList = [];
      snapshot.forEach((doc) => {
        workersList.push({ id: doc.id, ...doc.data() });
      });
      setWorkers(workersList);
    } catch (error) {
      console.error('Error loading workers:', error);
    }
  };

  const loadPermitRequests = async () => {
    try {
      const q = query(collection(db, 'permitRequests'), orderBy('requestedAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const requestsList = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          requestsList.push({
            id: doc.id,
            ...data,
            requestedAt: data.requestedAt?.toDate?.() || new Date(data.requestedAt),
            approvedAt: data.approvedAt?.toDate?.() || (data.approvedAt ? new Date(data.approvedAt) : null),
            startTime: data.startTime ? new Date(data.startTime) : null,
            endTime: data.endTime ? new Date(data.endTime) : null,
            otpExpiry: data.otpExpiry?.toDate?.() || (data.otpExpiry ? new Date(data.otpExpiry) : null)
          });
        });
        setPermitRequests(requestsList);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error('Error loading permit requests:', error);
    }
  };

  // Site Engineer: Create permit request (OTP auto-generated)
  const handleCreatePermit = async (e) => {
    e.preventDefault();
    if (!taskDescription.trim() || !taskLocation.trim() || !workerId || !startTime || !endTime) {
      showStatus('error', 'Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      // Auto-generate OTP
      const otp = generateOTP();
      const expiryTime = new Date();
      expiryTime.setHours(expiryTime.getHours() + 24); // OTP valid for 24 hours

      await addDoc(collection(db, 'permitRequests'), {
        taskDescription: taskDescription.trim(),
        taskLocation: taskLocation.trim(),
        workerId: workerId,
        workerName: workerName,
        hazards: hazards.trim(),
        safetyMeasures: safetyMeasures.trim(),
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        requestNote: requestNote.trim(),
        status: 'pending',
        otp: otp,
        otpExpiry: expiryTime,
        requestedAt: serverTimestamp(),
        createdBy: currentUser.uid,
        createdByName: currentUser.displayName || currentUser.email || '',
        createdAt: serverTimestamp()
      });

      showStatus('success', `✓ Permit created! OTP: ${otp} (Valid for 24 hours)`);
      setTaskDescription('');
      setTaskLocation('');
      setWorkerId('');
      setWorkerName('');
      setHazards('');
      setSafetyMeasures('');
      setStartTime('');
      setEndTime('');
      setRequestNote('');
      setActiveTab('pending');
    } catch (error) {
      console.error('Error creating permit:', error);
      showStatus('error', 'Error creating permit: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Site Engineer: Verify OTP and approve
  const handleVerifyOTP = async (permit) => {
    if (!otpInput.trim()) {
      showStatus('error', 'Please enter OTP');
      return;
    }

    if (permit.otp !== otpInput.trim()) {
      showStatus('error', 'Invalid OTP. Please check and try again.');
      return;
    }

    // Check if OTP is expired
    if (permit.otpExpiry && new Date() > permit.otpExpiry) {
      showStatus('error', 'OTP has expired. Please create a new permit.');
      return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, 'permitRequests', permit.id), {
        status: 'approved',
        otpVerified: true,
        otpVerifiedAt: serverTimestamp(),
        approvedAt: serverTimestamp(),
        approvedBy: currentUser.uid,
        approvedByName: currentUser.displayName || currentUser.email || '',
        updatedAt: serverTimestamp()
      });

      showStatus('success', '✓ OTP verified! Permit approved successfully.');
      setOtpInput('');
      setSelectedPermit(null);
      setActiveTab('approved');
    } catch (error) {
      console.error('Error verifying OTP:', error);
      showStatus('error', 'Error verifying OTP: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Site Engineer: Reject permit
  const handleRejectPermit = async (permit) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    setLoading(true);
    try {
      await updateDoc(doc(db, 'permitRequests', permit.id), {
        status: 'rejected',
        rejectionReason: reason.trim(),
        rejectedAt: serverTimestamp(),
        rejectedBy: currentUser.uid,
        rejectedByName: currentUser.displayName || currentUser.email || '',
        updatedAt: serverTimestamp()
      });

      showStatus('success', '✓ Permit request rejected');
    } catch (error) {
      console.error('Error rejecting permit:', error);
      showStatus('error', 'Error rejecting permit: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getPendingPermits = () => {
    return permitRequests.filter(r => r.status === 'pending');
  };

  const getApprovedPermits = () => {
    return permitRequests.filter(r => r.status === 'approved');
  };

  const isOTPExpired = (permit) => {
    if (!permit.otpExpiry) return false;
    return new Date() > permit.otpExpiry;
  };

  if (!isSiteEngineer) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }}>🔒</div>
        <h2>Access Restricted</h2>
        <p>Only Site Engineers can access this feature.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', padding: '20px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{ color: 'white', marginBottom: 20, fontSize: 28, textAlign: 'center' }}>🛡️ Permit-to-Work</h1>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'white', padding: 8, borderRadius: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('create')}
            style={{
              padding: 12,
              border: 'none',
              borderRadius: 8,
              background: activeTab === 'create' ? '#667eea' : '#f3f4f6',
              color: activeTab === 'create' ? 'white' : '#374151',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            ➕ Create Permit
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              padding: 12,
              border: 'none',
              borderRadius: 8,
              background: activeTab === 'pending' ? '#667eea' : '#f3f4f6',
              color: activeTab === 'pending' ? 'white' : '#374151',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            ⏳ Pending ({getPendingPermits().length})
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            style={{
              padding: 12,
              border: 'none',
              borderRadius: 8,
              background: activeTab === 'approved' ? '#667eea' : '#f3f4f6',
              color: activeTab === 'approved' ? 'white' : '#374151',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            ✅ Approved ({getApprovedPermits().length})
          </button>
        </div>

        {/* Status Message */}
        {status.message && (
          <div
            style={{
              marginBottom: 20,
              padding: 12,
              borderRadius: 8,
              textAlign: 'center',
              fontSize: 14,
              background: status.type === 'success' ? '#d4edda' : '#f8d7da',
              color: status.type === 'success' ? '#155724' : '#721c24'
            }}
          >
            {status.message}
          </div>
        )}

        {/* Create Permit Form */}
        {activeTab === 'create' && (
          <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#333', marginBottom: 20, fontSize: 24 }}>Create Permit Request</h2>
            <form onSubmit={handleCreatePermit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>Worker *</label>
                <select
                  value={workerId}
                  onChange={(e) => {
                    const selected = workers.find(w => w.id === e.target.value);
                    setWorkerId(e.target.value);
                    setWorkerName(selected ? (selected.name || selected.email || '') : '');
                  }}
                  required
                  style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8 }}
                >
                  <option value="">Select worker</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name || w.email || w.id}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>Task Description *</label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  required
                  placeholder="Describe the dangerous task"
                  style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8, minHeight: 100 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>Task Location *</label>
                <input
                  type="text"
                  value={taskLocation}
                  onChange={(e) => setTaskLocation(e.target.value)}
                  required
                  placeholder="Where will this task be performed?"
                  style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>Hazards Identified</label>
                <textarea
                  value={hazards}
                  onChange={(e) => setHazards(e.target.value)}
                  placeholder="List potential hazards"
                  style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8, minHeight: 80 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>Safety Measures</label>
                <textarea
                  value={safetyMeasures}
                  onChange={(e) => setSafetyMeasures(e.target.value)}
                  placeholder="Describe safety measures"
                  style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8, minHeight: 80 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>Start Time *</label>
                  <input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>End Time *</label>
                  <input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                    style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8 }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#555' }}>Additional Notes</label>
                <textarea
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  placeholder="Any additional information"
                  style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8, minHeight: 80 }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: 14,
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 16
                }}
              >
                {loading ? 'Creating...' : 'Create Permit Request'}
              </button>
            </form>
          </div>
        )}

        {/* Pending Permits - Verify OTP */}
        {activeTab === 'pending' && (
          <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#333', marginBottom: 20, fontSize: 24 }}>Pending Permit Requests</h2>
            {getPendingPermits().length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>No pending requests</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {getPendingPermits().map((permit) => (
                  <div key={permit.id} style={{ padding: 20, background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                    <div style={{ marginBottom: 12 }}>
                      <h3 style={{ marginBottom: 8, color: '#333' }}>{permit.taskDescription}</h3>
                      <p style={{ color: '#666', fontSize: 14 }}><strong>Worker:</strong> {permit.workerName}</p>
                      <p style={{ color: '#666', fontSize: 14 }}><strong>Location:</strong> {permit.taskLocation}</p>
                      <p style={{ color: '#666', fontSize: 14 }}>
                        <strong>Time:</strong> {permit.startTime?.toLocaleString()} - {permit.endTime?.toLocaleString()}
                      </p>
                      {permit.hazards && (
                        <p style={{ color: '#666', fontSize: 14, marginTop: 8 }}>
                          <strong>Hazards:</strong> {permit.hazards}
                        </p>
                      )}
                      {permit.safetyMeasures && (
                        <p style={{ color: '#666', fontSize: 14 }}>
                          <strong>Safety Measures:</strong> {permit.safetyMeasures}
                        </p>
                      )}
                      {isOTPExpired(permit) && (
                        <p style={{ color: '#721c24', fontSize: 14, marginTop: 8, fontWeight: 600 }}>
                          ⚠️ OTP Expired
                        </p>
                      )}
                    </div>
                    <div style={{ marginTop: 16, padding: 16, background: '#fff3cd', borderRadius: 8 }}>
                      <p style={{ marginBottom: 12, fontWeight: 600 }}>Enter OTP to approve:</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          value={selectedPermit?.id === permit.id ? otpInput : ''}
                          onChange={(e) => {
                            setSelectedPermit(permit);
                            setOtpInput(e.target.value);
                          }}
                          placeholder="Enter 6-digit OTP"
                          maxLength={6}
                          style={{ flex: 1, padding: 12, border: '2px solid #e0e0e0', borderRadius: 8, fontSize: 18, textAlign: 'center', letterSpacing: 4 }}
                        />
                        <button
                          onClick={() => handleVerifyOTP(permit)}
                          disabled={loading || isOTPExpired(permit)}
                          style={{
                            padding: '12px 24px',
                            background: isOTPExpired(permit) ? '#9ca3af' : '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            fontWeight: 600,
                            cursor: loading || isOTPExpired(permit) ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loading ? 'Verifying...' : isOTPExpired(permit) ? 'Expired' : 'Verify & Approve'}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRejectPermit(permit)}
                      disabled={loading}
                      style={{
                        width: '100%',
                        marginTop: 12,
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
                ))}
              </div>
            )}
          </div>
        )}

        {/* Approved Permits */}
        {activeTab === 'approved' && (
          <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#333', marginBottom: 20, fontSize: 24 }}>Approved Permits</h2>
            {getApprovedPermits().length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>No approved permits</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Task</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Worker</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Location</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Time Period</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600 }}>Approved At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getApprovedPermits().map((permit) => (
                      <tr key={permit.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: 12 }}>{permit.taskDescription}</td>
                        <td style={{ padding: 12 }}>{permit.workerName}</td>
                        <td style={{ padding: 12 }}>{permit.taskLocation}</td>
                        <td style={{ padding: 12 }}>
                          {permit.startTime?.toLocaleString()} - {permit.endTime?.toLocaleString()}
                        </td>
                        <td style={{ padding: 12 }}>
                          {permit.approvedAt?.toLocaleString() || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PermitToWork;
