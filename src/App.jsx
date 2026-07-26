import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import MonitorDashboard from './pages/MonitorDashboard';
import PhotoBooth from './pages/PhotoBooth';
import StudentLogin from './pages/StudentLogin';
import StudentPortal from './pages/StudentPortal';
import AdminDashboard from './pages/AdminDashboard';
import AgentGuide from './pages/AgentGuide';
import './styles.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/monitor" element={<MonitorDashboard />} />
        <Route path="/booth" element={<PhotoBooth />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/guide" element={<AgentGuide />} />
        <Route path="/student" element={<StudentLogin />} />
        <Route path="/s/:token" element={<StudentPortal />} />
      </Routes>
    </Router>
  );
}

export default App;
