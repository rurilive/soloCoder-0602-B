import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../api';

export default function Register({ onRegister }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await authAPI.register({ name, email, password });
      const loginRes = await authAPI.login({ email, password });
      localStorage.setItem('token', loginRes.data.access_token);
      onRegister(name);
    } catch (err) {
      setError(err.response?.data?.detail || '注册失败');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>注册公司</h2>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>公司名称</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>邮箱</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <button type="submit" className="btn btn-primary btn-block">注册</button>
        </form>
        <p className="auth-link">
          已有账号？<Link to="/login">登录</Link>
        </p>
      </div>
    </div>
  );
}
