import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';

const uploadReceiptToCloudinary = async (file, workerId) => {
  const cloudName = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary credentials missing in .env');
  }
  if (!file) throw new Error('Receipt is required');
  if (file.size > 10 * 1024 * 1024) throw new Error('Receipt photo too large (max 10MB)');

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', uploadPreset);
  form.append('folder', `pettycash/${workerId}`);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const parsed = JSON.parse(text);
      msg = parsed?.error?.message || msg;
    } catch {}
    throw new Error(msg || `Upload failed (${res.status})`);
  }
  const data = JSON.parse(text);
  if (!data?.secure_url) throw new Error('Cloudinary did not return URL');
  return data.secure_url;
};

const PettyCash = () => {
  const { currentUser, userRole } = useAuth();
  const isWorker = userRole === 'worker';
  const isSiteEngineer = userRole === 'site_engineer';
  const canUse = isWorker || isSiteEngineer;

  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const selectedWorker = useMemo(
    () => workers.find((w) => w.id === selectedWorkerId) || null,
    [workers, selectedWorkerId]
  );

  const [walletBalance, setWalletBalance] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState('');

  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptName, setReceiptName] = useState('');

  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpNote, setTopUpNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  // For expense viewing (site engineer)
  const [expenses, setExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(isWorker ? 'expense' : 'view'); // 'expense' or 'view' or 'topup'

  // Get current worker ID (for worker role, use their own ID)
  const currentWorkerId = isWorker ? currentUser?.uid : selectedWorkerId;

  useEffect(() => {
    const loadWorkers = async () => {
      if (!isSiteEngineer) return;
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'worker'));
        const snap = await getDocs(q);
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || '')));
        setWorkers(list);
      } catch (e) {
        console.error('Error loading workers:', e);
        setWorkers([]);
      }
    };
    loadWorkers();
  }, [isSiteEngineer]);

  useEffect(() => {
    // Get GPS location once
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
        setLocationError('');
      },
      (err) => {
        setLocation(null);
        setLocationError('GPS disabled - Enable location');
        console.warn('Geolocation error:', err);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  useEffect(() => {
    const loadWallet = async () => {
      if (!currentWorkerId) {
        setWalletBalance(null);
        return;
      }
      setWalletLoading(true);
      try {
        const ref = doc(db, 'wallets', currentWorkerId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setWalletBalance(0);
        } else {
          const data = snap.data();
          setWalletBalance(Number(data.balance || 0));
        }
      } catch (e) {
        console.error('Error loading wallet:', e);
        setWalletBalance(null);
      } finally {
        setWalletLoading(false);
      }
    };
    loadWallet();
  }, [currentWorkerId]);

  // Load expenses for site engineer
  useEffect(() => {
    const loadExpenses = async () => {
      if (!isSiteEngineer) return;
      setExpensesLoading(true);
      try {
        const q = query(
          collection(db, 'pettyCashExpenses'),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const list = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt)
          });
        });
        setExpenses(list);
      } catch (e) {
        console.error('Error loading expenses:', e);
        setExpenses([]);
      } finally {
        setExpensesLoading(false);
      }
    };
    if (activeTab === 'view') {
      loadExpenses();
    }
  }, [isSiteEngineer, activeTab]);

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentWorkerId) {
      return showStatus('error', 'User not found');
    }
    if (!location) return showStatus('error', 'GPS location is required');
    if (!receiptFile) return showStatus('error', 'Receipt photo is required');
    if (!navigator.onLine) return showStatus('error', 'Internet required to upload receipt');

    const amt = Number(amount);
    if (!amt || amt <= 0) return showStatus('error', 'Enter valid amount');
    if (!purpose.trim()) return showStatus('error', 'Purpose is required');

    setSubmitting(true);
    try {
      const receiptUrl = await uploadReceiptToCloudinary(receiptFile, currentWorkerId);
      const walletRef = doc(db, 'wallets', currentWorkerId);
      const expenseRef = collection(db, 'pettyCashExpenses');

      // Get worker name
      const workerName = currentUser?.displayName || currentUser?.email || '';

      await runTransaction(db, async (txr) => {
        const walletSnap = await txr.get(walletRef);
        const currentBalance = walletSnap.exists() ? Number(walletSnap.data().balance || 0) : 0;

        if (amt > currentBalance) {
          throw new Error(`Insufficient wallet balance. Available: ₹${currentBalance.toFixed(2)}`);
        }

        // Deduct
        if (walletSnap.exists()) {
          txr.update(walletRef, { balance: currentBalance - amt, updatedAt: serverTimestamp() });
        } else {
          // initialize then deduct
          txr.set(walletRef, { balance: 0 - amt, updatedAt: serverTimestamp(), createdAt: serverTimestamp() });
        }

        // Record expense
        txr.set(doc(expenseRef), {
          workerId: currentWorkerId,
          workerName: workerName,
          amount: amt,
          purpose: purpose.trim(),
          receiptUrl,
          gps: location,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid || null,
          createdByName: currentUser?.displayName || currentUser?.email || '',
          synced: true
        });
      });

      // Refresh wallet
      const refreshed = await getDoc(doc(db, 'wallets', currentWorkerId));
      setWalletBalance(refreshed.exists() ? Number(refreshed.data().balance || 0) : 0);

      setAmount('');
      setPurpose('');
      setReceiptFile(null);
      setReceiptName('');
      showStatus('success', '✓ Expense submitted successfully!');
    } catch (err) {
      console.error('Expense submit error:', err);
      showStatus('error', err?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTopUp = async () => {
    if (!isSiteEngineer) return;
    if (!selectedWorkerId) return showStatus('error', 'Select worker');
    const amt = Number(topUpAmount);
    if (!amt || amt <= 0) return showStatus('error', 'Enter valid top-up amount');

    setSubmitting(true);
    try {
      const walletRef = doc(db, 'wallets', selectedWorkerId);
      const walletTxRef = collection(db, 'walletTransactions');

      await runTransaction(db, async (txr) => {
        const snap = await txr.get(walletRef);
        const currentBalance = snap.exists() ? Number(snap.data().balance || 0) : 0;
        const newBalance = currentBalance + amt;

        if (snap.exists()) {
          txr.update(walletRef, { balance: newBalance, updatedAt: serverTimestamp() });
        } else {
          txr.set(walletRef, { balance: newBalance, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }

        txr.set(doc(walletTxRef), {
          workerId: selectedWorkerId,
          workerName: selectedWorker?.name || selectedWorker?.email || '',
          type: 'credit',
          amount: amt,
          note: topUpNote.trim(),
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid || null,
          createdByName: currentUser?.displayName || currentUser?.email || ''
        });
      });

      const refreshed = await getDoc(doc(db, 'wallets', selectedWorkerId));
      setWalletBalance(refreshed.exists() ? Number(refreshed.data().balance || 0) : 0);
      setTopUpAmount('');
      setTopUpNote('');
      showStatus('success', '✓ Wallet topped up successfully!');
    } catch (err) {
      console.error('Top up error:', err);
      showStatus('error', err?.message || 'Top up failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openGoogleMaps = (lat, lng) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  };

  if (!canUse) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }}>🔒</div>
        <h2>Access Restricted</h2>
        <p>Only Site Engineers and Workers can access this feature.</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        padding: '20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Tabs for Site Engineer */}
        {isSiteEngineer && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'white', padding: 8, borderRadius: 12 }}>
            <button
              onClick={() => setActiveTab('view')}
              style={{
                flex: 1,
                padding: 12,
                border: 'none',
                borderRadius: 8,
                background: activeTab === 'view' ? '#667eea' : '#f3f4f6',
                color: activeTab === 'view' ? 'white' : '#374151',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              📋 View Expenses
            </button>
            <button
              onClick={() => setActiveTab('topup')}
              style={{
                flex: 1,
                padding: 12,
                border: 'none',
                borderRadius: 8,
                background: activeTab === 'topup' ? '#667eea' : '#f3f4f6',
                color: activeTab === 'topup' ? 'white' : '#374151',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              💰 Add Funds
            </button>
          </div>
        )}

        {/* Expense View Tab (Site Engineer Only) */}
        {isSiteEngineer && activeTab === 'view' && (
          <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#333', marginBottom: 20, fontSize: 24 }}>📋 Worker Expenses</h2>
            {expensesLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>Loading expenses...</div>
            ) : expenses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>No expenses found</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 14 }}>Date</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 14 }}>Worker</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 14 }}>Amount</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 14 }}>Purpose</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 14 }}>Location</th>
                      <th style={{ padding: 12, textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 14 }}>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((exp) => (
                      <tr key={exp.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: 12, fontSize: 14, color: '#374151' }}>
                          {exp.createdAt?.toLocaleString?.() || 'N/A'}
                        </td>
                        <td style={{ padding: 12, fontSize: 14, color: '#374151', fontWeight: 500 }}>
                          {exp.workerName || 'Unknown'}
                        </td>
                        <td style={{ padding: 12, fontSize: 14, color: '#374151', fontWeight: 600 }}>
                          ₹{Number(exp.amount || 0).toFixed(2)}
                        </td>
                        <td style={{ padding: 12, fontSize: 14, color: '#374151' }}>
                          {exp.purpose || '-'}
                        </td>
                        <td style={{ padding: 12, fontSize: 14 }}>
                          {exp.gps ? (
                            <button
                              onClick={() => openGoogleMaps(exp.gps.lat, exp.gps.lng)}
                              style={{
                                background: '#667eea',
                                color: 'white',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 500
                              }}
                            >
                              📍 View on Map
                            </button>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>N/A</span>
                          )}
                        </td>
                        <td style={{ padding: 12, fontSize: 14 }}>
                          {exp.receiptUrl ? (
                            <a
                              href={exp.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#667eea',
                                textDecoration: 'none',
                                fontWeight: 500
                              }}
                            >
                              View Receipt
                            </a>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>N/A</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Top Up Tab (Site Engineer Only) */}
        {isSiteEngineer && activeTab === 'topup' && (
          <div style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 500, margin: '0 auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#333', marginBottom: 20, fontSize: 24, textAlign: 'center' }}>💰 Add Funds to Worker Wallet</h2>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: '#555', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Worker *</label>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                required
                style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8, fontSize: 14 }}
              >
                <option value="">Select worker</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name || w.email || w.id}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 8, fontSize: 12, color: '#667eea' }}>
                Wallet Balance: {walletLoading ? 'Loading…' : walletBalance == null ? '-' : `₹${walletBalance.toFixed(2)}`}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: '#555', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Top-up amount (₹)"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8, fontSize: 14 }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: '#555', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Note (optional)</label>
              <input
                type="text"
                placeholder="Note"
                value={topUpNote}
                onChange={(e) => setTopUpNote(e.target.value)}
                style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8, fontSize: 14 }}
              />
            </div>

            <button
              type="button"
              onClick={handleTopUp}
              disabled={submitting || !selectedWorkerId}
              style={{
                width: '100%',
                padding: 14,
                background: '#111827',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 700,
                cursor: submitting || !selectedWorkerId ? 'not-allowed' : 'pointer',
                opacity: submitting || !selectedWorkerId ? 0.7 : 1
              }}
            >
              {submitting ? 'Adding Funds…' : 'Add Funds'}
            </button>

            {status.message && (
              <div
                style={{
                  marginTop: 16,
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
          </div>
        )}

        {/* Expense Form Tab (Worker Only) */}
        {isWorker && (
          <div style={{ background: 'white', borderRadius: 16, padding: 32, maxWidth: 500, margin: '0 auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#333', marginBottom: 16, fontSize: 24, textAlign: 'center' }}>💰 Petty Cash Expense</h2>

            {/* GPS */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: location ? '#2e7d32' : '#666' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: location ? '#4caf50' : '#ccc' }} />
              <span>{location ? 'Location captured ✓' : locationError || 'Checking location...'}</span>
            </div>

            {/* Wallet Balance (Worker Only) */}
            <div style={{ marginBottom: 16, padding: 12, background: '#f8f9ff', borderRadius: 8, border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: 14, color: '#555', fontWeight: 600 }}>Your Wallet Balance</div>
              <div style={{ fontSize: 20, color: '#667eea', fontWeight: 700, marginTop: 4 }}>
                {walletLoading ? 'Loading…' : walletBalance == null ? '₹0.00' : `₹${walletBalance.toFixed(2)}`}
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', color: '#555', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Enter amount"
                  style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8, fontSize: 14 }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', color: '#555', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Purpose *</label>
                <textarea
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Describe the expense"
                  style={{ width: '100%', padding: 12, border: '2px solid #e0e0e0', borderRadius: 8, fontSize: 14, resize: 'vertical', minHeight: 80 }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', color: '#555', fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Receipt *</label>
                <div
                  style={{
                    border: '2px dashed #e0e0e0',
                    padding: 16,
                    textAlign: 'center',
                    cursor: 'pointer',
                    borderRadius: 8
                  }}
                  onClick={() => document.getElementById('pettycash-receipt')?.click()}
                >
                  <input
                    id="pettycash-receipt"
                    type="file"
                    accept="image/*"
                    required
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setReceiptFile(f);
                      setReceiptName(f?.name || '');
                    }}
                  />
                  📷 Upload Receipt Photo
                  {receiptName && <div style={{ marginTop: 8, fontSize: 12, color: '#667eea' }}>{receiptName}</div>}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: 14,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1
                }}
              >
                {submitting ? 'Submitting…' : 'Submit Expense'}
              </button>
            </form>

            {status.message && (
              <div
                style={{
                  marginTop: 16,
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
          </div>
        )}
      </div>
    </div>
  );
};

export default PettyCash;
