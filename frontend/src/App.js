import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from './config';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn } from './auth';
import TeamJoin from './components/TeamJoin';
import OrganizerDashboard from './components/OrganizerDashboard';
import QuestionDisplay from './components/QuestionDisplay';
import io from 'socket.io-client';
import './App.css';
import AdminLogin from './components/AdminLogin';
import QuestionManager from './components/QuestionManager';
import { colors, commonStyles } from './theme';


function RequireAuth({ children, next }) {
  return isLoggedIn() ? children : <Navigate to={`/admin?next=${next}`} replace />;
}


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TeamPage />} />
        <Route path="/organizer" element={<RequireAuth next="/organizer"><OrganizerDashboard /></RequireAuth>} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/questions" element={<RequireAuth next="/admin/questions"><QuestionManager /></RequireAuth>} />
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
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [myTeamId, setMyTeamId] = useState(null);

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

    newSocket.on('team:joined', (data) => {
      setConnectionStatus('connected');
      if (data && data.teamId) setMyTeamId(data.teamId);
    });
    newSocket.on('round:started', (data) => {
      setQuestions(data.questions);
      setLeaderboardData(null);
    });
    newSocket.on('round:closed', () => setQuestions(null));
    newSocket.on('team:submitted', () => {
      showToast('Answers submitted! ✓');
      setQuestions(null);
    });
    newSocket.on('leaderboard:show', (data) => setLeaderboardData(data.leaderboard));
    newSocket.on('leaderboard:hide', () => setLeaderboardData(null));
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

  // Mobile browsers throttle/suspend JS timers while a tab is backgrounded (e.g.
  // switched away to WhatsApp), which can delay the socket noticing it went stale.
  // Nudge a reconnect the moment the tab is visible again instead of waiting on it.
  useEffect(() => {
    if (!socket) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !socket.connected) {
        socket.connect();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [socket]);

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

  // Submits with an ack + timeout so a stale post-backgrounding socket fails
  // loudly (and lets the button re-enable) instead of silently doing nothing.
  const handleSubmitAnswers = (answers, onResult) => {
    const finish = (result) => { if (onResult) onResult(result); };

    if (!socket || !socket.connected) {
      showToast("Not connected — reconnecting, please try Submit again in a moment.");
      finish({ success: false });
      return;
    }

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      showToast("Couldn't reach the server — please tap Submit again.");
      finish({ success: false });
    }, 6000);

    socket.emit('team:submit', { answers }, (ack) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (ack && ack.success) {
        finish({ success: true });
      } else {
        showToast("Couldn't submit — please tap Submit again.");
        finish({ success: false });
      }
    });
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
        connected={connectionStatus === 'connected'}
      />
    );
  }

  if (leaderboardData) {
    return <LeaderboardView leaderboard={leaderboardData} myTeamId={myTeamId} />;
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

function formatScore(score) {
  const numeric = Number(score || 0);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

// Shows the top 3 teams first, then — if the viewing team isn't already
// in the top 3 — a divider and their own highlighted standing below.
function LeaderboardView({ leaderboard, myTeamId }) {
  const top3 = leaderboard.slice(0, 3);
  const myIndex = leaderboard.findIndex((team) => team.id === myTeamId);
  const myEntry = myIndex >= 0 ? leaderboard[myIndex] : null;
  const myInTop3 = myIndex >= 0 && myIndex < 3;
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={waitStyles.room}>
      <div style={waitStyles.bgGlow} />
      <div style={waitStyles.content}>
        <img src="/logo.png" alt="Quiz Masters of Melody" style={waitStyles.logo} />
        <h2 style={waitStyles.welcome}>🏆 Leaderboard</h2>

        <div style={leaderboardStyles.list}>
          {top3.map((team, i) => (
            <div
              key={team.id}
              style={{
                ...leaderboardStyles.row,
                ...(team.id === myTeamId ? leaderboardStyles.rowMine : {}),
              }}
            >
              <span style={leaderboardStyles.medal}>{medals[i]}</span>
              <span style={leaderboardStyles.name}>{team.team_name}</span>
              <span style={leaderboardStyles.score}>{formatScore(team.score)}</span>
            </div>
          ))}
        </div>

        {myEntry && !myInTop3 && (
          <>
            <div style={leaderboardStyles.divider}>· · ·</div>
            <div style={leaderboardStyles.list}>
              <div style={{ ...leaderboardStyles.row, ...leaderboardStyles.rowMine }}>
                <span style={leaderboardStyles.medal}>#{myIndex + 1}</span>
                <span style={leaderboardStyles.name}>{myEntry.team_name}</span>
                <span style={leaderboardStyles.score}>{formatScore(myEntry.score)}</span>
              </div>
            </div>
          </>
        )}
      </div>
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

const leaderboardStyles = {
  list: {
    display: 'flex', flexDirection: 'column', gap: '10px',
    width: '340px', maxWidth: '90vw',
  },
  row: {
    display: 'flex', alignItems: 'center', gap: '14px',
    padding: '14px 18px', backgroundColor: colors.bgCard,
    border: `1px solid ${colors.border}`, borderRadius: '12px',
  },
  rowMine: {
    borderColor: colors.primary, backgroundColor: colors.primaryMuted,
  },
  medal: { fontSize: '20px', width: '32px', textAlign: 'center', flexShrink: 0 },
  name: { flex: 1, fontSize: '16px', fontWeight: '700', color: colors.text },
  score: { fontSize: '18px', fontWeight: '800', color: colors.primary },
  divider: {
    color: colors.textDim, fontSize: '20px', letterSpacing: '4px',
    margin: '18px 0',
  },
};

export default App;
