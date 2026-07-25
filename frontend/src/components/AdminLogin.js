import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { colors, commonStyles } from '../theme';
import { login } from '../auth';

function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Support ?next=/organizer so an expired session returns you where you were.
  const next = params.get('next') || '/admin/questions';

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      await login(password);
      navigate(next);
    } catch (err) {
      setError(err.message || 'Incorrect password');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={commonStyles.centeredContainer}>
      <div style={{ ...commonStyles.card, textAlign: 'center', maxWidth: '400px', width: '90%' }}>
        <img src="/logo.png" alt="Quiz Masters of Melody" style={s.logo} />
        <h1 style={s.title}>Organizer Login</h1>
        <p style={s.subtitle}>Enter password to continue</p>

        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={commonStyles.input}
            autoFocus
            disabled={busy}
          />

          {error && <p style={s.error}>{error}</p>}

          <button
            type="submit"
            style={{
              ...commonStyles.buttonPrimary,
              marginTop: '12px',
              opacity: busy ? 0.6 : 1,
            }}
            disabled={busy}
          >
            {busy ? 'Checking...' : 'Login'}
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