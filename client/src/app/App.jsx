import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { LanguageProvider } from '../context/LanguageContext';
import ProtectedRoute from '../shared/ProtectedRoute';
import { initOfflineService } from '../services/offlineService';
import OfflineIndicator from '../components/OfflineIndicator';
import Login from '../modules/auth/Login';
import Signup from '../modules/auth/Signup';
import ForgotPassword from '../modules/auth/ForgotPassword';
import Dashboard from '../modules/dashboard/Dashboard';
import Projects from '../modules/projects/Projects';
import DPR from '../modules/dpr/DPR';
import Attendance from '../modules/attendance/Attendance';
import Materials from '../modules/materials/Materials';
import Tasks from '../modules/tasks/Tasks';
import DailyWorkLogs from '../modules/worklogs/DailyWorkLogs';
import GSTBills from '../modules/bills/GSTBills';
import EmployeeRegistration from '../modules/employees/EmployeeRegistration';
import ContractorManagement from '../modules/contractors/ContractorManagement';
import FlatSales from '../modules/flatsales/FlatSales';
import Navbar from '../shared/Navbar';
import StockTracking from '../modules/stock/StockTracking';
import PettyCash from '../modules/pettycash/PettyCash';
import ToolLibrary from '../modules/tools/ToolLibrary';
import PermitToWork from '../modules/permits/PermitToWork';

const App = () => {
  useEffect(() => {
    // Initialize offline service
    initOfflineService();

    // Register service worker for PWA offline support
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/service-worker.js')
          .then((registration) => {
            console.log('[App] Service Worker registered:', registration.scope);

            // Check for updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[App] New service worker available');
                }
              });
            });
          })
          .catch((error) => {
            console.warn('[App] Service Worker registration failed:', error);
          });

        // Listen for service worker messages
        navigator.serviceWorker.addEventListener('message', async (event) => {
          if (event.data && event.data.type === 'SYNC_OFFLINE_DATA') {
            // Trigger sync from main app
            const { syncOfflineQueue } = await import('../services/offlineService');
            syncOfflineQueue();
          }
        });
      });
    }
  }, []);

  return (
    <LanguageProvider>
      <AuthProvider>
        <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Navbar />
                <Routes>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/projects" element={<ProtectedRoute allowedRoles={['site_engineer', 'manager']}><Projects /></ProtectedRoute>} />
                  <Route path="/dpr" element={<ProtectedRoute allowedRoles={['site_engineer', 'manager']}><DPR /></ProtectedRoute>} />
                  <Route path="/attendance" element={<ProtectedRoute allowedRoles={['worker', 'site_engineer']}><Attendance /></ProtectedRoute>} />
                  <Route path="/materials" element={<ProtectedRoute allowedRoles={['site_engineer', 'manager']}><Materials /></ProtectedRoute>} />
                  <Route path="/tasks" element={<ProtectedRoute allowedRoles={['site_engineer', 'manager']}><Tasks /></ProtectedRoute>} />
                  <Route path="/employees" element={<ProtectedRoute allowedRoles={['site_engineer']}><EmployeeRegistration /></ProtectedRoute>} />
                  <Route path="/worklogs" element={<ProtectedRoute allowedRoles={['worker', 'site_engineer']}><DailyWorkLogs /></ProtectedRoute>} />
                  <Route path="/contractors" element={<ProtectedRoute allowedRoles={['manager', 'owner']}><ContractorManagement /></ProtectedRoute>} />
                  <Route path="/flatsales" element={<ProtectedRoute allowedRoles={['manager', 'owner']}><FlatSales /></ProtectedRoute>} />
                  <Route path="/stock" element={<ProtectedRoute allowedRoles={['site_engineer', 'manager', 'owner']}><StockTracking /></ProtectedRoute>} />
                  <Route path="/pettycash" element={<ProtectedRoute allowedRoles={['site_engineer', 'worker']}><PettyCash /></ProtectedRoute>} />
                  <Route path="/tools" element={<ProtectedRoute allowedRoles={['site_engineer', 'worker']}><ToolLibrary /></ProtectedRoute>} />
                  <Route path="/permits" element={<ProtectedRoute allowedRoles={['site_engineer']}><PermitToWork /></ProtectedRoute>} />
                  <Route path="/bills" element={<ProtectedRoute allowedRoles={['manager', 'owner']}><GSTBills /></ProtectedRoute>} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </Routes>
                <OfflineIndicator />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
      </AuthProvider>
    </LanguageProvider>
  );
};

export default App;
