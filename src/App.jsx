import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MonitorDashboard from './pages/MonitorDashboard';
import PhotoBooth from './pages/PhotoBooth';
import StudentPortal from './pages/StudentPortal';
import AdminDashboard from './pages/AdminDashboard';
import './styles.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/monitor" />} />
        <Route path="/monitor" element={<MonitorDashboard />} />
        <Route path="/booth" element={<PhotoBooth />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/s/:token" element={<StudentPortal />} />
      </Routes>
    </Router>
  );
}

export default App;
