import React, { useState } from 'react';
import { API_URL } from '../config';

function TeamJoin({ onJoinSuccess }) {
  const [step, setStep] = useState('code'); // 'code' or 'name'
  const [accessCode, setAccessCode] = useState('');
  const [quizId, setQuizId] = useState(null);
  const [quizName, setQuizName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 1: Verify access code
  const handleVerifyCode = async () => {
    if (!accessCode.trim()) {
      setError('Please enter a quiz code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/teams/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: accessCode.trim() })
      });

      const data = await response.json();

      if (response.ok) {
        setQuizId(data.quizId);
        setQuizName(data.quizName);
        setStep('name');
      } else {
        setError(data.error || 'Invalid code');
      }
    } catch (err) {
      setError('Could not connect to server');
      console.error('Error verifying code:', err);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Register team
  const handleJoin = async () => {
    if (!teamName.trim()) {
      setError('Please enter a team name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/teams/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName: teamName.trim(), quizId })
      });

      const data = await response.json();

      if (response.ok) {
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

        {step === 'code' ? (
          <>
            <p style={styles.subtitle}>Enter the quiz code to join</p>
            <input
              type="text"
              placeholder="Quiz Code"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && handleVerifyCode()}
              style={styles.input}
              disabled={loading}
              autoFocus
              maxLength={20}
            />
            {error && <p style={styles.error}>{error}</p>}
            <button
              onClick={handleVerifyCode}
              style={styles.button}
              disabled={loading}
            >
              {loading ? 'Checking...' : 'Enter'}
            </button>
          </>
        ) : (
          <>
            <div style={styles.quizBadge}>
              <span style={styles.quizBadgeText}>{quizName}</span>
            </div>
            <p style={styles.subtitle}>Enter your team name</p>
            <input
              type="text"
              placeholder="Team Name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
              style={styles.input}
              disabled={loading}
              autoFocus
            />
            {error && <p style={styles.error}>{error}</p>}
            <button
              onClick={handleJoin}
              style={styles.button}
              disabled={loading}
            >
              {loading ? 'Joining...' : 'Join Quiz'}
            </button>
            <button
              onClick={() => { setStep('code'); setError(''); setAccessCode(''); }}
              style={styles.backButton}
            >
              ← Different code
            </button>
          </>
        )}
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
    marginBottom: '20px',
  },
  quizBadge: {
    backgroundColor: '#0f3460',
    padding: '10px 20px',
    borderRadius: '8px',
    marginBottom: '20px',
    display: 'inline-block',
  },
  quizBadgeText: {
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    padding: '15px',
    fontSize: '18px',
    border: 'none',
    borderRadius: '5px',
    marginBottom: '10px',
    boxSizing: 'border-box',
    textAlign: 'center',
    letterSpacing: '2px',
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
  backButton: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    backgroundColor: 'transparent',
    color: '#a0a0a0',
    border: 'none',
    cursor: 'pointer',
    marginTop: '10px',
  },
  error: {
    color: '#ff6b6b',
    marginBottom: '10px',
  },
};

export default TeamJoin;