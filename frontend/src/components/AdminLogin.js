import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Simple password check (stored in code for now)
// Later you can move this to backend authentication
const ADMIN_PASSWORD = 'pubquiz2025'; // Change this to your password!

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
    backgroundColor: '#1a1a2e',
  },
  card: {
    backgroundColor: '#16213e',
    padding: '40px',
    borderRadius: '10px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
    textAlign: 'center',
    maxWidth: '400px',
    width: '90%',
  },
  title: {
    color: '#fff',
    fontSize: '32px',
    marginBottom: '10px',
  },
  subtitle: {
    color: '#a0a0a0',
    marginBottom: '30px',
  },
  input: {
    width: '100%',
    padding: '15px',
    fontSize: '16px',
    border: 'none',
    borderRadius: '5px',
    marginBottom: '10px',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    padding: '15px',
    fontSize: '16px',
    backgroundColor: '#0f3460',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  error: {
    color: '#ff6b6b',
    marginBottom: '10px',
  },
};

export default AdminLogin;