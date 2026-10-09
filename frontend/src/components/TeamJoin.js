import React, { useState } from 'react';
import { API_URL } from '../config';
import { colors, commonStyles } from '../theme';
import {
  translator,
  normalizeLanguage,
  LANGUAGES,
  getCodeScreenLanguage,
  setCodeScreenLanguage,
} from '../i18n';

function TeamJoin({ onJoinSuccess }) {
  const [step, setStep] = useState('code');
  const [accessCode, setAccessCode] = useState('');
  const [quizId, setQuizId] = useState(null);
  const [quizName, setQuizName] = useState('');
  // Step one comes before we know the quiz, so it uses the language the team
  // picked with the NL/EN toggle (remembered on this phone; guessed from the
  // phone's own language the first time). Once the code is accepted, the
  // quiz's own language takes over for everything after it.
  const [language, setLanguage] = useState(getCodeScreenLanguage);
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const tt = translator(language);

  const pickCodeLanguage = (code) => {
    setCodeScreenLanguage(code);
    setLanguage(code);
    setError('');
  };

  const handleVerifyCode = async () => {
    if (!accessCode.trim()) {
      setError(tt('enterCodeError'));
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
        setLanguage(normalizeLanguage(data.language));
        setStep('name');
      } else {
        setError(data.error || tt('invalidCode'));
      }
    } catch (err) {
      setError(tt('connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!teamName.trim()) {
      setError(tt('enterTeamNameError'));
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
        onJoinSuccess(data.sessionToken, data.teamName, data.language || language);
      } else {
        setError(data.error || tt('joinFailed'));
      }
    } catch (err) {
      setError(tt('connectionError'));
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
            {/* Only on this step: after it, the quiz decides the language. */}
            <div style={styles.langToggle} role="group" aria-label="Language / Taal">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => pickCodeLanguage(lang.code)}
                  aria-pressed={language === lang.code}
                  style={{
                    ...styles.langOption,
                    ...(language === lang.code ? styles.langOptionActive : {}),
                  }}
                >
                  {lang.code.toUpperCase()}
                </button>
              ))}
            </div>
            <p style={styles.subtitle}>{tt('enterCodePrompt')}</p>
            <input
              type="text"
              placeholder={tt('quizCodePlaceholder')}
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
              {loading ? tt('checking') : tt('enter')}
            </button>
          </>
        ) : (
          <>
            <div style={styles.quizBadge}>
              <span style={styles.quizBadgeText}>{quizName}</span>
            </div>
            <p style={styles.subtitle}>{tt('chooseTeamName')}</p>
            <input
              type="text"
              placeholder={tt('teamNamePlaceholder')}
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
              {loading ? tt('joining') : tt('joinQuiz')}
            </button>
            <button
              onClick={() => { setStep('code'); setError(''); setAccessCode(''); setLanguage(getCodeScreenLanguage()); }}
              style={styles.backButton}
            >
              {tt('differentCode')}
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
  langToggle: {
    position: 'absolute', top: '16px', right: '16px',
    display: 'flex', gap: '2px', padding: '3px',
    backgroundColor: colors.bgInput, border: `1px solid ${colors.border}`,
    borderRadius: '10px',
  },
  langOption: {
    padding: '6px 10px', fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px',
    backgroundColor: 'transparent', color: colors.textMuted,
    border: 'none', borderRadius: '7px', cursor: 'pointer',
    minWidth: '38px', minHeight: '30px',
  },
  langOptionActive: {
    backgroundColor: colors.primary, color: '#fff',
  },
  error: {
    color: colors.error,
    marginBottom: '10px',
    fontSize: '14px',
  },
};

export default TeamJoin;
