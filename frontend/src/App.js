import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from './config';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import TeamJoin from './components/TeamJoin';
import OrganizerDashboard from './components/OrganizerDashboard';
import QuestionDisplay from './components/QuestionDisplay';
import io from 'socket.io-client';
import './App.css';
import AdminLogin from './components/AdminLogin';
import QuestionManager from './components/QuestionManager';
import { colors, commonStyles } from './theme';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TeamPage />} />
        <Route path="/organizer" element={<OrganizerDashboard />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/questions" element={<QuestionManager />} />
      </Routes>
    </Router>
  );
}

// ──────────────────────────────────────────────────────────
// TEAM PAGE — with session persistence and proper WebSocket
// ──────────────────────────────────────────────────────────
function TeamPage() {
  // Initialize state from sessionStorage — survives page refresh
  const [sessionToken, setSessionToken] = useState(() => {
    return sessionStorage.getItem('quizSessionToken');
  });
  const [teamName, setTeamName] = useState(() => {
    return sessionStorage.getItem('quizTeamName') || '';
  });
  const [questions, setQuestions] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, duration = 3000) => {
    setToast(message);
    setTimeout(() => setToast(null), duration);
  }, []);

  // Refresh warning — only when in active session
  useEffect(() => {
    if (!sessionToken) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionToken]);

  // WebSocket — properly managed in useEffect
  useEffect(() => {
    if (!sessionToken) return;

    const newSocket = io(API_URL, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    setSocket(newSocket);
    setConnectionStatus('connecting');
    newSocket.emit('team:join', { sessionToken });

    newSocket.on('team:joined', () => setConnectionStatus('connected'));
    newSocket.on('round:started', (data) => setQuestions(data.questions));
    newSocket.on('round:closed', () => setQuestions(null));
    newSocket.on('team:submitted', () => {
      showToast('Answers submitted! ✓');
      setQuestions(null);
    });
    newSocket.on('error', (data) => showToast(`Error: ${data.message}`));
    newSocket.on('disconnect', () => setConnectionStatus('reconnecting'));
    newSocket.on('reconnect', () => {
      newSocket.emit('team:join', { sessionToken });
      setConnectionStatus('connected');
    });
    newSocket.on('reconnect_failed', () => {
      setConnectionStatus('failed');
      showToast('Connection lost. Try refreshing.');
    });

    return () => {
      newSocket.disconnect();
      setSocket(null);
      setConnectionStatus('disconnected');
    };
  }, [sessionToken, showToast]);

  const handleJoinSuccess = (token, name) => {
    sessionStorage.setItem('quizSessionToken', token);
    sessionStorage.setItem('quizTeamName', name);
    setSessionToken(token);
    setTeamName(name);
  };

  const handleLeaveTeam = () => {
    sessionStorage.removeItem('quizSessionToken');
    sessionStorage.removeItem('quizTeamName');
    setSessionToken(null);
    setTeamName('');
    setQuestions(null);
  };

  const handleSubmitAnswers = (answers) => {
    if (socket) socket.emit('team:submit', { answers });
  };

  // State machine render
  if (!sessionToken) {
    return <TeamJoin onJoinSuccess={handleJoinSuccess} />;
  }

  if (questions) {
    return (
      <QuestionDisplay
        questions={questions}
        onSubmit={handleSubmitAnswers}
        teamName={teamName}
      />
    );
  }

  // Waiting screen
  return (
    <div style={waitStyles.room}>
      <div style={waitStyles.bgGlow} />
      <div style={waitStyles.content}>
        <img src="/logo.png" alt="Quiz Masters of Melody" style={waitStyles.logo} />
        <h2 style={waitStyles.welcome}>Welcome, {teamName}!</h2>
        <p style={waitStyles.subtitle}>Waiting for the quizmaster...</p>

        <div style={{
          ...waitStyles.statusBadge,
          backgroundColor: connectionStatus === 'connected' ? colors.successMuted
            : connectionStatus === 'reconnecting' ? colors.warningMuted : colors.errorMuted,
          color: connectionStatus === 'connected' ? colors.success
            : connectionStatus === 'reconnecting' ? colors.warning : colors.error,
        }}>
          {connectionStatus === 'connected' ? '● Connected'
            : connectionStatus === 'reconnecting' ? '● Reconnecting...'
            : '● Disconnected'}
        </div>

        <div style={waitStyles.dots}>
          <div className="pulse-dot" style={{ animationDelay: '0s' }} />
          <div className="pulse-dot" style={{ animationDelay: '0.3s' }} />
          <div className="pulse-dot" style={{ animationDelay: '0.6s' }} />
        </div>

        <button onClick={handleLeaveTeam} style={waitStyles.leaveBtn}>
          Leave Team
        </button>
      </div>

      {toast && <div style={commonStyles.toast}>{toast}</div>}
    </div>
  );
}

const waitStyles = {
  room: {
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    alignItems: 'center', minHeight: '100vh', backgroundColor: colors.bg,
    color: colors.text, fontFamily: "'Outfit', 'Segoe UI', sans-serif",
    position: 'relative', overflow: 'hidden',
  },
  bgGlow: {
    position: 'absolute', top: '30%', left: '50%',
    transform: 'translate(-50%, -50%)', width: '400px', height: '400px',
    background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  content: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    position: 'relative', zIndex: 1,
  },
  logo: { width: '160px', height: 'auto', marginBottom: '24px' },
  welcome: { fontSize: '28px', fontWeight: '700', marginBottom: '8px' },
  subtitle: { fontSize: '16px', color: colors.textMuted, marginBottom: '24px' },
  statusBadge: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '8px 16px', borderRadius: '20px', fontSize: '13px',
    fontWeight: '600', marginBottom: '32px',
  },
  dots: { display: 'flex', gap: '8px', marginBottom: '48px' },
  leaveBtn: {
    padding: '10px 24px', backgroundColor: 'transparent',
    color: colors.textMuted, border: `1px solid ${colors.border}`,
    borderRadius: '8px', cursor: 'pointer', fontSize: '14px',
  },
};

export default App;
