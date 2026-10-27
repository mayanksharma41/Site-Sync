import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';

const Projects = () => {
  const { currentUser, userRole } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    description: '',
    assignedEngineers: []
  });
  const [engineers, setEngineers] = useState([]);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadProjects();
    if ((userRole === 'manager' || userRole === 'owner') && showForm) {
      loadEngineers();
    }
  }, [currentUser, userRole, showForm]);

  const loadProjects = async () => {
    try {
      let q;
      if (userRole === 'owner' || userRole === 'manager') {
        q = query(collection(db, 'projects'));
      } else {
        q = query(
          collection(db, 'projects'),
          where('assignedUsers', 'array-contains', currentUser.uid)
        );
      }

      const snapshot = await getDocs(q);
      const projectsList = [];
      snapshot.forEach((doc) => {
        projectsList.push({ id: doc.id, ...doc.data() });
      });
      setProjects(projectsList);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEngineers = async () => {
    try {
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'site_engineer')
      );
      const snapshot = await getDocs(q);
      const engineersList = [];
      snapshot.forEach((doc) => {
        engineersList.push({ id: doc.id, ...doc.data() });
      });
      setEngineers(engineersList);
    } catch (error) {
      console.error('Error loading engineers:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'projects'), {
        name: formData.name,
        location: formData.location,
        description: formData.description,
        createdBy: currentUser.uid,
        assignedUsers: formData.assignedEngineers || [],
        createdAt: new Date().toISOString(),
        status: 'active'
      });
      setFormData({ name: '', location: '', description: '', assignedEngineers: [] });
      setShowForm(false);
      loadProjects();
      alert('Project created successfully!');
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project');
    }
  };

  const assignUser = async (projectId, userId) => {
    try {
      const projectRef = doc(db, 'projects', projectId);
      const projectDoc = await getDoc(projectRef);
      if (projectDoc.exists()) {
        const assignedUsers = projectDoc.data().assignedUsers || [];
        if (!assignedUsers.includes(userId)) {
          await updateDoc(projectRef, {
            assignedUsers: [...assignedUsers, userId]
          });
          loadProjects();
        }
      }
    } catch (error) {
      console.error('Error assigning user:', error);
    }
  };

  const filteredProjects = projects.filter(project => {
    if (filterStatus === 'all') return true;
    return project.status === filterStatus;
  });

  const getStatusColor = (status) => {
    switch(status) {
      case 'active': return { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' };
      case 'completed': return { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' };
      case 'on-hold': return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
      default: return { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' };
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '60vh',
        fontSize: '1.125rem',
        color: '#6b7280'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          Loading projects...
        </div>
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
            <span style={{ fontSize: windowWidth <= 480 ? '1.75rem' : '2rem' }}>🏗️</span>
            Projects
          </h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
            {projects.length} {projects.length === 1 ? 'project' : 'projects'} total
          </p>
        </div>
        {(userRole === 'owner' || userRole === 'manager') && (
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
            {showForm ? 'Cancel' : 'New Project'}
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      {projects.length > 0 && (
        <div style={{ 
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          overflowX: 'auto',
          paddingBottom: '0.5rem'
        }}>
          {['all', 'active', 'completed', 'on-hold'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                padding: '0.5rem 1rem',
                background: filterStatus === status 
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
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
              {status === 'all' ? 'All Projects' : status.replace('-', ' ')}
            </button>
          ))}
        </div>
      )}

      {/* Create Project Form */}
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
            Create New Project
          </h2>

          <form onSubmit={handleSubmit}>
            {/* Project Name */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Project Name *
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
                  📋
                </span>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter project name"
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

            {/* Location */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Location *
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
                  📍
                </span>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Enter project location"
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

            {/* Description */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={windowWidth <= 480 ? 3 : 4}
                placeholder="Describe the project details..."
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
            </div>

            {/* Assign Engineers */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Assign Site Engineers (Optional)
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
                  👷
                </span>
                <select
                  multiple
                  value={formData.assignedEngineers}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                    setFormData({ ...formData, assignedEngineers: selected });
                  }}
                  style={{ 
                    paddingLeft: '3rem',
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 3rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    background: 'white',
                    minHeight: '100px'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                >
                  {engineers.length === 0 ? (
                    <option disabled>No engineers available</option>
                  ) : (
                    engineers.map((engineer) => (
                      <option key={engineer.id} value={engineer.id}>
                        {engineer.name || engineer.email} - {engineer.email}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <p style={{ 
                fontSize: '0.75rem', 
                color: '#6b7280', 
                marginTop: '0.25rem'
              }}>
                Hold Ctrl (Windows) or Cmd (Mac) to select multiple engineers
              </p>
              {formData.assignedEngineers.length > 0 && (
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem',
                  background: '#f0f9ff',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  color: '#0369a1'
                }}>
                  ✓ {formData.assignedEngineers.length} engineer(s) selected
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button 
              type="submit"
              style={{
                width: '100%',
                padding: '1rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
            >
              <span style={{ fontSize: '1.25rem' }}>✓</span>
              Create Project
            </button>
          </form>
        </div>
      )}

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '3rem 2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
            {filterStatus === 'all' ? '📁' : '🔍'}
          </div>
          <p style={{ color: '#6b7280', fontSize: '1.125rem', fontWeight: '500' }}>
            {filterStatus === 'all' 
              ? 'No projects found' 
              : `No ${filterStatus} projects`}
          </p>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>
            {filterStatus === 'all' && (userRole === 'owner' || userRole === 'manager')
              ? 'Create your first project to get started'
              : 'Try adjusting your filters'}
          </p>
        </div>
      ) : (
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: windowWidth <= 480 
            ? '1fr' 
            : windowWidth <= 1024 
              ? 'repeat(2, 1fr)' 
              : 'repeat(3, 1fr)',
          gap: '1.5rem'
        }}>
          {filteredProjects.map((project) => {
            const statusColors = getStatusColor(project.status);
            return (
              <div 
                key={project.id} 
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s',
                  border: '2px solid #f3f4f6',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.15)';
                  e.currentTarget.style.borderColor = '#667eea';
                  e.currentTarget.style.transform = 'translateY(-4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.borderColor = '#f3f4f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Header */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ 
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    marginBottom: '0.75rem'
                  }}>
                    <h2 style={{ 
                      margin: 0,
                      fontSize: '1.25rem',
                      color: '#1f2937',
                      flex: 1,
                      wordBreak: 'break-word'
                    }}>
                      {project.name}
                    </h2>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      background: statusColors.bg,
                      color: statusColors.text,
                      border: `1px solid ${statusColors.border}`,
                      whiteSpace: 'nowrap',
                      textTransform: 'capitalize'
                    }}>
                      {project.status}
                    </span>
                  </div>

                  {/* Location */}
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: '#6b7280',
                    fontSize: '0.875rem',
                    marginBottom: '1rem'
                  }}>
                    <span style={{ fontSize: '1rem' }}>📍</span>
                    <span>{project.location}</span>
                  </div>
                </div>

                {/* Description */}
                <div style={{ 
                  flex: 1,
                  marginBottom: '1rem'
                }}>
                  <p style={{ 
                    margin: 0,
                    color: '#4b5563',
                    lineHeight: '1.6',
                    fontSize: '0.875rem'
                  }}>
                    {project.description}
                  </p>
                </div>

                {/* Footer */}
                <div style={{
                  paddingTop: '1rem',
                  borderTop: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: '#f3f4f6',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: '#4b5563'
                  }}>
                    <span style={{ fontSize: '1rem' }}>👥</span>
                    {project.assignedUsers?.length || 0} assigned
                  </div>
                  {project.createdAt && (
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      <span>📅</span>
                      {new Date(project.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Projects;