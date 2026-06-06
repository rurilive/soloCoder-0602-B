import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import ProjectList from './components/ProjectList';
import KanbanBoard from './components/KanbanBoard';
import NotificationCenter from './components/NotificationCenter';
import { authAPI } from './api';
import { ToastProvider } from './context/ToastContext';

function PrivateRoute({ children }) {
  const [isValid, setIsValid] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setIsValid(false);
      return;
    }
    authAPI.me()
      .then(() => setIsValid(true))
      .catch(() => {
        localStorage.removeItem('token');
        setIsValid(false);
      });
  }, []);

  if (isValid === null) {
    return <div className="loading">验证中...</div>;
  }

  return isValid ? children : <Navigate to="/login" />;
}

function Navbar({ companyName, onLogout }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">任务管理系统</div>
      {companyName && (
        <div className="navbar-right">
          <NotificationCenter />
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
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </BrowserRouter>
  );
}
