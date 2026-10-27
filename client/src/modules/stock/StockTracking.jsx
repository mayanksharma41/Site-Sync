import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, getDoc, serverTimestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';

// Upload a single file to Cloudinary (folder e.g. 'stock/bills')
const uploadToCloudinary = async (file, folder, currentUserId) => {
  const cloudName = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) return null;
  if (file.size > 10 * 1024 * 1024) return null; // 10MB
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);
  formData.append('folder', `stock/${folder}/${currentUserId}`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: formData });
  if (!res.ok) return null;
  const data = await res.json();
  return data.secure_url || null;
};

const StockTracking = () => {
  const { currentUser, userRole } = useAuth();
  const [stockItems, setStockItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showTransaction, setShowTransaction] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unit: 'kg',
    initialQuantity: '',
    minThreshold: '',
    location: '',
    plannedDailyUsage: '',
    unitPrice: ''
  });
  const [projects, setProjects] = useState([]);
  const [stockRequests, setStockRequests] = useState([]);
  const [requestForm, setRequestForm] = useState({ itemId: '', quantity: '', projectId: '', location: '' });
  const [showSetPriceModal, setShowSetPriceModal] = useState(false);
  const [setPriceItem, setSetPriceItem] = useState(null);
  const [setPriceValue, setSetPriceValue] = useState('');
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocateReq, setAllocateReq] = useState(null);
  const [allocateQty, setAllocateQty] = useState('');
  const [allocateUnitPrice, setAllocateUnitPrice] = useState('');
  const [filterLocation, setFilterLocation] = useState('all');
  const [transactionData, setTransactionData] = useState({
    type: 'in',
    quantity: '',
    reason: '',
    notes: '',
    billPhoto: null,
    challanPhoto: null,
    sitePhoto: null
  });
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterVerified, setFilterVerified] = useState('all'); // 'all','verified','unverified'
  const [discrepancies, setDiscrepancies] = useState([]);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadStockItems();
    loadTransactions();
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      let q;
      if (userRole === 'site_engineer') {
        q = query(collection(db, 'projects'), where('assignedUsers', 'array-contains', currentUser?.uid || ''));
      } else {
        q = query(collection(db, 'projects'));
      }
      const snapshot = await getDocs(q);
      const list = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setProjects(list);
    } catch (e) {
      console.error('Error loading projects:', e);
    }
  };

  // Real-time listener for stock items
  useEffect(() => {
    const q = query(collection(db, 'stockItems'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      setStockItems(items);
      detectDiscrepancies(items);
    }, (error) => {
      console.error('Error listening to stock items:', error);
    });

    return () => unsubscribe();
  }, []);

  // Real-time listener for transactions
  useEffect(() => {
    const q = query(collection(db, 'stockTransactions'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trans = [];
      snapshot.forEach((doc) => {
        trans.push({ id: doc.id, ...doc.data() });
      });
      setTransactions(trans);
    }, (error) => {
      console.error('Error listening to transactions:', error);
    });

    return () => unsubscribe();
  }, []);

  // Real-time listener for stock requests
  useEffect(() => {
    if (!currentUser) return;
    let q;
    if (userRole === 'site_engineer') {
      q = query(collection(db, 'stockRequests'), where('requestedBy', '==', currentUser.uid));
    } else {
      q = query(collection(db, 'stockRequests'));
    }
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setStockRequests(list.sort((a, b) => (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0))));
    }, (e) => console.error('Error listening to stockRequests:', e));
    return () => unsubscribe();
  }, [currentUser, userRole]);

  const loadStockItems = async () => {
    try {
      const q = query(collection(db, 'stockItems'), orderBy('name'));
      const snapshot = await getDocs(q);
      const items = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      setStockItems(items);
      detectDiscrepancies(items);
    } catch (error) {
      console.error('Error loading stock items:', error);
    }
  };

  const loadTransactions = async () => {
    try {
      const q = query(collection(db, 'stockTransactions'), orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);
      const trans = [];
      snapshot.forEach((doc) => {
        trans.push({ id: doc.id, ...doc.data() });
      });
      setTransactions(trans);
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  const detectDiscrepancies = (items) => {
    const issues = [];
    items.forEach(item => {
      // Check for low stock
      if (item.currentQuantity <= item.minThreshold) {
        issues.push({
          type: 'low_stock',
          itemId: item.id,
          itemName: item.name,
          currentQuantity: item.currentQuantity,
          minThreshold: item.minThreshold,
          severity: 'warning',
          message: `${item.name} is below minimum threshold (${item.currentQuantity} ${item.unit} / ${item.minThreshold} ${item.unit})`
        });
      }

      // Check for negative stock (potential issue)
      if (item.currentQuantity < 0) {
        issues.push({
          type: 'negative_stock',
          itemId: item.id,
          itemName: item.name,
          currentQuantity: item.currentQuantity,
          severity: 'critical',
          message: `${item.name} has negative stock (${item.currentQuantity} ${item.unit}) - Possible theft or data error!`
        });
      }

      // Check for sudden large decreases (potential theft)
      if (item.lastTransaction && item.lastTransaction.type === 'out') {
        const decreasePercentage = (item.lastTransaction.quantity / item.previousQuantity) * 100;
        if (decreasePercentage > 50 && item.lastTransaction.quantity > 100) {
          issues.push({
            type: 'large_decrease',
            itemId: item.id,
            itemName: item.name,
            quantity: item.lastTransaction.quantity,
            percentage: decreasePercentage.toFixed(1),
            severity: 'high',
            message: `${item.name} had a large decrease of ${item.lastTransaction.quantity} ${item.unit} (${decreasePercentage.toFixed(1)}%) - Review required!`
          });
        }
      }
    });
    setDiscrepancies(issues);
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const itemData = {
        name: formData.name,
        category: formData.category,
        unit: formData.unit,
        currentQuantity: parseFloat(formData.initialQuantity),
        initialQuantity: parseFloat(formData.initialQuantity),
        minThreshold: parseFloat(formData.minThreshold),
        location: formData.location || null,
        plannedDailyUsage: formData.plannedDailyUsage ? parseFloat(formData.plannedDailyUsage) : null,
        unitPrice: formData.unitPrice ? parseFloat(formData.unitPrice) : null,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      };
      await addDoc(collection(db, 'stockItems'), itemData);
      alert('Stock item added successfully!');
      setFormData({ name: '', category: '', unit: 'kg', initialQuantity: '', minThreshold: '', location: '', plannedDailyUsage: '', unitPrice: '' });
      setShowAddItem(false);
    } catch (error) {
      console.error('Error adding stock item:', error);
      alert('Failed to add stock item: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTransaction = async (e) => {
    e.preventDefault();
    if (!selectedItem) {
      alert('Please select a stock item');
      return;
    }
    setLoading(true);
    try {
      const quantity = parseFloat(transactionData.quantity);
      const itemRef = doc(db, 'stockItems', selectedItem.id);
      const currentQty = selectedItem.currentQuantity || 0;
      let newQuantity = transactionData.type === 'in' ? currentQty + quantity : currentQty - quantity;

      const isAdjustmentByEngineer = transactionData.reason === 'adjustment' && userRole === 'site_engineer';
      const isAdjustment = transactionData.reason === 'adjustment';

      if (!isAdjustmentByEngineer) {
        if (transactionData.type === 'out' && newQuantity < 0) {
          alert(`Insufficient stock! Available: ${currentQty} ${selectedItem.unit}`);
          setLoading(false);
          return;
        }
        await updateDoc(itemRef, {
          currentQuantity: newQuantity,
          lastTransaction: { type: transactionData.type, quantity, timestamp: new Date().toISOString() },
          previousQuantity: currentQty,
          updatedAt: serverTimestamp()
        });
      }

      let billPhotoUrl = null, challanPhotoUrl = null, sitePhotoUrl = null;
      if (transactionData.billPhoto) {
        billPhotoUrl = await uploadToCloudinary(transactionData.billPhoto, 'bills', currentUser.uid);
      }
      if (transactionData.challanPhoto) {
        challanPhotoUrl = await uploadToCloudinary(transactionData.challanPhoto, 'challans', currentUser.uid);
      }
      if (transactionData.sitePhoto) {
        sitePhotoUrl = await uploadToCloudinary(transactionData.sitePhoto, 'site', currentUser.uid);
      }

      const approvalStatus = isAdjustmentByEngineer ? 'pending' : 'approved';
      const transactionRecord = {
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        itemUnit: selectedItem.unit,
        type: transactionData.type,
        quantity,
        previousQuantity: currentQty,
        newQuantity,
        reason: transactionData.reason,
        notes: transactionData.notes,
        billPhotoUrl: billPhotoUrl || null,
        challanPhotoUrl: challanPhotoUrl || null,
        sitePhotoUrl: sitePhotoUrl || null,
        verified: false,
        verifiedBy: null,
        verifiedAt: null,
        approvalStatus,
        approvedBy: isAdjustmentByEngineer ? null : currentUser.uid,
        approvedAt: isAdjustmentByEngineer ? null : serverTimestamp(),
        timestamp: serverTimestamp(),
        performedBy: currentUser.uid,
        performedByName: currentUser.displayName || currentUser.email
      };
      await addDoc(collection(db, 'stockTransactions'), transactionRecord);

      if (isAdjustmentByEngineer) {
        alert('Adjustment recorded. It will be applied after Manager approval.');
      } else {
        alert(`Stock ${transactionData.type === 'in' ? 'added' : 'removed'} successfully!`);
      }
      setTransactionData({ type: 'in', quantity: '', reason: '', notes: '', billPhoto: null, challanPhoto: null, sitePhoto: null });
      setSelectedItem(null);
      setShowTransaction(false);
    } catch (error) {
      console.error('Error processing transaction:', error);
      alert('Failed to process transaction: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (trans) => {
    try {
      await updateDoc(doc(db, 'stockTransactions', trans.id), {
        verified: true,
        verifiedBy: currentUser.uid,
        verifiedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Error verifying:', e);
      alert('Failed to verify');
    }
  };

  const handleApproveAdjustment = async (trans) => {
    try {
      const itemSnap = await getDoc(doc(db, 'stockItems', trans.itemId));
      if (!itemSnap.exists()) {
        alert('Stock item not found');
        return;
      }
      const item = itemSnap.data();
      const currentQty = item.currentQuantity ?? 0;
      const newQty = trans.type === 'in' ? currentQty + trans.quantity : currentQty - trans.quantity;
      await updateDoc(doc(db, 'stockItems', trans.itemId), {
        currentQuantity: newQty,
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'stockTransactions', trans.id), {
        approvalStatus: 'approved',
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Error approving adjustment:', e);
      alert('Failed to approve');
    }
  };

  const handleRejectAdjustment = async (trans) => {
    try {
      await updateDoc(doc(db, 'stockTransactions', trans.id), {
        approvalStatus: 'rejected',
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Error rejecting adjustment:', e);
      alert('Failed to reject');
    }
  };

  const handleSetPrice = async () => {
    if (!setPriceItem || setPriceValue === '' || isNaN(parseFloat(setPriceValue))) return;
    try {
      await updateDoc(doc(db, 'stockItems', setPriceItem.id), { unitPrice: parseFloat(setPriceValue), updatedAt: serverTimestamp() });
      setShowSetPriceModal(false);
      setSetPriceItem(null);
      setSetPriceValue('');
    } catch (e) {
      console.error('Error setting price:', e);
      alert('Failed to set price');
    }
  };

  const handleSubmitStockRequest = async (e) => {
    e.preventDefault();
    const item = stockItems.find(i => i.id === requestForm.itemId);
    const proj = projects.find(p => p.id === requestForm.projectId);
    if (!item || !requestForm.quantity) {
      alert('Select item and enter quantity');
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'stockRequests'), {
        itemId: item.id,
        itemName: item.name,
        itemUnit: item.unit,
        quantity: parseFloat(requestForm.quantity),
        projectId: requestForm.projectId || null,
        projectName: proj?.name || '',
        location: requestForm.location || '',
        requestedBy: currentUser.uid,
        requestedByName: currentUser.displayName || currentUser.email,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setRequestForm({ itemId: '', quantity: '', projectId: '', location: '' });
      alert('Stock request submitted. Manager will allocate.');
    } catch (e) {
      console.error('Error submitting stock request:', e);
      alert('Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  const handleAllocate = async () => {
    if (!allocateReq || !allocateQty || isNaN(parseFloat(allocateQty))) {
      alert('Enter quantity to allocate');
      return;
    }
    const item = stockItems.find(i => i.id === allocateReq.itemId);
    if (!item) {
      alert('Stock item not found');
      return;
    }
    const qty = parseFloat(allocateQty);
    const avail = item.currentQuantity ?? 0;
    if (qty <= 0 || qty > avail) {
      alert(`Invalid quantity. Available: ${avail} ${item.unit}`);
      return;
    }
    const up = allocateUnitPrice !== '' && !isNaN(parseFloat(allocateUnitPrice)) ? parseFloat(allocateUnitPrice) : (item.unitPrice || 0);
    const totalPrice = qty * up;
    setLoading(true);
    try {
      const newQty = avail - qty;
      await updateDoc(doc(db, 'stockItems', item.id), { currentQuantity: newQty, updatedAt: serverTimestamp() });
      await addDoc(collection(db, 'stockTransactions'), {
        itemId: item.id,
        itemName: item.name,
        itemUnit: item.unit,
        type: 'out',
        quantity: qty,
        previousQuantity: avail,
        newQuantity: newQty,
        reason: 'allocation',
        notes: `Stock request: ${allocateReq.projectName || ''} | ${allocateReq.requestedByName || ''}`,
        stockRequestId: allocateReq.id,
        allocatedUnitPrice: up,
        allocatedTotalPrice: totalPrice,
        verified: true,
        verifiedBy: currentUser.uid,
        verifiedAt: serverTimestamp(),
        approvalStatus: 'approved',
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp(),
        timestamp: serverTimestamp(),
        performedBy: currentUser.uid,
        performedByName: currentUser.displayName || currentUser.email
      });
      await updateDoc(doc(db, 'stockRequests', allocateReq.id), {
        status: 'allocated',
        allocatedQuantity: qty,
        allocatedAt: serverTimestamp(),
        allocatedBy: currentUser.uid,
        allocatedUnitPrice: up,
        allocatedTotalPrice: totalPrice
      });
      setShowAllocateModal(false);
      setAllocateReq(null);
      setAllocateQty('');
      setAllocateUnitPrice('');
      alert(`Allocated ${qty} ${item.unit} to request. Total: Rs.${totalPrice.toFixed(2)}`);
    } catch (e) {
      console.error('Error allocating:', e);
      alert('Failed to allocate');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectStockRequest = async (req) => {
    try {
      await updateDoc(doc(db, 'stockRequests', req.id), { status: 'rejected', rejectedBy: currentUser.uid, rejectedAt: serverTimestamp() });
    } catch (e) {
      console.error('Error rejecting request:', e);
      alert('Failed to reject');
    }
  };

  const getStatusColor = (quantity, minThreshold) => {
    if (quantity <= 0) return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
    if (quantity <= minThreshold) return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
    return { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' };
  };

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'critical': return { bg: '#fee2e2', text: '#991b1b', icon: '🚨' };
      case 'high': return { bg: '#fecaca', text: '#dc2626', icon: '⚠️' };
      case 'warning': return { bg: '#fef3c7', text: '#92400e', icon: '⚠️' };
      default: return { bg: '#dbeafe', text: '#1e40af', icon: 'ℹ️' };
    }
  };

  const filteredTransactions = transactions.filter(trans => {
    if (filterType !== 'all' && trans.type !== filterType) return false;
    if (filterVerified === 'verified' && !trans.verified) return false;
    if (filterVerified === 'unverified' && trans.verified) return false;
    if (filterCategory !== 'all' && selectedItem && trans.itemId !== selectedItem.id) return true;
    return true;
  });

  const filteredItems = stockItems.filter(item => {
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterLocation !== 'all' && (item.location || 'Unspecified') !== filterLocation) return false;
    return true;
  });

  const locationOptions = ['all', ...Array.from(new Set(stockItems.map(i => i.location || 'Unspecified')))];
  const pendingStockReqs = stockRequests.filter(r => r.status === 'pending');
  const isEngineer = userRole === 'site_engineer';

  const isManagerOrOwner = userRole === 'manager' || userRole === 'owner';
  const pendingAdjustments = transactions.filter(t => t.approvalStatus === 'pending' && t.reason === 'adjustment');

  // Daily usage vs planned (for manager view)
  const getUsageVsPlanned = () => {
    const today = new Date().toISOString().split('T')[0];
    const byItem = {};
    stockItems.forEach(it => {
      byItem[it.id] = { name: it.name, unit: it.unit, planned: it.plannedDailyUsage || 0, actual: 0 };
    });
    transactions
      .filter(t => t.type === 'out' && t.approvalStatus !== 'pending' && t.approvalStatus !== 'rejected')
      .forEach(t => {
        const d = (t.timestamp?.toDate ? t.timestamp.toDate() : new Date(t.timestamp)).toISOString().split('T')[0];
        if (d === today && byItem[t.itemId]) byItem[t.itemId].actual += t.quantity || 0;
      });
    return Object.entries(byItem).map(([id, v]) => ({ itemId: id, ...v }));
  };
  const usageVsPlanned = getUsageVsPlanned();

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
        alignItems: windowWidth <= 768 ? 'stretch' : 'center',
        marginBottom: '2rem',
        gap: '1rem'
      }}>
        <h1 style={{ 
          margin: 0, 
          fontSize: windowWidth <= 480 ? '1.5rem' : '2rem',
          color: '#1f2937'
        }}>
          📦 Stock Tracking & Inventory
        </h1>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {isManagerOrOwner && (
            <button 
              onClick={() => setShowAddItem(!showAddItem)}
              style={{
                padding: '0.75rem 1.5rem',
                background: showAddItem 
                  ? '#2563eb'
                  : '#374151',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {showAddItem ? '✕ Cancel' : '+ Add Stock Item'}
            </button>
          )}
          <button 
            onClick={() => setShowTransaction(!showTransaction)}
            disabled={stockItems.length === 0}
            style={{
              padding: '0.75rem 1.5rem',
              background: stockItems.length === 0
                ? '#9ca3af'
                : showTransaction
                ? '#2563eb'
                : '#374151',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: stockItems.length === 0 ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {showTransaction ? '✕ Cancel' : '📥 Stock In/Out'}
          </button>
        </div>
      </div>

      {/* Engineer: Request Stock */}
      {isEngineer && (
        <div style={{ background: 'white', borderRadius: '16px', padding: windowWidth <= 480 ? '1rem' : '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginBottom: '1.5rem', border: '2px solid #8b5cf6' }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem', color: '#6d28d9' }}>📋 Request Stock</h2>
          <form onSubmit={handleSubmitStockRequest}>
            <div style={{ display: 'grid', gridTemplateColumns: windowWidth <= 480 ? '1fr' : '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>Stock Item *</label>
                <select value={requestForm.itemId} onChange={(e) => setRequestForm({ ...requestForm, itemId: e.target.value })} required style={{ width: '100%', padding: '0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem' }}>
                  <option value="">Select item</option>
                  {stockItems.map(i => (
                    <option key={i.id} value={i.id}>{i.name} — Available: {i.currentQuantity} {i.unit}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>Quantity *</label>
                <input type="number" step="0.01" min="0.001" value={requestForm.quantity} onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })} placeholder="Qty" required style={{ width: '100%', padding: '0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>Project</label>
                <select value={requestForm.projectId} onChange={(e) => setRequestForm({ ...requestForm, projectId: e.target.value })} style={{ width: '100%', padding: '0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem' }}>
                  <option value="">Select project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>Location/Site</label>
                <input type="text" value={requestForm.location} onChange={(e) => setRequestForm({ ...requestForm, location: e.target.value })} placeholder="e.g. Site A" style={{ width: '100%', padding: '0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem' }} />
              </div>
            </div>
            <button type="submit" disabled={loading || stockItems.length === 0} style={{ padding: '0.75rem 1.5rem', background: (loading || stockItems.length === 0) ? '#9ca3af' : '#8b5cf6', color: 'white', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: (loading || stockItems.length === 0) ? 'not-allowed' : 'pointer' }}>Submit Request</button>
          </form>
          {stockRequests.length > 0 && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '0.5rem' }}>My requests</div>
              {stockRequests.slice(0, 10).map(r => (
                <div key={r.id} style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                  {r.itemName} {r.quantity} {r.itemUnit} — {r.status === 'pending' ? '⏳ Pending' : r.status === 'allocated' ? '✓ Allocated' : '✕ Rejected'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Discrepancies Alert — Manager & Owner only (Engineer cannot edit; receives simple confirmations) */}
      {isManagerOrOwner && discrepancies.length > 0 && (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: windowWidth <= 480 ? '1rem' : '1.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          marginBottom: '1.5rem',
          border: '2px solid #ef4444'
        }}>
          <h2 style={{ 
            margin: '0 0 1rem 0', 
            fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem',
            color: '#991b1b',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            🚨 Stock Alerts & Discrepancies
          </h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {discrepancies.map((issue, idx) => {
              const severityColors = getSeverityColor(issue.severity);
              return (
                <div key={idx} style={{
                  padding: '0.75rem 1rem',
                  background: severityColors.bg,
                  borderRadius: '8px',
                  border: `2px solid ${severityColors.text}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>{severityColors.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: '600', 
                      color: severityColors.text,
                      marginBottom: '0.25rem'
                    }}>
                      {issue.type === 'negative_stock' ? 'Critical: Negative Stock' :
                       issue.type === 'large_decrease' ? 'High Alert: Large Decrease' :
                       'Warning: Low Stock'}
                    </div>
                    <div style={{ color: severityColors.text, fontSize: '0.875rem' }}>
                      {issue.message}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending adjustments — Manager/Owner: Approve/Reject */}
      {isManagerOrOwner && pendingAdjustments.length > 0 && (
        <div style={{
          background: '#fef3c7',
          borderRadius: '16px',
          padding: windowWidth <= 480 ? '1rem' : '1.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          marginBottom: '1.5rem',
          border: '2px solid #f59e0b'
        }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem', color: '#92400e' }}>
            ⏳ Pending Adjustments ({pendingAdjustments.length})
          </h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {pendingAdjustments.map((t) => (
              <div key={t.id} style={{ padding: '1rem', background: '#fff', borderRadius: '8px', border: '1px solid #fcd34d', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                <div>
                  <strong>{t.itemName}</strong> — {t.type === 'in' ? '+' : '-'}{t.quantity} {t.itemUnit} ({t.reason}) • By: {t.performedByName || '—'}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => handleApproveAdjustment(t)} style={{ padding: '0.5rem 1rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Approve</button>
                  <button onClick={() => handleRejectAdjustment(t)} style={{ padding: '0.5rem 1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usage vs Planned — Manager/Owner */}
      {isManagerOrOwner && usageVsPlanned.some(u => u.planned > 0) && (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: windowWidth <= 480 ? '1rem' : '1.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          marginBottom: '1.5rem',
          border: '2px solid #3b82f6'
        }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem', color: '#1e40af' }}>
            📊 Today: Usage vs Planned
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Item</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>Planned</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>Actual (today)</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {usageVsPlanned.filter(u => u.planned > 0).map((u) => {
                  const ok = u.actual <= u.planned * 1.1;
                  return (
                    <tr key={u.itemId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.5rem' }}>{u.name}</td>
                      <td style={{ textAlign: 'right', padding: '0.5rem' }}>{u.planned} {u.unit}</td>
                      <td style={{ textAlign: 'right', padding: '0.5rem' }}>{u.actual} {u.unit}</td>
                      <td style={{ textAlign: 'center', padding: '0.5rem', color: ok ? '#059669' : '#dc2626' }}>{ok ? '✓' : 'Over'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Stock Requests — Manager: Allocate / Reject */}
      {isManagerOrOwner && pendingStockReqs.length > 0 && (
        <div style={{ background: '#eff6ff', borderRadius: '16px', padding: windowWidth <= 480 ? '1rem' : '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginBottom: '1.5rem', border: '2px solid #3b82f6' }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem', color: '#1e40af' }}>📥 Pending Stock Requests ({pendingStockReqs.length})</h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {pendingStockReqs.map((r) => {
              const it = stockItems.find(i => i.id === r.itemId);
              const avail = it?.currentQuantity ?? 0;
              return (
                <div key={r.id} style={{ padding: '1rem', background: '#fff', borderRadius: '10px', border: '1px solid #bfdbfe', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{r.itemName}</strong> — {r.quantity} {r.itemUnit} • Project: {r.projectName || '—'} • Location: {r.location || '—'}<br />
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>By: {r.requestedByName || '—'} • Available: {avail} {r.itemUnit}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => { setAllocateReq(r); setAllocateQty(String(r.quantity)); setAllocateUnitPrice(String(it?.unitPrice || '')); setShowAllocateModal(true); }} style={{ padding: '0.5rem 1rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Allocate</button>
                    <button onClick={() => handleRejectStockRequest(r)} style={{ padding: '0.5rem 1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Reject</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Stock Item Form */}
      {showAddItem && (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: windowWidth <= 480 ? '1.5rem' : '2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          marginBottom: '2rem',
          border: '2px solid #667eea'
        }}>
          <h2 style={{ 
            margin: '0 0 1.5rem 0', 
            fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem'
          }}>
            Add New Stock Item
          </h2>

          <form onSubmit={handleAddItem}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: windowWidth <= 480 ? '1fr' : 'repeat(2, 1fr)',
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
                  Item Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
              <div>
                <label style={{ 
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.875rem'
                }}>
                  Category *
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Cement, Steel, Sand"
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
              gridTemplateColumns: windowWidth <= 480 ? '1fr' : 'repeat(3, 1fr)',
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
                  Unit *
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  required
                  style={{ 
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="kg">Kilogram (kg)</option>
                  <option value="ton">Ton</option>
                  <option value="bag">Bag</option>
                  <option value="piece">Piece</option>
                  <option value="litre">Litre</option>
                  <option value="sqft">Square Feet</option>
                  <option value="cft">Cubic Feet</option>
                </select>
              </div>
              <div>
                <label style={{ 
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.875rem'
                }}>
                  Initial Quantity *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.initialQuantity}
                  onChange={(e) => setFormData({ ...formData, initialQuantity: e.target.value })}
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
              <div>
                <label style={{ 
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.875rem'
                }}>
                  Minimum Threshold *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.minThreshold}
                  onChange={(e) => setFormData({ ...formData, minThreshold: e.target.value })}
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

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Storage Location
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g., Warehouse A, Site 1"
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: windowWidth <= 480 ? '1fr' : '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>Planned Daily Usage (optional)</label>
                <input type="number" step="0.01" min="0" value={formData.plannedDailyUsage} onChange={(e) => setFormData({ ...formData, plannedDailyUsage: e.target.value })} placeholder="Daily usage vs planned" style={{ width: '100%', padding: '0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>Unit Price (₹) — Manager sets</label>
                <input type="number" step="0.01" min="0" value={formData.unitPrice} onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })} placeholder="Price per unit" style={{ width: '100%', padding: '0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem' }} />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '1rem',
                background: loading
                  ? '#9ca3af' 
                  : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Adding...' : 'Add Stock Item'}
            </button>
          </form>
        </div>
      )}

      {/* Stock In/Out Transaction Form */}
      {showTransaction && (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: windowWidth <= 480 ? '1.5rem' : '2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          marginBottom: '2rem',
          border: '2px solid #10b981'
        }}>
          <h2 style={{ 
            margin: '0 0 1.5rem 0', 
            fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem'
          }}>
            Stock Transaction (In/Out)
          </h2>

          <form onSubmit={handleTransaction}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Select Stock Item *
              </label>
              <select
                value={selectedItem?.id || ''}
                onChange={(e) => {
                  const item = stockItems.find(i => i.id === e.target.value);
                  setSelectedItem(item);
                }}
                required
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                <option value="">Select an item</option>
                {stockItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - Available: {item.currentQuantity} {item.unit}
                  </option>
                ))}
              </select>
            </div>

            {selectedItem && (
              <div style={{
                background: '#f0f9ff',
                border: '2px solid #bfdbfe',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                color: '#1e40af'
              }}>
                <strong>Current Stock:</strong> {selectedItem.currentQuantity} {selectedItem.unit}
                {selectedItem.location && ` • Location: ${selectedItem.location}`}
              </div>
            )}

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: windowWidth <= 480 ? '1fr' : 'repeat(2, 1fr)',
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
                  Transaction Type *
                </label>
                <select
                  value={transactionData.type}
                  onChange={(e) => setTransactionData({ ...transactionData, type: e.target.value })}
                  required
                  style={{ 
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="in">📥 Stock In (Add)</option>
                  <option value="out">📤 Stock Out (Remove)</option>
                </select>
              </div>
              <div>
                <label style={{ 
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '600',
                  color: '#374151',
                  fontSize: '0.875rem'
                }}>
                  Quantity *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={transactionData.quantity}
                  onChange={(e) => setTransactionData({ ...transactionData, quantity: e.target.value })}
                  required
                  placeholder="Enter quantity"
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
                Reason *
              </label>
              <select
                value={transactionData.reason}
                onChange={(e) => setTransactionData({ ...transactionData, reason: e.target.value })}
                required
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                <option value="">Select reason</option>
                <option value="purchase">Purchase/Procurement</option>
                <option value="usage">Usage/Consumption</option>
                <option value="transfer">Transfer</option>
                <option value="wastage">Wastage/Damage</option>
                <option value="theft">Theft/Loss</option>
                <option value="return">Return</option>
                <option value="adjustment">Stock Adjustment</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Notes
              </label>
              <textarea
                value={transactionData.notes}
                onChange={(e) => setTransactionData({ ...transactionData, notes: e.target.value })}
                rows="3"
                placeholder="Additional notes or details"
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Uploads: Bill, Challan, Site — especially for Engineer */}
            <div style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: windowWidth <= 480 ? '1fr' : 'repeat(3, 1fr)', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>Bill Photo (optional)</label>
                <input type="file" accept="image/*" onChange={(e) => setTransactionData({ ...transactionData, billPhoto: e.target.files?.[0] || null })} style={{ width: '100%', fontSize: '0.875rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>Challan Photo (optional)</label>
                <input type="file" accept="image/*" onChange={(e) => setTransactionData({ ...transactionData, challanPhoto: e.target.files?.[0] || null })} style={{ width: '100%', fontSize: '0.875rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#374151', fontSize: '0.875rem' }}>Site Photo (optional)</label>
                <input type="file" accept="image/*" onChange={(e) => setTransactionData({ ...transactionData, sitePhoto: e.target.files?.[0] || null })} style={{ width: '100%', fontSize: '0.875rem' }} />
              </div>
            </div>
            <div style={{ marginBottom: '1rem', fontSize: '0.8rem', color: '#6b7280' }}>
              Tip: Use reason &quot;Wastage/Damage&quot; to log damaged or wasted material. Engineer cannot edit past entries.
            </div>

            <button 
              type="submit"
              disabled={loading || !selectedItem}
              style={{
                width: '100%',
                padding: '1rem',
                background: (loading || !selectedItem)
                  ? '#9ca3af' 
                  : transactionData.type === 'in'
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: (loading || !selectedItem) ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Processing...' : transactionData.type === 'in' ? '📥 Add Stock' : '📤 Remove Stock'}
            </button>
          </form>
        </div>
      )}

      {/* Filters — Category & Location (track by location) */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ padding: '0.5rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
          <option value="all">All Categories</option>
          {[...new Set(stockItems.map(item => item.category))].map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} style={{ padding: '0.5rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
          <option value="all">All Locations</option>
          {locationOptions.filter(l => l !== 'all').map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
      </div>

      {/* Stock Items List */}
      {filteredItems.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '3rem 2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
          <p style={{ color: '#6b7280' }}>No stock items added yet</p>
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
            marginBottom: '2rem',
          }}
        >
          {filteredItems.map((item) => {
            const statusColors = getStatusColor(item.currentQuantity, item.minThreshold);
            return (
              <div key={item.id} style={{
                background: 'white',
                borderRadius: '16px',
                padding: windowWidth <= 480 ? '1rem' : '1.5rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: `2px solid ${statusColors.border}`
              }}>
                <div style={{ 
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '1rem'
                }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ 
                      margin: '0 0 0.25rem 0', 
                      fontSize: windowWidth <= 480 ? '1rem' : '1.125rem',
                      color: '#1f2937'
                    }}>
                      {item.name}
                    </h3>
                    <p style={{ 
                      margin: 0, 
                      fontSize: '0.875rem', 
                      color: '#6b7280' 
                    }}>
                      {item.category}
                    </p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>📍 {item.location || 'Unspecified'}</p>
                    {item.unitPrice != null && item.unitPrice > 0 && (
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#059669' }}>₹{Number(item.unitPrice).toFixed(2)}/unit • Value: ₹{((item.currentQuantity || 0) * item.unitPrice).toFixed(2)}</p>
                    )}
                  </div>
                  <div style={{
                    padding: '0.75rem',
                    borderRadius: '8px',
                    background: statusColors.bg,
                    border: `2px solid ${statusColors.border}`,
                    textAlign: 'center',
                    minWidth: '80px'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: statusColors.text, fontWeight: '600', marginBottom: '0.25rem' }}>AVAILABLE</div>
                    <div style={{ 
                      fontSize: '1.25rem', 
                      fontWeight: 'bold', 
                      color: statusColors.text 
                    }}>
                      {item.currentQuantity.toFixed(2)}
                    </div>
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: statusColors.text 
                    }}>
                      {item.unit}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '0.5rem', background: '#f9fafb', borderRadius: '6px', fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                  Min: {item.minThreshold} {item.unit}
                  {item.plannedDailyUsage != null && item.plannedDailyUsage > 0 && (
                    <span style={{ marginLeft: '0.5rem' }}> • Planned: {item.plannedDailyUsage} {item.unit}/day</span>
                  )}
                </div>

                {isManagerOrOwner && (
                  <button onClick={() => { setSetPriceItem(item); setSetPriceValue(String(item.unitPrice || '')); setShowSetPriceModal(true); }} style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}>Set Price</button>
                )}

                <button
                  onClick={() => {
                    setSelectedItem(item);
                    setShowTransaction(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  📥📤 Stock In/Out
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Transactions History */}
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: windowWidth <= 480 ? '1.5rem' : '2rem',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <div style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <h2 style={{ margin: 0, fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem', color: '#1f2937' }}>
            📋 Transaction History
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: '0.5rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
              <option value="all">All</option>
              <option value="in">Stock In</option>
              <option value="out">Stock Out</option>
            </select>
            {isManagerOrOwner && (
              <select value={filterVerified} onChange={(e) => setFilterVerified(e.target.value)} style={{ padding: '0.5rem 1rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
                <option value="all">Verified: All</option>
                <option value="verified">Verified only</option>
                <option value="unverified">Unverified only</option>
              </select>
            )}
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ color: '#6b7280' }}>No transactions recorded yet</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {filteredTransactions.slice(0, 50).map((trans) => {
              const transDate = trans.timestamp?.toDate ? trans.timestamp.toDate() : new Date(trans.timestamp);
              return (
                <div key={trans.id} style={{
                  padding: '1rem',
                  background: trans.type === 'in' ? '#f0fdf4' : '#fef2f2',
                  border: `2px solid ${trans.type === 'in' ? '#86efac' : '#fca5a5'}`,
                  borderRadius: '8px',
                  display: 'grid',
                  gridTemplateColumns: windowWidth <= 480 ? '1fr' : '2fr 1fr 1fr 1fr',
                  gap: '0.75rem',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.25rem' }}>{trans.itemName}</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {trans.reason && `Reason: ${trans.reason}`}
                      {trans.notes && ` • ${trans.notes}`}
                    </div>
                    {(trans.billPhotoUrl || trans.challanPhotoUrl || trans.sitePhotoUrl) && (
                      <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        {(trans.billPhotoUrl && <a href={trans.billPhotoUrl} target="_blank" rel="noopener noreferrer" style={{ marginRight: '0.5rem' }}>Bill</a>)}
                        {(trans.challanPhotoUrl && <a href={trans.challanPhotoUrl} target="_blank" rel="noopener noreferrer" style={{ marginRight: '0.5rem' }}>Challan</a>)}
                        {(trans.sitePhotoUrl && <a href={trans.sitePhotoUrl} target="_blank" rel="noopener noreferrer">Site</a>)}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: windowWidth <= 480 ? 'left' : 'center' }}>
                    <div style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      display: 'inline-block',
                      background: trans.type === 'in' ? '#d1fae5' : '#fee2e2',
                      color: trans.type === 'in' ? '#065f46' : '#991b1b'
                    }}>
                      {trans.type === 'in' ? '📥 IN' : '📤 OUT'}
                    </div>
                    {trans.reason === 'adjustment' && (
                      <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', color: trans.approvalStatus === 'pending' ? '#d97706' : trans.approvalStatus === 'rejected' ? '#b91c1c' : '#059669' }}>
                        {trans.approvalStatus === 'pending' ? '⏳ Pending' : trans.approvalStatus === 'rejected' ? '✕ Rejected' : '✓ Approved'}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: windowWidth <= 480 ? 'left' : 'center' }}>
                    <div style={{ fontWeight: '600', color: '#1f2937' }}>{trans.type === 'in' ? '+' : '-'}{trans.quantity} {trans.itemUnit || ''}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{trans.previousQuantity} {trans.itemUnit || ''} → {trans.newQuantity} {trans.itemUnit || ''}</div>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', textAlign: windowWidth <= 480 ? 'left' : 'right' }}>
                    <div>{transDate.toLocaleDateString()}</div>
                    <div style={{ fontSize: '0.75rem' }}>{transDate.toLocaleTimeString()}</div>
                    {trans.performedByName && <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>By: {trans.performedByName}</div>}
                    {isManagerOrOwner && (
                      <div style={{ marginTop: '0.5rem' }}>
                        {trans.verified ? (
                          <span style={{ fontSize: '0.75rem', color: '#059669' }}>✓ Verified</span>
                        ) : (
                          <button onClick={() => handleVerify(trans)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Verify</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Set Price Modal — Manager */}
      {showSetPriceModal && setPriceItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setShowSetPriceModal(false)}>
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', minWidth: '320px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Set Unit Price — {setPriceItem.name}</h3>
            <input type="number" step="0.01" min="0" value={setPriceValue} onChange={(e) => setSetPriceValue(e.target.value)} placeholder="₹ per unit" style={{ width: '100%', padding: '0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', marginBottom: '1rem', fontSize: '1rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowSetPriceModal(false); setSetPriceItem(null); setSetPriceValue(''); }} style={{ padding: '0.5rem 1rem', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSetPrice} style={{ padding: '0.5rem 1rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Allocate Modal — Manager */}
      {showAllocateModal && allocateReq && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setShowAllocateModal(false)}>
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', minWidth: '340px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Allocate Stock — {allocateReq.itemName}</h3>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#6b7280' }}>Requested: {allocateReq.quantity} {allocateReq.itemUnit} • Project: {allocateReq.projectName || '—'}</p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>Quantity to allocate *</label>
              <input type="number" step="0.01" min="0" value={allocateQty} onChange={(e) => setAllocateQty(e.target.value)} style={{ width: '100%', padding: '0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem' }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>Unit price (₹)</label>
              <input type="number" step="0.01" min="0" value={allocateUnitPrice} onChange={(e) => setAllocateUnitPrice(e.target.value)} placeholder="Optional" style={{ width: '100%', padding: '0.75rem', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAllocateModal(false); setAllocateReq(null); setAllocateQty(''); setAllocateUnitPrice(''); }} style={{ padding: '0.5rem 1rem', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAllocate} disabled={loading} style={{ padding: '0.5rem 1rem', background: loading ? '#9ca3af' : '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: '600' }}>Allocate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockTracking;
