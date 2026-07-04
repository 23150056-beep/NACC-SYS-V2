import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ActivityProvider } from './context/ActivityContext';
import { ToastProvider } from './context/ToastContext';
import { INSTRUMENT_MANAGER_ROLES } from './config/roles';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Children from './pages/Children';
import Assessment from './pages/Assessment';
import Report from './pages/Report';
import ChildProgressReport from './pages/ChildProgressReport';
import Monitoring from './pages/Monitoring';
import AgencySummary from './pages/AgencySummary';
import Settings from './pages/Settings';
import Users from './pages/Users';
import Questionnaires from './pages/Questionnaires';

function Shell({ children }) {
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-app)', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar />
        <main className="racco-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
      <ActivityProvider>
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Shell><Dashboard /></Shell></ProtectedRoute>} />
          <Route path="/children" element={<ProtectedRoute roles={['Administrator', 'Staff', 'Psychologist']}><Shell><Children /></Shell></ProtectedRoute>} />
          <Route path="/assessment" element={<ProtectedRoute roles={['Psychologist']}><Shell><Assessment /></Shell></ProtectedRoute>} />
          <Route path="/questionnaires" element={<ProtectedRoute roles={INSTRUMENT_MANAGER_ROLES}><Shell><Questionnaires /></Shell></ProtectedRoute>} />
          <Route path="/report" element={<ProtectedRoute><Shell><Report /></Shell></ProtectedRoute>} />
          <Route path="/report/child/:id" element={<ProtectedRoute><Shell><ChildProgressReport /></Shell></ProtectedRoute>} />
          <Route path="/monitoring" element={<ProtectedRoute roles={['Administrator', 'Staff', 'Psychologist']}><Shell><Monitoring /></Shell></ProtectedRoute>} />
          <Route path="/reports/summary" element={<ProtectedRoute roles={['Administrator', 'Staff']}><Shell><AgencySummary /></Shell></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute roles={['Administrator']}><Shell><Users /></Shell></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute roles={['Administrator']}><Shell><Settings /></Shell></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </ActivityProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
