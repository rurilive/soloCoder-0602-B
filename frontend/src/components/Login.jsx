import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../api';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await authAPI.login({ email, password });
      localStorage.setItem('token', res.data.access_token);
      const me = await authAPI.me();
      onLogin(me.data.name);
    } catch (err) {
      setError(err.response?.data?.detail || '登录失败');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>登录</h2>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>邮箱</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary btn-block">登录</button>
        </form>
        <p className="auth-link">
          还没有账号？<Link to="/register">注册公司</Link>
        </p>
      </div>
    </div>
  );
}
