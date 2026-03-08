import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Simple password check (stored in code for now)
// Later you can move this to backend authentication
const ADMIN_PASSWORD = 'shoutoutWarnars'; // Change this to your password!

function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault(); // Prevent form from refreshing page
    
    // Check if password matches
    if (password === ADMIN_PASSWORD) {
      // Store authentication in browser (persists across refreshes)
      localStorage.setItem('adminAuth', 'true');
      
      // Redirect to admin page
      navigate('/admin/questions');
    } else {
      setError('Incorrect password');
      setPassword(''); // Clear input
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🔐 Admin Login</h1>
        <p style={styles.subtitle}>Enter password to manage questions</p>
        
        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="Admin Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            autoFocus
          />
          
          {error && <p style={styles.error}>{error}</p>}
          
          <button type="submit" style={styles.button}>
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#0A0A0F',
    fontFamily: "'Outfit', 'Segoe UI', sans-serif",
  },
  card: {
    backgroundColor: '#141419',
    padding: '40px',
    borderRadius: '16px',
    border: '1px solid #2A2A38',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
    textAlign: 'center',
    maxWidth: '400px',
    width: '90%',
  },
  title: {
    color: '#fff',
    fontSize: '32px',
    fontWeight: '800',
    marginBottom: '10px',
  },
  subtitle: {
    color: '#8B8B9E',
    marginBottom: '30px',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '16px',
    backgroundColor: '#1E1E28',
    color: '#fff',
    border: '1px solid #2A2A38',
    borderRadius: '10px',
    marginBottom: '10px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  button: {
    width: '100%',
    padding: '14px',
    fontSize: '16px',
    backgroundColor: '#FF6B00',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: '700',
  },
  error: {
    color: '#EF4444',
    marginBottom: '10px',
  },
};

export default AdminLogin;