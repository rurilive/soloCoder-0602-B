import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import ProjectList from './components/ProjectList';
import KanbanBoard from './components/KanbanBoard';
import { authAPI } from './api';

function PrivateRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />;
}

function Navbar({ companyName, onLogout }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">任务管理系统</div>
      {companyName && (
        <div className="navbar-right">
          <span className="navbar-user">{companyName}</span>
          <button className="btn btn-outline" onClick={onLogout}>退出</button>
        </div>
      )}
    </nav>
  );
}

function AppContent() {
  const [companyName, setCompanyName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authAPI.me()
        .then((res) => setCompanyName(res.data.name))
        .catch(() => {
          localStorage.removeItem('token');
          setCompanyName('');
        });
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setCompanyName('');
    navigate('/login');
  };

  return (
    <div className="app">
      <Navbar companyName={companyName} onLogout={handleLogout} />
      <div className="container">
        <Routes>
          <Route path="/login" element={<Login onLogin={(name) => { setCompanyName(name); navigate('/'); }} />} />
          <Route path="/register" element={<Register onRegister={(name) => { setCompanyName(name); navigate('/'); }} />} />
          <Route path="/" element={<PrivateRoute><ProjectList /></PrivateRoute>} />
          <Route path="/projects/:projectId" element={<PrivateRoute><KanbanBoard /></PrivateRoute>} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
