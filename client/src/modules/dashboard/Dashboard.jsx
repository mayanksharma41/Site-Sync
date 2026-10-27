import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend, Area, AreaChart 
} from 'recharts';

const Dashboard = () => {
  const { currentUser, userRole } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    totalDPRs: 0,
    totalAttendance: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    avgAttendanceRate: 0,
    totalUsers: 0
  });
  const [dprData, setDprData] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [projectStatusData, setProjectStatusData] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [topProjects, setTopProjects] = useState([]);
  const [productivityTrend, setProductivityTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('7days');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [projectsData, setProjectsData] = useState([]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    loadDashboardData();
    
    // Real-time listener for Owner Dashboard - update costs when bills are generated
    if (userRole === 'owner') {
      const billsUnsubscribe = onSnapshot(
        collection(db, 'gstBills'),
        () => {
          // Reload dashboard data when bills change
          loadDashboardData();
        },
        (error) => {
          console.error('Error listening to GST bills:', error);
        }
      );
      
      // Also listen to tasks for time progression updates
      const tasksUnsubscribe = onSnapshot(
        collection(db, 'tasks'),
        () => {
          loadDashboardData();
        },
        (error) => {
          console.error('Error listening to tasks:', error);
        }
      );
      
      return () => {
        billsUnsubscribe();
        tasksUnsubscribe();
      };
    }
  }, [currentUser, userRole, timeRange]);

  const getDaysCount = () => {
    switch(timeRange) {
      case '30days': return 30;
      case '90days': return 90;
      default: return 7;
    }
  };

  const loadDashboardData = async () => {
    try {
      const days = getDaysCount();
      
      // Load projects with status filtering
      let projectsQuery;
      if (userRole === 'owner' || userRole === 'manager') {
        projectsQuery = query(collection(db, 'projects'));
      } else {
        projectsQuery = query(
          collection(db, 'projects'),
          where('assignedUsers', 'array-contains', currentUser.uid)
        );
      }
      const projectsSnapshot = await getDocs(projectsQuery);
      const totalProjects = projectsSnapshot.size;
      
      // Store projects data for Owner Dashboard
      const projectsList = [];
      let activeProjects = 0;
      let completedProjects = 0;
      const projectDPRCount = {};

      projectsSnapshot.forEach((doc) => {
        const project = doc.data();
        projectsList.push({ id: doc.id, ...project });
        if (project.status === 'active' || project.status === 'in-progress') activeProjects++;
        if (project.status === 'completed') completedProjects++;
        projectDPRCount[doc.id] = { name: project.name, count: 0 };
      });
      setProjectsData(projectsList);

      // Load DPRs
      let dprsQuery;
      if (userRole === 'owner' || userRole === 'manager') {
        dprsQuery = query(collection(db, 'dprs'));
      } else {
        dprsQuery = query(
          collection(db, 'dprs'),
          where('createdBy', '==', currentUser.uid)
        );
      }
      const dprsSnapshot = await getDocs(dprsQuery);
      const totalDPRs = dprsSnapshot.size;

      // Process DPR data for chart
      const dprsByDate = {};
      const dateRange = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        dateRange.push(dateStr);
        dprsByDate[dateStr] = 0;
      }

      dprsSnapshot.forEach((doc) => {
        const dpr = doc.data();
        const dateStr = dpr.createdAt?.split('T')[0];
        if (dprsByDate.hasOwnProperty(dateStr)) {
          dprsByDate[dateStr]++;
        }
        // Count DPRs per project
        if (dpr.projectId && projectDPRCount[dpr.projectId]) {
          projectDPRCount[dpr.projectId].count++;
        }
      });

      const dprChartData = dateRange.map(date => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: dprsByDate[date]
      }));

      // Top projects by DPR count
      const topProjectsData = Object.entries(projectDPRCount)
        .map(([id, data]) => data)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Load attendance
      let attendanceQuery;
      if (userRole === 'owner' || userRole === 'manager') {
        attendanceQuery = query(collection(db, 'attendance'));
      } else {
        attendanceQuery = query(
          collection(db, 'attendance'),
          where('userId', '==', currentUser.uid)
        );
      }
      const attendanceSnapshot = await getDocs(attendanceQuery);
      const totalAttendance = attendanceSnapshot.size;

      // Process attendance data
      const attendanceByDate = {};
      dateRange.forEach(date => {
        attendanceByDate[date] = 0;
      });

      let presentCount = 0;
      attendanceSnapshot.forEach((doc) => {
        const att = doc.data();
        const dateStr = att.date;
        if (attendanceByDate.hasOwnProperty(dateStr)) {
          attendanceByDate[dateStr]++;
        }
        if (att.status === 'present') presentCount++;
      });

      const avgAttendanceRate = totalAttendance > 0 
        ? ((presentCount / totalAttendance) * 100).toFixed(1) 
        : 0;

      const attendanceChartData = dateRange.map(date => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: attendanceByDate[date]
      }));

      // Productivity trend (DPRs + Attendance combined)
      const productivityData = dateRange.map(date => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dprs: dprsByDate[date],
        attendance: attendanceByDate[date]
      }));

      // Load material requests
      let materialsQuery;
      if (userRole === 'owner' || userRole === 'manager') {
        materialsQuery = query(collection(db, 'materialRequests'));
      } else {
        materialsQuery = query(
          collection(db, 'materialRequests'),
          where('requestedBy', '==', currentUser.uid)
        );
      }
      const materialsSnapshot = await getDocs(materialsQuery);
      let pendingRequests = 0;
      let approvedRequests = 0;
      let rejectedRequests = 0;

      materialsSnapshot.forEach((doc) => {
        const request = doc.data();
        if (request.status === 'pending') pendingRequests++;
        if (request.status === 'approved') approvedRequests++;
        if (request.status === 'rejected') rejectedRequests++;
      });

      // Project status distribution
      const projectStatus = [
        { name: 'Active', value: activeProjects },
        { name: 'Completed', value: completedProjects },
        { name: 'Inactive', value: totalProjects - activeProjects - completedProjects }
      ].filter(item => item.value > 0);

      // Recent activities (mock data - replace with actual activity log)
      const activities = [
        { id: 1, type: 'dpr', message: 'New DPR submitted', time: '2 hours ago' },
        { id: 2, type: 'project', message: 'Project status updated', time: '4 hours ago' },
        { id: 3, type: 'request', message: 'Material request approved', time: '1 day ago' },
        { id: 4, type: 'attendance', message: 'Attendance marked', time: '1 day ago' },
        { id: 5, type: 'user', message: 'New team member added', time: '2 days ago' }
      ];

      // Load users count (for managers/owners)
      let totalUsers = 0;
      if (userRole === 'owner' || userRole === 'manager') {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        totalUsers = usersSnapshot.size;
      }

      // Load tasks for all roles (for completion rate calculation)
      let totalTasks = 0;
      let completedTasks = 0;
      let totalCost = 0;
      let projectFinancials = {};
      let projectTimeProgress = {};

      // Load tasks for completion rate (all roles can see this)
      const tasksSnapshot = await getDocs(collection(db, 'tasks'));
      totalTasks = tasksSnapshot.size;
      tasksSnapshot.forEach((doc) => {
        const task = doc.data();
        if (task.status === 'completed') completedTasks++;
      });

      if (userRole === 'owner') {
        // For owner, also calculate project-wise progress
        tasksSnapshot.forEach((doc) => {
          const task = doc.data();
          if (task.projectId) {
            if (!projectTimeProgress[task.projectId]) {
              projectTimeProgress[task.projectId] = { total: 0, completed: 0 };
            }
            projectTimeProgress[task.projectId].total++;
            if (task.status === 'completed') {
              projectTimeProgress[task.projectId].completed++;
            }
          }
        });

        // Load GST Bills for financial data (replacing invoices)
        const gstBillsSnapshot = await getDocs(collection(db, 'gstBills'));
        gstBillsSnapshot.forEach((doc) => {
          const bill = doc.data();
          totalCost += bill.totalAmount || 0;
          if (bill.projectId) {
            const projectId = bill.projectId;
            if (!projectFinancials[projectId]) {
              projectFinancials[projectId] = 0;
            }
            projectFinancials[projectId] += bill.totalAmount || 0;
          } else if (bill.taskId) {
            // Fallback: Get task to find project if projectId not in bill
            const task = tasksSnapshot.docs.find(t => t.id === bill.taskId);
            if (task && task.data().projectId) {
              const projectId = task.data().projectId;
              if (!projectFinancials[projectId]) {
                projectFinancials[projectId] = 0;
              }
              projectFinancials[projectId] += bill.totalAmount || 0;
            }
          }
        });

        // Calculate time progress for each project
        projectsSnapshot.forEach((doc) => {
          const project = doc.data();
          const projectId = doc.id;
          if (!projectTimeProgress[projectId]) {
            projectTimeProgress[projectId] = { total: 0, completed: 0 };
          }
          if (!projectFinancials[projectId]) {
            projectFinancials[projectId] = 0;
          }
        });
      }

      setStats({
        totalProjects,
        activeProjects,
        completedProjects,
        totalDPRs,
        totalAttendance,
        pendingRequests,
        approvedRequests,
        rejectedRequests,
        avgAttendanceRate,
        totalUsers,
        totalTasks,
        completedTasks,
        totalCost,
        projectFinancials,
        projectTimeProgress
      });
      setDprData(dprChartData);
      setAttendanceData(attendanceChartData);
      setProjectStatusData(projectStatus);
      setRecentActivities(activities);
      setTopProjects(topProjectsData);
      setProductivityTrend(productivityData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const requestPieData = [
    { name: 'Approved', value: stats.approvedRequests },
    { name: 'Pending', value: stats.pendingRequests },
    { name: 'Rejected', value: stats.rejectedRequests }
  ].filter(item => item.value > 0);

  if (loading) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div className="loading">{t('common.loading')}</div>
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
        gap: '1rem',
        marginBottom: '2rem' 
      }}>
        <h1 style={{ margin: 0 }}>{t('dashboard.title')}</h1>
        <div>
          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value)}
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: '8px', 
              border: '2px solid #e5e7eb',
              width: windowWidth <= 768 ? '100%' : 'auto',
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}
          >
            <option value="7days">7 {t('common.days') || 'Days'}</option>
            <option value="30days">30 {t('common.days') || 'Days'}</option>
            <option value="90days">90 {t('common.days') || 'Days'}</option>
          </select>
        </div>
      </div>

      {/* Enhanced Stats Cards */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: windowWidth <= 480 ? '1fr' : windowWidth <= 768 ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div className="card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <h3 style={{ marginBottom: '0.5rem', opacity: 0.9 }}>{t('dashboard.totalProjects')}</h3>
          <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{stats.totalProjects}</h2>
          <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>{stats.activeProjects} {t('dashboard.activeProjects')}</p>
        </div>
        <div className="card" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
          <h3 style={{ marginBottom: '0.5rem', opacity: 0.9 }}>Total DPRs</h3>
          <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{stats.totalDPRs}</h2>
          <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>Daily progress reports</p>
        </div>
        <div className="card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
          <h3 style={{ marginBottom: '0.5rem', opacity: 0.9 }}>Attendance</h3>
          <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{stats.totalAttendance}</h2>
          <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>{stats.avgAttendanceRate}% average rate</p>
        </div>
        <div className="card" style={{ background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: 'white' }}>
          <h3 style={{ marginBottom: '0.5rem', opacity: 0.9 }}>Pending Requests</h3>
          <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{stats.pendingRequests}</h2>
          <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>{stats.approvedRequests} approved</p>
        </div>
      </div>

      {/* Two Column Layout */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: windowWidth <= 768 ? '1fr' : 'repeat(2, 1fr)',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        {/* Productivity Trend */}
        <div className="card">
          <h2 style={{ marginBottom: '1rem', fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem' }}>Productivity Trend</h2>
          <ResponsiveContainer width="100%" height={windowWidth <= 480 ? 200 : 250}>
            <AreaChart data={productivityTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" style={{ fontSize: '0.75rem' }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="dprs" stackId="1" stroke="#2563eb" fill="#2563eb" name="DPRs" />
              <Area type="monotone" dataKey="attendance" stackId="1" stroke="#10b981" fill="#10b981" name="Attendance" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Project Status Distribution */}
        <div className="card">
          <h2 style={{ marginBottom: '1rem', fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem' }}>Project Status Distribution</h2>
          <ResponsiveContainer width="100%" height={windowWidth <= 480 ? 200 : 250}>
            <PieChart>
              <Pie
                data={projectStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={90}
                fill="#8884d8"
                dataKey="value"
              >
                {projectStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two Column Layout for Charts */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: windowWidth <= 768 ? '1fr' : 'repeat(2, 1fr)',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div className="card">
          <h2 style={{ marginBottom: '1rem', fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem' }}>DPR Submissions</h2>
          <ResponsiveContainer width="100%" height={windowWidth <= 480 ? 200 : 250}>
            <BarChart data={dprData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" style={{ fontSize: '0.75rem' }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#2563eb" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: '1rem', fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem' }}>Attendance Records</h2>
          <ResponsiveContainer width="100%" height={windowWidth <= 480 ? 200 : 250}>
            <LineChart data={attendanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" style={{ fontSize: '0.75rem' }} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Section */}
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: windowWidth <= 480 ? '1fr' : windowWidth <= 768 ? '1fr' : 'repeat(3, 1fr)',
        gap: '1rem'
      }}>
        {/* Material Requests */}
        {requestPieData.length > 0 && (
          <div className="card">
            <h2 style={{ marginBottom: '1rem', fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem' }}>Material Requests</h2>
            <ResponsiveContainer width="100%" height={windowWidth <= 480 ? 180 : 200}>
              <PieChart>
                <Pie
                  data={requestPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {requestPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top Projects */}
        <div className="card">
          <h2 style={{ marginBottom: '1rem', fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem' }}>Most Active Projects</h2>
          <div style={{ maxHeight: windowWidth <= 480 ? '180px' : '200px', overflowY: 'auto' }}>
            {topProjects.map((project, index) => (
              <div key={index} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '0.75rem 0', 
                borderBottom: index < topProjects.length - 1 ? '1px solid #e5e7eb' : 'none' 
              }}>
                <span style={{ fontWeight: '500' }}>{project.name}</span>
                <span style={{ color: '#2563eb', fontWeight: 'bold' }}>{project.count} DPRs</span>
              </div>
            ))}
            {topProjects.length === 0 && (
              <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem 0' }}>No project data available</p>
            )}
          </div>
        </div>

        {/* Recent Activities */}
        <div className="card">
          <h2 style={{ marginBottom: '1rem', fontSize: windowWidth <= 480 ? '1.25rem' : '1.5rem' }}>Recent Activities</h2>
          <div style={{ maxHeight: windowWidth <= 480 ? '180px' : '200px', overflowY: 'auto' }}>
            {recentActivities.map((activity) => (
              <div key={activity.id} style={{ 
                padding: '0.75rem 0', 
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <div style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  backgroundColor: COLORS[recentActivities.indexOf(activity) % COLORS.length],
                  flexShrink: 0
                }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>{activity.message}</p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Owner Dashboard: Financial and Time Progression Per Project */}
      {userRole === 'owner' && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ 
            marginBottom: '1.5rem', 
            fontSize: windowWidth <= 480 ? '1.5rem' : '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            💰 Financial & Time Progression by Project
          </h2>
          
          <div style={{ 
            display: 'grid',
            gridTemplateColumns: windowWidth <= 768 ? '1fr' : 'repeat(2, 1fr)',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            {/* Financial Summary */}
            <div className="card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white' }}>
              <h3 style={{ marginBottom: '0.5rem', opacity: 0.9 }}>Total Cost</h3>
              <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                ₹{stats.totalCost?.toLocaleString('en-IN') || '0'}
              </h2>
              <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>From all invoices</p>
            </div>

            {/* Task Completion */}
            <div className="card" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: 'white' }}>
              <h3 style={{ marginBottom: '0.5rem', opacity: 0.9 }}>Task Completion</h3>
              <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                {stats.totalTasks > 0 ? ((stats.completedTasks / stats.totalTasks) * 100).toFixed(1) : 0}%
              </h2>
              <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                {stats.completedTasks || 0} / {stats.totalTasks || 0} tasks
              </p>
            </div>
          </div>

          {/* Single Unified Gantt Chart */}
          <div className="card" style={{ 
            padding: windowWidth <= 480 ? '1rem' : '1.5rem',
            marginBottom: '2rem'
          }}>
            <h3 style={{ 
              marginBottom: '1.5rem', 
              fontSize: windowWidth <= 480 ? '1.125rem' : '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              📊 All Projects Timeline & Progress
            </h3>

            {Object.keys(stats.projectFinancials || {}).length > 0 ? (
              <div style={{ 
                overflowX: 'auto',
                paddingBottom: '1rem'
              }}>
                <div style={{ minWidth: '600px' }}>
                  {/* Gantt Chart Container */}
                  <div style={{
                    background: '#f9fafb',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '2px solid #e5e7eb'
                  }}>
                    {/* Chart Header */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '200px 1fr 120px',
                      gap: '1rem',
                      marginBottom: '1rem',
                      paddingBottom: '0.75rem',
                      borderBottom: '2px solid #d1d5db',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: '#4b5563'
                    }}>
                      <div>Project Name</div>
                      <div>Timeline Progress</div>
                      <div style={{ textAlign: 'center' }}>Completion</div>
                    </div>

                    {/* Project Rows */}
                    {Object.keys(stats.projectFinancials || {}).map((projectId, index) => {
                      const projectData = projectsData.find(p => p.id === projectId);
                      if (!projectData) return null;
                      
                      const financial = stats.projectFinancials[projectId] || 0;
                      const timeProgress = stats.projectTimeProgress[projectId] || { total: 0, completed: 0 };
                      const timePercentage = timeProgress.total > 0 
                        ? ((timeProgress.completed / timeProgress.total) * 100).toFixed(1) 
                        : 0;

                      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
                      const projectColor = colors[index % colors.length];

                      return (
                        <div key={projectId} style={{
                          display: 'grid',
                          gridTemplateColumns: '200px 1fr 120px',
                          gap: '1rem',
                          alignItems: 'center',
                          padding: '1rem 0',
                          borderBottom: index === Object.keys(stats.projectFinancials).length - 1 ? 'none' : '1px solid #e5e7eb'
                        }}>
                          {/* Project Info */}
                          <div>
                            <div style={{
                              fontSize: '0.875rem',
                              fontWeight: '600',
                              color: '#1f2937',
                              marginBottom: '0.25rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {projectData.name}
                            </div>
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              marginBottom: '0.25rem'
                            }}>
                              📍 {projectData.location}
                            </div>
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#059669',
                              fontWeight: '600'
                            }}>
                              ₹{financial.toLocaleString('en-IN')}
                            </div>
                          </div>

                          {/* Timeline Bar */}
                          <div style={{
                            position: 'relative',
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center'
                          }}>
                            <div style={{
                              width: '100%',
                              height: '24px',
                              background: '#e5e7eb',
                              borderRadius: '12px',
                              overflow: 'hidden',
                              position: 'relative'
                            }}>
                              {/* Progress Fill */}
                              <div style={{
                                width: `${timePercentage}%`,
                                height: '100%',
                                background: `linear-gradient(90deg, ${projectColor} 0%, ${projectColor}dd 100%)`,
                                borderRadius: '12px',
                                transition: 'width 0.3s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                paddingRight: '8px',
                                position: 'relative'
                              }}>
                                {parseFloat(timePercentage) > 15 && (
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: '700',
                                    color: 'white'
                                  }}>
                                    {timePercentage}%
                                  </span>
                                )}
                              </div>
                              {/* Percentage outside bar if too small */}
                              {parseFloat(timePercentage) <= 15 && (
                                <span style={{
                                  position: 'absolute',
                                  left: `calc(${timePercentage}% + 8px)`,
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  fontSize: '0.7rem',
                                  fontWeight: '700',
                                  color: projectColor
                                }}>
                                  {timePercentage}%
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Stats */}
                          <div style={{ textAlign: 'center' }}>
                            <div style={{
                              fontSize: '1rem',
                              fontWeight: '700',
                              color: projectColor,
                              marginBottom: '0.25rem'
                            }}>
                              {timeProgress.completed}/{timeProgress.total}
                            </div>
                            <div style={{
                              fontSize: '0.7rem',
                              color: '#6b7280'
                            }}>
                              tasks done
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    background: '#fffbeb',
                    borderRadius: '8px',
                    border: '1px solid #fde68a',
                    fontSize: '0.75rem',
                    color: '#92400e'
                  }}>
                    💡 <strong>Tip:</strong> Timeline bars show task completion progress. Hover over projects for details.
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
                <p style={{ color: '#6b7280' }}>No project data available yet</p>
                <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                  Complete tasks and generate GST bills to see timeline progression
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Additional Stats for Managers/Owners */}
      {(userRole === 'owner' || userRole === 'manager') && stats.totalUsers > 0 && (
        <div className="card" style={{ marginTop: '1rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: windowWidth <= 768 ? 'column' : 'row',
            justifyContent: 'space-around', 
            padding: '1rem 0',
            gap: windowWidth <= 768 ? '1rem' : '0'
          }}>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ opacity: 0.9, marginBottom: '0.5rem', fontSize: windowWidth <= 480 ? '0.875rem' : '1rem' }}>Total Team Members</h3>
              <h2 style={{ fontSize: windowWidth <= 480 ? '2rem' : '2.5rem' }}>{stats.totalUsers}</h2>
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ opacity: 0.9, marginBottom: '0.5rem', fontSize: windowWidth <= 480 ? '0.875rem' : '1rem' }}>Task Completion Rate</h3>
              <h2 style={{ fontSize: windowWidth <= 480 ? '2rem' : '2.5rem' }}>
                {stats.totalTasks > 0 ? ((stats.completedTasks / stats.totalTasks) * 100).toFixed(1) : 0}%
              </h2>
              <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
                {stats.completedTasks || 0} / {stats.totalTasks || 0} tasks
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ opacity: 0.9, marginBottom: '0.5rem', fontSize: windowWidth <= 480 ? '0.875rem' : '1rem' }}>Active Projects</h3>
              <h2 style={{ fontSize: windowWidth <= 480 ? '2rem' : '2.5rem' }}>{stats.activeProjects}</h2>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;