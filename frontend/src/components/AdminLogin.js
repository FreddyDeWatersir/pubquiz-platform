import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors, commonStyles } from '../theme';

const ADMIN_PASSWORD = 'shoutoutWarnars';

function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem('adminAuth', 'true');
      navigate('/admin/questions');
    } else {
      setError('Incorrect password');
      setPassword('');
    }
  };

  return (
    <div style={commonStyles.centeredContainer}>
      <div style={{ ...commonStyles.card, textAlign: 'center', maxWidth: '400px', width: '90%' }}>
        <img src="/logo.png" alt="Quiz Masters of Melody" style={s.logo} />
        <h1 style={s.title}>Admin Login</h1>
        <p style={s.subtitle}>Enter password to manage questions</p>
        
        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="Admin Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={commonStyles.input}
            autoFocus
          />
          
          {error && <p style={s.error}>{error}</p>}
          
          <button type="submit" style={{ ...commonStyles.buttonPrimary, marginTop: '12px' }}>
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

const s = {
  logo: { width: '140px', height: 'auto', marginBottom: '16px' },
  title: { color: colors.text, fontSize: '28px', marginBottom: '6px', fontWeight: '700' },
  subtitle: { color: colors.textMuted, marginBottom: '24px', fontSize: '15px' },
  error: { color: colors.error, marginTop: '10px', marginBottom: '0', fontSize: '14px' },
};

export default AdminLogin;
