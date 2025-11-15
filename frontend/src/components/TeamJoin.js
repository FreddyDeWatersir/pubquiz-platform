import React, { useState } from 'react';
import { API_URL } from '../config';

function TeamJoin({ onJoinSuccess }) {
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!teamName.trim()) {
      setError('Please enter a team name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Call backend to register team
      const response = await fetch(`${API_URL}/api/teams/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamName: teamName,
          quizId: 1  // For now, always join quiz #1
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Success! Pass the session token back
        onJoinSuccess(data.sessionToken, data.teamName);
      } else {
        setError(data.error || 'Failed to join quiz');
      }
    } catch (err) {
      setError('Could not connect to server');
      console.error('Error joining quiz:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🎯 PubQuiz</h1>
        <p style={styles.subtitle}>Enter your team name to join</p>
        
        <input
          type="text"
          placeholder="Team Name"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
          style={styles.input}
          disabled={loading}
        />
        
        {error && <p style={styles.error}>{error}</p>}
        
        <button 
          onClick={handleJoin} 
          style={styles.button}
          disabled={loading}
        >
          {loading ? 'Joining...' : 'Join Quiz'}
        </button>
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

export default TeamJoin;