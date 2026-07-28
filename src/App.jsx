import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import MonitorDashboard from './pages/MonitorDashboard';
import PhotoBooth from './pages/PhotoBooth';
import StudentLogin from './pages/StudentLogin';
import StudentPortal from './pages/StudentPortal';
import AdminDashboard from './pages/AdminDashboard';
import AgentGuide from './pages/AgentGuide';
import AdminLogin from './pages/AdminLogin';
import RequireAuth from './components/RequireAuth';
import './styles.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        
        {/* Protected Admin Routes */}
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/monitor" element={<RequireAuth><MonitorDashboard /></RequireAuth>} />
        <Route path="/booth" element={<RequireAuth><PhotoBooth /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
        <Route path="/guide" element={<RequireAuth><AgentGuide /></RequireAuth>} />
        
        {/* Public Student Routes */}
        <Route path="/student" element={<StudentLogin />} />
        <Route path="/s/:token" element={<StudentPortal />} />
      </Routes>
    </Router>
  );
}

export default App;
