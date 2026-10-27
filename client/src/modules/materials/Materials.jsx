import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';

const Materials = () => {
  const { currentUser, userRole } = useAuth();
  const [requests, setRequests] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    projectId: '',
    materialName: '',
    quantity: '',
    unit: 'kg',
    description: ''
  });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadProjects();
    if (navigator.onLine) {
      syncOfflineMaterials();
    }
  }, [currentUser, userRole]);

  // Real-time listener for material requests - SYNCED (Engineer ↔ Manager)
  useEffect(() => {
    if (!currentUser) return;

    let q;
    if (userRole === 'site_engineer') {
      q = query(
        collection(db, 'materialRequests'),
        where('requestedBy', '==', currentUser.uid)
      );
    } else if (userRole === 'manager' || userRole === 'owner') {
      q = query(collection(db, 'materialRequests'));
    } else {
      q = query(collection(db, 'materialRequests'), where('status', '==', 'approved'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requestsList = [];
      snapshot.forEach((doc) => {
        requestsList.push({ id: doc.id, ...doc.data() });
      });
      setRequests(requestsList.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB - dateA;
      }));
    }, (error) => {
      console.error('Error listening to material requests:', error);
    });

    return () => unsubscribe();
  }, [currentUser, userRole]);

  const syncOfflineMaterials = async () => {
    const queue = JSON.parse(localStorage.getItem('materialOfflineQueue') || '[]');
    if (queue.length === 0) return;

    for (const item of queue) {
      try {
        await addDoc(collection(db, 'materialRequests'), {
          ...item,
          synced: true
        });
      } catch (error) {
        console.error('Error syncing offline material request:', error);
      }
    }
    localStorage.removeItem('materialOfflineQueue');
    // Real-time listener will automatically update
  };

  const loadProjects = async () => {
    try {
      let q;
      if (userRole === 'site_engineer') {
        q = query(
          collection(db, 'projects'),
          where('assignedUsers', 'array-contains', currentUser.uid)
        );
      } else {
        q = query(collection(db, 'projects'));
      }

      const snapshot = await getDocs(q);
      const projectsList = [];
      snapshot.forEach((doc) => {
        projectsList.push({ id: doc.id, ...doc.data() });
      });
      setProjects(projectsList);
      
      // Set first project as default if no project selected
      if (projectsList.length > 0 && !formData.projectId) {
        setFormData({ ...formData, projectId: projectsList[0].id });
      }
      
      // Show message if no projects assigned (for engineers)
      if (userRole === 'site_engineer' && projectsList.length === 0) {
        console.warn('No projects assigned to this engineer');
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Get project name for display
      const selectedProject = projects.find(p => p.id === formData.projectId);
      const requestData = {
        ...formData,
        quantity: parseFloat(formData.quantity),
        projectName: selectedProject?.name || 'Unknown Project',
        requestedBy: currentUser.uid,
        status: 'pending',
        createdAt: new Date().toISOString(),
        synced: navigator.onLine
      };

      if (navigator.onLine) {
        await addDoc(collection(db, 'materialRequests'), {
          ...requestData,
          synced: true
        });
      } else {
        const queue = JSON.parse(localStorage.getItem('materialOfflineQueue') || '[]');
        queue.push(requestData);
        localStorage.setItem('materialOfflineQueue', JSON.stringify(queue));
        alert('Request saved offline. Will sync when connection is restored.');
      }

      setFormData({
        projectId: projects[0]?.id || '',
        materialName: '',
        quantity: '',
        unit: 'kg',
        description: ''
      });
      setShowForm(false);
      // Real-time listener will automatically update
    } catch (error) {
      console.error('Error creating request:', error);
      alert('Failed to create material request');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId) => {
    try {
      const requestRef = doc(db, 'materialRequests', requestId);
      await updateDoc(requestRef, {
        status: 'approved',
        approvedBy: currentUser.uid,
        approvedAt: new Date().toISOString()
      });
      // Real-time listener will automatically update
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Failed to approve request');
    }
  };

  const handleReject = async (requestId) => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      const requestRef = doc(db, 'materialRequests', requestId);
      await updateDoc(requestRef, {
        status: 'rejected',
        rejectedBy: currentUser.uid,
        rejectedAt: new Date().toISOString(),
        rejectionReason: reason
      });
      // Real-time listener will automatically update
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Failed to reject request');
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'approved': return { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' };
      case 'pending': return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
      case 'rejected': return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' };
      default: return { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' };
    }
  };

  const filteredRequests = requests.filter(request => {
    if (filterStatus === 'all') return true;
    return request.status === filterStatus;
  });

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
        alignItems: windowWidth <= 768 ? 'stretch' : 'center',
        marginBottom: '2rem',
        gap: '1rem'
      }}>
        <div>
          <h1 style={{ 
            margin: '0 0 0.5rem 0', 
            fontSize: windowWidth <= 480 ? '1.5rem' : '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: windowWidth <= 480 ? '1.75rem' : '2rem' }}>📦</span>
            Material Requests
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
            {requests.length} {requests.length === 1 ? 'request' : 'requests'} total
          </p>
        </div>
        {userRole === 'site_engineer' && (
          <button 
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '0.75rem 1.5rem',
              background: showForm
                ? '#2563eb'
                : '#374151',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
          >
            <span style={{ fontSize: '1.25rem' }}>{showForm ? '✕' : '+'}</span>
            {showForm ? 'Cancel' : 'New Request'}
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      {requests.length > 0 && (
        <div style={{ 
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          overflowX: 'auto',
          paddingBottom: '0.5rem'
        }}>
          {['all', 'pending', 'approved', 'rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                padding: '0.5rem 1rem',
                background: filterStatus === status 
                    ? '#2563eb'
                  : 'white',
                color: filterStatus === status ? 'white' : '#6b7280',
                border: filterStatus === status ? 'none' : '2px solid #e5e7eb',
                borderRadius: '20px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                textTransform: 'capitalize'
              }}
              onMouseEnter={(e) => {
                if (filterStatus !== status) {
                  e.target.style.borderColor = '#667eea';
                  e.target.style.color = '#667eea';
                }
              }}
              onMouseLeave={(e) => {
                if (filterStatus !== status) {
                  e.target.style.borderColor = '#e5e7eb';
                  e.target.style.color = '#6b7280';
                }
              }}
            >
              {status === 'all' ? 'All Requests' : status}
            </button>
          ))}
        </div>
      )}

      {/* Create Request Form */}
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
            fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.5rem' }}>✨</span>
            Create Material Requests
          </h2>

          <form onSubmit={handleSubmit}>
            {/* Project */}
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
                  value={formData.projectId}
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                  required
                  disabled={projects.length === 0}
                  style={{ 
                    paddingLeft: '3rem',
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 3rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'all 0.2s',
                    cursor: projects.length === 0 ? 'not-allowed' : 'pointer',
                    background: projects.length === 0 ? '#f3f4f6' : 'white',
                    opacity: projects.length === 0 ? 0.6 : 1
                  }}
                  onFocus={(e) => {
                    if (projects.length > 0) e.target.style.borderColor = '#667eea';
                  }}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                >
                  {projects.length === 0 ? (
                    <option value="">No projects assigned - Contact Manager</option>
                  ) : (
                    <>
                      <option value="">Select Project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              {userRole === 'site_engineer' && projects.length === 0 && (
                <p style={{ 
                  fontSize: '0.75rem', 
                  color: '#ef4444', 
                  marginTop: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}>
                  <span>⚠️</span>
                  No projects assigned to you. Please contact your manager to get assigned to a project.
                </p>
              )}
            </div>

            {/* Material Name */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Material Name *
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ 
                  position: 'absolute',
                  left: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '1.25rem',
                  color: '#9ca3af'
                }}>
                  🧱
                </span>
                <input
                  type="text"
                  value={formData.materialName}
                  onChange={(e) => setFormData({ ...formData, materialName: e.target.value })}
                  placeholder="e.g., Cement, Steel Rods, Sand"
                  required
                  style={{ 
                    paddingLeft: '3rem',
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 3rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>
            </div>

            {/* Quantity and Unit */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: windowWidth <= 480 ? '1fr' : '2fr 1fr',
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
                  Quantity *
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ 
                    position: 'absolute',
                    left: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '1.25rem',
                    color: '#9ca3af'
                  }}>
                    #️⃣
                  </span>
                  <input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    step="0.01"
                    placeholder="0.00"
                    required
                    style={{ 
                      paddingLeft: '3rem',
                      width: '100%',
                      padding: '0.75rem 1rem 0.75rem 3rem',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#667eea'}
                    onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                  />
                </div>
              </div>
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
                  style={{ 
                    width: '100%',
                    padding: '0.75rem',
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
                  <option value="kg">kg</option>
                  <option value="tons">tons</option>
                  <option value="bags">bags</option>
                  <option value="pieces">pieces</option>
                  <option value="liters">liters</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Description (Optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={windowWidth <= 480 ? 3 : 4}
                placeholder="Additional details about the material request..."
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
            </div>

            {/* Submit Button */}
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
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(102, 126, 234, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => {
                if (!loading) e.target.style.transform = 'translateY(-2px)';
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
                  <span style={{ fontSize: '1.25rem' }}>📤</span>
                  Submit Request
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '3rem 2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
            {filterStatus === 'all' ? '📋' : '🔍'}
          </div>
          <p style={{ color: '#6b7280', fontSize: '1.125rem', fontWeight: '500' }}>
            {filterStatus === 'all' 
              ? 'No requests found' 
              : `No ${filterStatus} requests`}
          </p>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>
            {filterStatus === 'all' && userRole === 'site_engineer'
              ? 'Create your first material request to get started'
              : 'Try adjusting your filters'}
          </p>
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
          {filteredRequests.map((request) => {
            const statusColors = getStatusColor(request.status);
            return (
              <div 
                key={request.id} 
                style={{
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
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <h3 style={{ 
                      margin: '0 0 0.5rem 0',
                      fontSize: windowWidth <= 480 ? '1.125rem' : '1.25rem',
                      color: '#1f2937'
                    }}>
                      {request.materialName}
                    </h3>
                    <div style={{ 
                      fontSize: '0.875rem',
                      color: '#6b7280',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.25rem'
                    }}>
                      <span>🏗️</span>
                      {request.projectName || 'N/A'}
                    </div>
                    <div style={{ 
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      <span>📅</span>
                      {new Date(request.createdAt).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </div>
                  </div>
                  <span style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    background: statusColors.bg,
                    color: statusColors.text,
                    border: `2px solid ${statusColors.border}`,
                    whiteSpace: 'nowrap',
                    textTransform: 'capitalize'
                  }}>
                    {request.status}
                  </span>
                </div>


                {/* Quantity & Description Row */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: windowWidth > 768 ? 'row' : 'column',
                    gap: '1rem',
                    marginBottom: '1rem',
                  }}
                >
                  {/* Quantity */}
                  <div style={{
                    background: '#f9fafb',
                    padding: '1rem',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flex: windowWidth > 768 ? 1 : 'unset',
                    minWidth: 0
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                      flexShrink: 0
                    }}>
                      📦
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                        Requested Quantity
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
                        {request.quantity} {request.unit}
                      </div>
                    </div>
                  </div>
                  {/* Description */}
                  {request.description && (
                    <div style={{
                      background: '#f9fafb',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      flex: windowWidth > 768 ? 2 : 'unset',
                      minWidth: 0
                    }}>
                      <div style={{
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        color: '#6b7280',
                        marginBottom: '0.5rem'
                      }}>
                        Description
                      </div>
                      <p style={{
                        margin: 0,
                        color: '#374151',
                        lineHeight: '1.6',
                        fontSize: '0.875rem',
                        wordBreak: 'break-word'
                      }}>
                        {request.description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Rejection Reason */}
                {request.rejectionReason && (
                  <div style={{ 
                    background: '#fee2e2',
                    border: '2px solid #fecaca',
                    padding: '1rem',
                    borderRadius: '8px',
                    marginBottom: '1rem'
                  }}>
                    <div style={{ 
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: '#991b1b',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      <span>⚠️</span>
                      Rejection Reason
                    </div>
                    <p style={{ margin: 0, color: '#7f1d1d', fontSize: '0.875rem' }}>
                      {request.rejectionReason}
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                {(userRole === 'manager' || userRole === 'owner') && request.status === 'pending' && (
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.75rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid #e5e7eb',
                    flexWrap: 'wrap'
                  }}>
                    <button
                      onClick={() => handleApprove(request.id)}
                      style={{
                        flex: 1,
                        minWidth: '120px',
                        padding: '0.75rem 1rem',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem'
                      }}
                      onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                      onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                    >
                      <span style={{ fontSize: '1rem' }}>✓</span>
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      style={{
                        flex: 1,
                        minWidth: '120px',
                        padding: '0.75rem 1rem',
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem'
                      }}
                      onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                      onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                    >
                      <span style={{ fontSize: '1rem' }}>✕</span>
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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

export default Materials;