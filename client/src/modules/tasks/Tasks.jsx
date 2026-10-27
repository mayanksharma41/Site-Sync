import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';

const Tasks = () => {
  const { currentUser, userRole } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showWorkerAssignment, setShowWorkerAssignment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDailyLogModal, setShowDailyLogModal] = useState(false);
  const [dailyLogForm, setDailyLogForm] = useState({
    taskName: '',
    description: '',
    photo: null,
    photoUrl: '',
  });
  const [pendingTaskIdForLog, setPendingTaskIdForLog] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedToEngineer: '',
    projectId: '',
    dueDate: ''
  });
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [approvingTask, setApprovingTask] = useState(null);
  const [approvalCost, setApprovalCost] = useState('');

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadProjects();
    if (userRole === 'manager') {
      loadEngineers();
    }
    if (userRole === 'site_engineer') {
      loadEmployees();
    }
  }, [currentUser, userRole]);

  // Real-time listener for tasks
  useEffect(() => {
    if (!currentUser) return;

    let q;
    if (userRole === 'manager') {
      q = query(collection(db, 'tasks'));
    } else if (userRole === 'site_engineer') {
      q = query(
        collection(db, 'tasks'),
        where('assignedToEngineer', '==', currentUser.uid)
      );
    } else {
      return;
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksList = [];
      snapshot.forEach((doc) => {
        tasksList.push({ id: doc.id, ...doc.data() });
      });
      setTasks(tasksList.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      }));
    }, (error) => {
      console.error('Error listening to tasks:', error);
    });

    return () => unsubscribe();
  }, [currentUser, userRole]);

  const loadProjects = async () => {
    try {
      const q = query(collection(db, 'projects'));
      const snapshot = await getDocs(q);
      const projectsList = [];
      snapshot.forEach((doc) => {
        projectsList.push({ id: doc.id, ...doc.data() });
      });
      setProjects(projectsList);
    } catch (error) {
      console.error('Error loading projects:', error);
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

  const loadEmployees = async () => {
    try {
      const q = query(collection(db, 'employees'));
      const snapshot = await getDocs(q);
      const employeesList = [];
      snapshot.forEach((doc) => {
        employeesList.push({ id: doc.id, ...doc.data() });
      });
      setEmployees(employeesList);
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const selectedProject = projects.find(p => p.id === formData.projectId);
      const taskData = {
        title: formData.title,
        description: formData.description,
        assignedToEngineer: formData.assignedToEngineer,
        projectId: formData.projectId || null,
        projectName: selectedProject?.name || 'N/A',
        dueDate: formData.dueDate || null,
        assignedWorkers: [],
        status: 'pending',
        approved: false,
        engineerApproved: false,
        billed: false,
        assignedBy: currentUser.uid,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'tasks'), taskData);

      setFormData({
        title: '',
        description: '',
        assignedToEngineer: '',
        projectId: '',
        dueDate: ''
      });
      setShowForm(false);
      alert('Task assigned to engineer successfully!');
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignWorkers = async (taskId) => {
    if (selectedWorkers.length === 0) {
      alert('Please select at least one worker');
      return;
    }

    setLoading(true);
    try {
      const taskRef = doc(db, 'tasks', taskId);
      await updateDoc(taskRef, {
        assignedWorkers: selectedWorkers,
        status: 'in_progress',
        workersAssignedAt: serverTimestamp()
      });
      
      setShowWorkerAssignment(null);
      setSelectedWorkers([]);
      alert('Workers assigned successfully!');
    } catch (error) {
      console.error('Error assigning workers:', error);
      alert('Failed to assign workers');
    } finally {
      setLoading(false);
    }
  };

  const handleEngineerApprove = async (taskId) => {
    if (!approvalCost || parseFloat(approvalCost) <= 0) {
      alert('Please enter a valid cost amount');
      return;
    }

    try {
      const taskRef = doc(db, 'tasks', taskId);
      await updateDoc(taskRef, {
        approved: true,
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp(),
        approvedCost: parseFloat(approvalCost),
        engineerApproved: true,
        status: 'completed'
      });
      setApprovingTask(null);
      setApprovalCost('');
      alert('Task approved with cost! Manager can now generate bill.');
    } catch (error) {
      console.error('Error approving task:', error);
      alert('Failed to approve task');
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'completed': return { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' };
      case 'in_progress': return { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' };
      case 'pending': return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
      default: return { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' };
    }
  };

  const filteredTasks = tasks.filter(task => {
    if (filterStatus === 'all') return true;
    return task.status === filterStatus;
  });

  if (userRole !== 'manager' && userRole !== 'site_engineer') {
    return (
      <div style={{ 
        width: '100%',
        maxWidth: '100%',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2>Access Restricted</h2>
        <p style={{ color: '#6b7280' }}>Only managers and engineers can view tasks.</p>
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
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          ✅ Task Management
        </h1>
        {userRole === 'manager' && (
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
              whiteSpace: 'nowrap'
            }}
          >
            {showForm ? '✕ Cancel' : '+ Assign Task to Engineer'}
          </button>
        )}
      </div>

      {tasks.length > 0 && (
        <div style={{ 
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          overflowX: 'auto',
          paddingBottom: '0.5rem'
        }}>
          {['all', 'pending', 'in_progress', 'completed'].map((status) => (
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
                whiteSpace: 'nowrap',
                textTransform: 'capitalize'
              }}
            >
              {status === 'all' ? 'All Tasks' : status.replace('_', ' ')}
            </button>
          ))}
        </div>
      )}

      {/* Manager: Create Task Form */}
      {showForm && userRole === 'manager' && (
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
            ✨ Assign Task to Site Engineer
          </h2>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                Task Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
                rows={4}
                required
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
              gridTemplateColumns: windowWidth <= 480 ? '1fr' : 'repeat(2, 1fr)',
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
                  Assign To Engineer *
                </label>
                <select
                  value={formData.assignedToEngineer}
                  onChange={(e) => setFormData({ ...formData, assignedToEngineer: e.target.value })}
                  required
                  style={{ 
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                >
                  <option value="">Select Engineer</option>
                  {engineers.map((eng) => (
                    <option key={eng.id} value={eng.id}>
                      {eng.name || eng.email}
                    </option>
                  ))}
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
                  Project (Optional)
                </label>
                <select
                  value={formData.projectId}
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                  style={{ 
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                >
                  <option value="">Select Project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
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
                Due Date (Optional)
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
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
              {loading ? 'Assigning...' : 'Assign Task to Engineer'}
            </button>
          </form>
        </div>
      )}

      {/* Tasks List */}
      {filteredTasks.length === 0 ? (
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '3rem 2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
          <p style={{ color: '#6b7280' }}>No tasks found</p>
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
          {filteredTasks.map((task) => {
            const statusColors = getStatusColor(task.status);
            return (
              <div key={task.id} style={{
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
                  gap: '0.5rem'
                }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: windowWidth <= 480 ? '1.125rem' : '1.25rem' }}>
                      {task.title}
                    </h3>
                    <p style={{ 
                      margin: '0 0 0.5rem 0',
                      color: '#6b7280',
                      fontSize: '0.875rem',
                      lineHeight: '1.6'
                    }}>
                      {task.description}
                    </p>
                    {task.projectName && (
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>
                        Project: {task.projectName}
                      </p>
                    )}
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
                    {task.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Engineer: Assign Workers Section */}
                {userRole === 'site_engineer' && task.status === 'pending' && (
                  <div style={{ 
                    paddingTop: '1rem',
                    borderTop: '1px solid #e5e7eb'
                  }}>
                    {showWorkerAssignment === task.id ? (
                      <div style={{
                        background: '#f0f9ff',
                        padding: '1rem',
                        borderRadius: '8px',
                        border: '2px solid #bfdbfe'
                      }}>
                        <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#1e40af' }}>
                          Select Workers for This Task
                        </h4>
                        <div style={{ marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                          {employees.map((emp) => (
                            <label key={emp.id} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.5rem',
                              cursor: 'pointer',
                              borderRadius: '4px',
                              marginBottom: '0.25rem'
                            }}>
                              <input
                                type="checkbox"
                                checked={selectedWorkers.includes(emp.empId)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedWorkers([...selectedWorkers, emp.empId]);
                                  } else {
                                    setSelectedWorkers(selectedWorkers.filter(id => id !== emp.empId));
                                  }
                                }}
                              />
                              <span style={{ fontSize: '0.875rem' }}>
                                {emp.name} ({emp.empId})
                              </span>
                            </label>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button
                            onClick={() => {
                              setShowWorkerAssignment(null);
                              setSelectedWorkers([]);
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
                            onClick={() => handleAssignWorkers(task.id)}
                            disabled={loading}
                            style={{
                              flex: 1,
                              padding: '0.75rem 1rem',
                              background: loading ? '#9ca3af' : '#2563eb',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '0.875rem',
                              fontWeight: '600',
                              cursor: loading ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {loading ? 'Assigning...' : 'Assign Workers'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowWorkerAssignment(task.id)}
                        style={{
                          width: '100%',
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
                        👷 Assign Workers
                      </button>
                    )}
                  </div>
                )}

                {/* Assigned Workers Display */}
                {task.assignedWorkers && task.assignedWorkers.length > 0 && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: '#6b7280'
                  }}>
                    <strong>Assigned Workers:</strong> {task.assignedWorkers.join(', ')}
                  </div>
                )}

                {/* Engineer: Approve Task Section */}
                {userRole === 'site_engineer' && task.status === 'in_progress' && (
                  <div style={{ 
                    paddingTop: '1rem',
                    borderTop: '1px solid #e5e7eb',
                    marginTop: '1rem'
                  }}>
                    {approvingTask?.id === task.id ? (
                      <div style={{
                        background: '#f0f9ff',
                        padding: '1rem',
                        borderRadius: '8px',
                        border: '2px solid #bfdbfe'
                      }}>
                        <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#1e40af' }}>
                          Approve Task with Cost
                        </h4>
                        <div style={{ marginBottom: '1rem' }}>
                          <label style={{ 
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontWeight: '600',
                            color: '#374151',
                            fontSize: '0.875rem'
                          }}>
                            Enter Cost for This Task (₹) *
                          </label>
                          <input
                            type="number"
                            value={approvalCost}
                            onChange={(e) => setApprovalCost(e.target.value)}
                            step="0.01"
                            min="0"
                            placeholder="0.00"
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
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button
                            onClick={() => {
                              setApprovingTask(null);
                              setApprovalCost('');
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
                            onClick={() => handleEngineerApprove(task.id)}
                            style={{
                              flex: 1,
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
                            ✓ Approve with Cost
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setApprovingTask(task)}
                        style={{
                          width: '100%',
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
                        ✓ Approve Task & Set Cost
                      </button>
                    )}
                  </div>
                )}

                {/* Approved Status */}
                {task.engineerApproved && task.approved && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem 1rem',
                    background: '#f3f4f6',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: '#1e40af',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>✓</span>
                      <span>Engineer Approved</span>
                    </div>
                    {task.approvedCost && (
                      <div style={{ 
                        padding: '0.25rem 0.75rem',
                        background: 'white',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontWeight: 'bold',
                        color: '#059669'
                      }}>
                        Cost: ₹{task.approvedCost.toFixed(2)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Tasks;
