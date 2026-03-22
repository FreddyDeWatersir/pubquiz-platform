import React, { useState } from 'react';
import { API_URL } from '../config';
import { colors, commonStyles } from '../theme';

function TeamJoin({ onJoinSuccess }) {
  const [step, setStep] = useState('code');
  const [accessCode, setAccessCode] = useState('');
  const [quizId, setQuizId] = useState(null);
  const [quizName, setQuizName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    } finally {
      setLoading(false);
    }
  };

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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Background glow effects */}
      <div style={styles.glowOrange} />
      <div style={styles.glowPurple} />

      <div style={styles.card}>
        <img src="/logo.png" alt="Quiz Masters of Melody" style={styles.logoImg} />

        {step === 'code' ? (
          <>
            <p style={styles.subtitle}>Enter the quiz code to join</p>
            <input
              type="text"
              placeholder="QUIZ CODE"
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
            <p style={styles.subtitle}>Choose your team name</p>
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
    ...commonStyles.centeredContainer,
    position: 'relative',
    overflow: 'hidden',
  },
  glowOrange: {
    position: 'absolute',
    top: '20%',
    right: '30%',
    width: '300px',
    height: '300px',
    background: 'radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  glowPurple: {
    position: 'absolute',
    bottom: '20%',
    left: '30%',
    width: '300px',
    height: '300px',
    background: 'radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  card: {
    ...commonStyles.card,
    textAlign: 'center',
    maxWidth: '420px',
    width: '90%',
    position: 'relative',
    zIndex: 1,
    animation: 'slideUp 0.4s ease',
  },
  logoImg: {
    width: '160px',
    height: 'auto',
    marginBottom: '16px',
  },
  title: {
    color: colors.text,
    fontSize: '32px',
    fontWeight: '800',
    marginBottom: '8px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    color: colors.textMuted,
    marginBottom: '20px',
    fontSize: '15px',
  },
  quizBadge: {
    ...commonStyles.badgePurple,
    display: 'inline-block',
    marginBottom: '16px',
    padding: '8px 20px',
    fontSize: '14px',
  },
  quizBadgeText: {
    fontWeight: '700',
  },
  input: {
    ...commonStyles.input,
    textAlign: 'center',
    letterSpacing: '2px',
    marginBottom: '12px',
    fontSize: '18px',
  },
  button: {
    ...commonStyles.buttonPrimary,
    marginTop: '4px',
  },
  backButton: {
    width: '100%',
    padding: '10px',
    fontSize: '14px',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    border: 'none',
    cursor: 'pointer',
    marginTop: '10px',
  },
  error: {
    color: colors.error,
    marginBottom: '10px',
    fontSize: '14px',
  },
};

export default TeamJoin;
