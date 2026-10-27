import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';

const ContractorManagement = () => {
  const { currentUser, userRole } = useAuth();
  const [contractors, setContractors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    mobile: '',
    email: '',
    address: '',
    specialization: ''
  });
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [modalType, setModalType] = useState(null); // 'defect' or 'deadline'
  const [defectForm, setDefectForm] = useState({
    description: '',
    severity: 'low', // low, medium, high
    date: new Date().toISOString().split('T')[0]
  });
  const [deadlineForm, setDeadlineForm] = useState({
    projectName: '',
    deadline: '',
    status: 'pending' // pending, met, missed
  });
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadContractors();
  }, []);

  // Real-time listener for contractors
  useEffect(() => {
    const q = query(collection(db, 'contractors'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contractorsList = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const rating = calculateRating(data);
        contractorsList.push({ 
          id: doc.id, 
          ...data,
          currentRating: rating.rating,
          paymentAdvice: rating.paymentAdvice
        });
      });
      setContractors(contractorsList.sort((a, b) => b.currentRating - a.currentRating));
    }, (error) => {
      console.error('Error listening to contractors:', error);
    });

    return () => unsubscribe();
  }, []);

  const loadContractors = async () => {
    try {
      const q = query(collection(db, 'contractors'));
      const snapshot = await getDocs(q);
      const contractorsList = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const rating = calculateRating(data);
        contractorsList.push({ 
          id: doc.id, 
          ...data,
          currentRating: rating.rating,
          paymentAdvice: rating.paymentAdvice
        });
      });
      setContractors(contractorsList.sort((a, b) => b.currentRating - a.currentRating));
    } catch (error) {
      console.error('Error loading contractors:', error);
    }
  };

  const calculateRating = (contractor) => {
    let rating = 10; // Start with perfect rating
    
    // Calculate deadline performance
    const deadlines = contractor.deadlines || [];
    const defects = contractor.defects || [];
    
    if (deadlines.length > 0) {
      const metDeadlines = deadlines.filter(d => d.status === 'met').length;
      const missedDeadlines = deadlines.filter(d => d.status === 'missed').length;
      const totalDeadlines = deadlines.length;
      
      // Deadline score: percentage of met deadlines
      const deadlineScore = (metDeadlines / totalDeadlines) * 10;
      
      // Deduct points for missed deadlines
      const missedPenalty = (missedDeadlines / totalDeadlines) * 5;
      
      rating = deadlineScore - missedPenalty;
    }
    
    // Calculate defect penalty
    if (defects.length > 0) {
      const highDefects = defects.filter(d => d.severity === 'high').length;
      const mediumDefects = defects.filter(d => d.severity === 'medium').length;
      const lowDefects = defects.filter(d => d.severity === 'low').length;
      
      // Penalty: High = -2, Medium = -1, Low = -0.5 per defect
      const defectPenalty = (highDefects * 2) + (mediumDefects * 1) + (lowDefects * 0.5);
      
      // Normalize penalty (max 5 points deduction)
      const normalizedPenalty = Math.min(defectPenalty / Math.max(defects.length, 1) * 2, 5);
      rating -= normalizedPenalty;
    }
    
    // Ensure rating is between 1 and 10
    rating = Math.max(1, Math.min(10, rating));
    rating = Math.round(rating * 10) / 10; // Round to 1 decimal
    
    // Payment advice based on rating
    let paymentAdvice = '';
    if (rating >= 9) {
      paymentAdvice = 'Excellent - Full payment recommended, consider bonus';
    } else if (rating >= 7.5) {
      paymentAdvice = 'Good - Full payment recommended';
    } else if (rating >= 6) {
      paymentAdvice = 'Average - Full payment, monitor closely';
    } else if (rating >= 4.5) {
      paymentAdvice = 'Below Average - Partial payment, require improvement plan';
    } else {
      paymentAdvice = 'Poor - Hold payment, require immediate improvement or consider termination';
    }
    
    return { rating, paymentAdvice };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const contractorData = {
        ...formData,
        deadlines: [],
        defects: [],
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid
      };

      await addDoc(collection(db, 'contractors'), contractorData);
      
      alert('Contractor added successfully!');
      setFormData({
        name: '',
        company: '',
        mobile: '',
        email: '',
        address: '',
        specialization: ''
      });
      setShowForm(false);
    } catch (error) {
      console.error('Error adding contractor:', error);
      alert('Failed to add contractor');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDefect = async () => {
    if (!selectedContractor || !defectForm.description) {
      alert('Please select a contractor and enter defect description');
      return;
    }

    setLoading(true);
    try {
      // Get latest contractor data from contractors array
      const latestContractor = contractors.find(c => c.id === selectedContractor.id);
      const contractorRef = doc(db, 'contractors', selectedContractor.id);
      const currentDefects = latestContractor?.defects || selectedContractor.defects || [];
      
      await updateDoc(contractorRef, {
        defects: [...currentDefects, {
          ...defectForm,
          reportedAt: new Date().toISOString(),
          reportedBy: currentUser.uid
        }]
      });
      
      alert('Defect added successfully!');
      setDefectForm({
        description: '',
        severity: 'low',
        date: new Date().toISOString().split('T')[0]
      });
      setSelectedContractor(null);
      setModalType(null);
    } catch (error) {
      console.error('Error adding defect:', error);
      alert('Failed to add defect: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDeadline = async () => {
    if (!selectedContractor || !deadlineForm.projectName || !deadlineForm.deadline) {
      alert('Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      // Get latest contractor data from contractors array
      const latestContractor = contractors.find(c => c.id === selectedContractor.id);
      const contractorRef = doc(db, 'contractors', selectedContractor.id);
      const currentDeadlines = latestContractor?.deadlines || selectedContractor.deadlines || [];
      
      // Check if deadline is met or missed
      const deadlineDate = new Date(deadlineForm.deadline);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      deadlineDate.setHours(0, 0, 0, 0);
      
      const status = deadlineDate < today ? 'missed' : deadlineForm.status;
      
      await updateDoc(contractorRef, {
        deadlines: [...currentDeadlines, {
          projectName: deadlineForm.projectName,
          deadline: deadlineForm.deadline,
          status: status,
          addedAt: new Date().toISOString(),
          addedBy: currentUser.uid
        }]
      });
      
      alert('Deadline added successfully!');
      setDeadlineForm({
        projectName: '',
        deadline: '',
        status: 'pending'
      });
      setSelectedContractor(null);
      setModalType(null);
    } catch (error) {
      console.error('Error adding deadline:', error);
      alert('Failed to add deadline: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDeadlineStatus = async (contractorId, deadlineIndex, newStatus) => {
    setLoading(true);
    try {
      const contractorRef = doc(db, 'contractors', contractorId);
      const contractor = contractors.find(c => c.id === contractorId);
      
      if (!contractor || !contractor.deadlines) {
        alert('Contractor or deadlines not found');
        setLoading(false);
        return;
      }
      
      const updatedDeadlines = [...contractor.deadlines];
      
      // Calculate correct index (since we reverse the display)
      const actualIndex = contractor.deadlines.length - 1 - deadlineIndex;
      
      if (actualIndex < 0 || actualIndex >= updatedDeadlines.length) {
        alert('Invalid deadline index');
        setLoading(false);
        return;
      }
      
      updatedDeadlines[actualIndex].status = newStatus;
      
      await updateDoc(contractorRef, {
        deadlines: updatedDeadlines
      });
      
      alert('Deadline status updated!');
    } catch (error) {
      console.error('Error updating deadline:', error);
      alert('Failed to update deadline: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getRatingColor = (rating) => {
    if (rating >= 8) return { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' };
    if (rating >= 6) return { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' };
    if (rating >= 4) return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
    return { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' };
  };

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'high': return { bg: '#fee2e2', text: '#991b1b' };
      case 'medium': return { bg: '#fef3c7', text: '#92400e' };
      default: return { bg: '#dbeafe', text: '#1e40af' };
    }
  };

  if (userRole !== 'manager' && userRole !== 'owner') {
    return (
      <div style={{ 
        width: '100%',
        maxWidth: '100%',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2>Access Restricted</h2>
        <p style={{ color: '#6b7280' }}>Only managers and owners can view contractor management.</p>
      </div>
    );
  }

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
          🏗️ Contractor Rating & Management
        </h1>
        <button 
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '0.75rem 1.5rem',
            background: showForm 
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap'
          }}
        >
          {showForm ? '✕ Cancel' : '+ Add Contractor'}
        </button>
      </div>

      {/* Add Contractor Form */}
      {showForm && (
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
            Add New Contractor
          </h2>

          <form onSubmit={handleSubmit}>
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
                  Contractor Name *
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
                  Company Name *
                </label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
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
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
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
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
                rows="3"
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

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Specialization
              </label>
              <input
                type="text"
                value={formData.specialization}
                onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                placeholder="e.g., Electrical, Plumbing, Construction"
                style={{ 
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
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
              {loading ? 'Adding...' : 'Add Contractor'}
            </button>
          </form>
        </div>
      )}

      {/* Contractors List */}
      {contractors.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '3rem 2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏗️</div>
          <p style={{ color: '#6b7280' }}>No contractors added yet</p>
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
          {contractors.map((contractor) => {
            const ratingColors = getRatingColor(contractor.currentRating);
            return (
              <div key={contractor.id} style={{
                background: 'white',
                borderRadius: '16px',
                padding: windowWidth <= 480 ? '1rem' : '1.5rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: '2px solid #f3f4f6'
              }}>
                <div style={{ 
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: windowWidth <= 480 ? '1.125rem' : '1.25rem' }}>
                      {contractor.name}
                    </h3>
                    <p style={{ margin: '0 0 0.25rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
                      {contractor.company}
                    </p>
                    <p style={{ margin: '0 0 0.25rem 0', color: '#6b7280', fontSize: '0.875rem' }}>
                      {contractor.mobile} {contractor.email && `• ${contractor.email}`}
                    </p>
                    {contractor.specialization && (
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                        Specialization: {contractor.specialization}
                      </p>
                    )}
                  </div>
                  
                  <div style={{
                    padding: '1rem',
                    borderRadius: '12px',
                    background: ratingColors.bg,
                    border: `2px solid ${ratingColors.border}`,
                    textAlign: 'center',
                    minWidth: '120px'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: ratingColors.text, fontWeight: '600', marginBottom: '0.25rem' }}>
                      RATING
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: ratingColors.text }}>
                      {contractor.currentRating.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: ratingColors.text, marginTop: '0.25rem' }}>
                      / 10
                    </div>
                  </div>
                </div>

                {/* Payment Advice */}
                <div style={{
                  padding: '0.75rem 1rem',
                  background: '#f0f9ff',
                  border: '2px solid #bfdbfe',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  fontSize: '0.875rem',
                  color: '#1e40af',
                  fontWeight: '600'
                }}>
                  💰 Payment Advice: {contractor.paymentAdvice}
                </div>

                {/* Action Buttons */}
                <div style={{ 
                  display: 'flex', 
                  gap: '0.75rem',
                  marginBottom: '1rem',
                  flexWrap: 'wrap'
                }}>
                  <button
                    onClick={() => {
                      setSelectedContractor(contractor);
                      setModalType('defect');
                    }}
                    style={{
                      flex: 1,
                      minWidth: '120px',
                      padding: '0.75rem 1rem',
                      background: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Add Defect
                  </button>
                  <button
                    onClick={() => {
                      setSelectedContractor(contractor);
                      setModalType('deadline');
                    }}
                    style={{
                      flex: 1,
                      minWidth: '120px',
                      padding: '0.75rem 1rem',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Add Deadline
                  </button>
                </div>

                {/* Defects List */}
                {contractor.defects && contractor.defects.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#374151', fontWeight: '600' }}>
                      Defects ({contractor.defects.length})
                    </h4>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {contractor.defects.slice(-5).reverse().map((defect, idx) => {
                        const severityColors = getSeverityColor(defect.severity);
                        return (
                          <div key={idx} style={{
                            padding: '0.75rem',
                            background: severityColors.bg,
                            borderRadius: '6px',
                            fontSize: '0.875rem'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <span style={{ fontWeight: '600', color: severityColors.text, textTransform: 'capitalize' }}>
                                {defect.severity} Severity
                              </span>
                              <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                                {defect.date}
                              </span>
                            </div>
                            <div style={{ color: '#374151' }}>
                              {defect.description}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Deadlines List */}
                {contractor.deadlines && contractor.deadlines.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#374151', fontWeight: '600' }}>
                      Deadlines ({contractor.deadlines.length})
                    </h4>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {contractor.deadlines.slice(-5).reverse().map((deadline, idx) => {
                        const statusColors = deadline.status === 'met' 
                          ? { bg: '#d1fae5', text: '#065f46' }
                          : deadline.status === 'missed'
                          ? { bg: '#fee2e2', text: '#991b1b' }
                          : { bg: '#fef3c7', text: '#92400e' };
                        
                        return (
                          <div key={idx} style={{
                            padding: '0.75rem',
                            background: statusColors.bg,
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.5rem'
                          }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: '600', color: statusColors.text, marginBottom: '0.25rem' }}>
                                {deadline.projectName}
                              </div>
                              <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                                Deadline: {deadline.deadline}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <span style={{
                                padding: '0.25rem 0.75rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                background: 'white',
                                color: statusColors.text,
                                textTransform: 'capitalize'
                              }}>
                                {deadline.status}
                              </span>
                              {deadline.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateDeadlineStatus(contractor.id, contractor.deadlines.length - 1 - idx, 'met')}
                                    style={{
                                      padding: '0.25rem 0.5rem',
                                      background: '#10b981',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    ✓ Met
                                  </button>
                                  <button
                                    onClick={() => handleUpdateDeadlineStatus(contractor.id, contractor.deadlines.length - 1 - idx, 'missed')}
                                    style={{
                                      padding: '0.25rem 0.5rem',
                                      background: '#ef4444',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    ✕ Missed
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Defect/Deadline Modal */}
      {selectedContractor && modalType && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedContractor(null);
              setModalType(null);
            }
          }}
        >
          <div 
            style={{
              background: 'white',
              borderRadius: '16px',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 1.5rem 0' }}>
  {modalType === 'defect' ? 'Add Defect' : 'Add Deadline'} for {selectedContractor.name}
</h2>

{modalType === 'defect' ? (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ 
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '600',
                    color: '#374151',
                    fontSize: '0.875rem'
                  }}>
                    Defect Description *
                  </label>
                  <textarea
                    value={defectForm.description}
                    onChange={(e) => setDefectForm({ ...defectForm, description: e.target.value })}
                    required
                    rows="4"
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
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  <div>
                    <label style={{ 
                      display: 'block',
                      marginBottom: '0.5rem',
                      fontWeight: '600',
                      color: '#374151',
                      fontSize: '0.875rem'
                    }}>
                      Severity *
                    </label>
                    <select
                      value={defectForm.severity}
                      onChange={(e) => setDefectForm({ ...defectForm, severity: e.target.value })}
                      style={{ 
                        width: '100%',
                        padding: '0.75rem',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '1rem'
                      }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
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
                      Date
                    </label>
                    <input
                      type="date"
                      value={defectForm.date}
                      onChange={(e) => setDefectForm({ ...defectForm, date: e.target.value })}
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
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => {
                      setSelectedContractor(null);
                      setModalType(null);
                      setDefectForm({
                        description: '',
                        severity: 'low',
                        date: new Date().toISOString().split('T')[0]
                      });
                    }}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1rem',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddDefect}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1rem',
                      background: loading ? '#9ca3af' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {loading ? 'Adding...' : 'Add Defect'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ 
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: '600',
                    color: '#374151',
                    fontSize: '0.875rem'
                  }}>
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={deadlineForm.projectName}
                    onChange={(e) => setDeadlineForm({ ...deadlineForm, projectName: e.target.value })}
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
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  <div>
                    <label style={{ 
                      display: 'block',
                      marginBottom: '0.5rem',
                      fontWeight: '600',
                      color: '#374151',
                      fontSize: '0.875rem'
                    }}>
                      Deadline Date *
                    </label>
                    <input
                      type="date"
                      value={deadlineForm.deadline}
                      onChange={(e) => setDeadlineForm({ ...deadlineForm, deadline: e.target.value })}
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
                      Status
                    </label>
                    <select
                      value={deadlineForm.status}
                      onChange={(e) => setDeadlineForm({ ...deadlineForm, status: e.target.value })}
                      style={{ 
                        width: '100%',
                        padding: '0.75rem',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '1rem'
                      }}
                    >
                      <option value="pending">Pending</option>
                      <option value="met">Met</option>
                      <option value="missed">Missed</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => {
                      setSelectedContractor(null);
                      setModalType(null);
                      setDeadlineForm({
                        projectName: '',
                        deadline: '',
                        status: 'pending'
                      });
                    }}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1rem',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddDeadline}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: '0.75rem 1rem',
                      background: loading ? '#9ca3af' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {loading ? 'Adding...' : 'Add Deadline'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractorManagement;
