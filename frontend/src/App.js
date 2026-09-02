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
import { translator, normalizeLanguage } from './i18n';


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
//
// The team client is a small state machine. Precedence, highest first:
//   1. questions        — a round is live, answering beats everything
//   2. customScreen     — the quizmaster pushed an opening/break/end screen
//   3. leaderboardData  — the quizmaster revealed the standings
//   4. waiting room     — the default between rounds
// The server enforces the same order (activating a round clears any screen),
// so the two can't disagree about what teams should be looking at.
//
function TeamPage() {
  // Initialize state from sessionStorage — survives page refresh
  const [sessionToken, setSessionToken] = useState(() => {
    return sessionStorage.getItem('quizSessionToken');
  });
  const [teamName, setTeamName] = useState(() => {
    return sessionStorage.getItem('quizTeamName') || '';
  });
  // Seeded from the join response so the waiting room is already in the right
  // language on first paint; 'team:joined' then confirms it from the server.
  const [language, setLanguage] = useState(() => {
    return normalizeLanguage(sessionStorage.getItem('quizLanguage'));
  });
  const [questions, setQuestions] = useState(null);
  const [round, setRound] = useState(null); // { number, name }
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [toast, setToast] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [leaderboardMode, setLeaderboardMode] = useState('top3');
  const [customScreen, setCustomScreen] = useState(null); // { title, body }
  const [myTeamId, setMyTeamId] = useState(null);

  const tt = translator(language);

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

    // 'connect' fires on the initial connection AND on every reconnection
    // in socket.io-client v4 (unlike v2, there is no separate 'reconnect'
    // event on the Socket itself — only on the Manager, at newSocket.io).
    // Re-joining here covers both cases with one handler. Status flips to
    // 'connected' only once the server confirms via 'team:joined', not here
    // — a stale/invalid session token would otherwise show "Connected"
    // even though the server rejected the join.
    newSocket.on('connect', () => {
      newSocket.emit('team:join', { sessionToken });
    });
    newSocket.on('team:joined', (data) => {
      setConnectionStatus('connected');
      if (data && data.teamId) setMyTeamId(data.teamId);
      // The quiz's language is authoritative on every (re)join, so switching a
      // quiz to Dutch mid-evening reaches teams already sitting in the room.
      if (data && data.language) {
        const lang = normalizeLanguage(data.language);
        setLanguage(lang);
        sessionStorage.setItem('quizLanguage', lang);
      }
    });
    newSocket.on('round:started', (data) => {
      setQuestions(data.questions);
      setRound({ number: data.roundNumber, name: data.roundName || null });
      setLeaderboardData(null);
      setCustomScreen(null);
    });
    newSocket.on('round:closed', () => {
      setQuestions(null);
      setRound(null);
    });
    newSocket.on('team:submitted', () => {
      showToast(tt('answersSubmitted'));
      setQuestions(null);
      setRound(null);
    });
    newSocket.on('leaderboard:show', (data) => {
      setLeaderboardData(data.leaderboard);
      setLeaderboardMode(data.mode === 'all' ? 'all' : 'top3');
      setCustomScreen(null);
    });
    newSocket.on('leaderboard:hide', () => setLeaderboardData(null));
    newSocket.on('screen:show', (data) => {
      setCustomScreen({ title: data.title, body: data.body || '' });
      setLeaderboardData(null);
    });
    newSocket.on('screen:hide', () => setCustomScreen(null));
    newSocket.on('error', (data) => showToast(tt('errorPrefix', { message: data.message })));
    newSocket.on('disconnect', () => setConnectionStatus('reconnecting'));
    // Same story as 'reconnect' above: reconnection-lifecycle events live on
    // the Manager (newSocket.io), not the Socket. newSocket.on('reconnect_failed', ...)
    // would never fire, silently leaving the team stuck on "Reconnecting..."
    // forever with no way to know retries were exhausted.
    newSocket.io.on('reconnect_failed', () => {
      setConnectionStatus('failed');
      showToast(tt('connectionLost'));
    });

    return () => {
      newSocket.disconnect();
      setSocket(null);
      setConnectionStatus('disconnected');
    };
    // `tt` is deliberately not a dependency: it changes identity whenever the
    // language does, and re-running this effect would tear down and rebuild the
    // socket mid-quiz. The handlers close over the translator that was current
    // when they were registered, which only affects toast wording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleJoinSuccess = (token, name, joinLanguage) => {
    const lang = normalizeLanguage(joinLanguage);
    sessionStorage.setItem('quizSessionToken', token);
    sessionStorage.setItem('quizTeamName', name);
    sessionStorage.setItem('quizLanguage', lang);
    setSessionToken(token);
    setTeamName(name);
    setLanguage(lang);
  };

  // Leaving is destructive from the team's point of view — they have to find
  // the code and re-join, and a duplicate team name is refused — so it asks
  // first. Teams were hitting it by accident on phones.
  const handleLeaveTeam = () => {
    if (!window.confirm(tt('leaveTeamConfirm', { name: teamName }))) return;
    sessionStorage.removeItem('quizSessionToken');
    sessionStorage.removeItem('quizTeamName');
    setSessionToken(null);
    setTeamName('');
    setQuestions(null);
    setRound(null);
    setCustomScreen(null);
    setLeaderboardData(null);
  };

  // Submits with an ack + timeout so a stale post-backgrounding socket fails
  // loudly (and lets the button re-enable) instead of silently doing nothing.
  const handleSubmitAnswers = (answers, onResult) => {
    const finish = (result) => { if (onResult) onResult(result); };

    if (!socket || !socket.connected) {
      showToast(tt('notConnected'));
      finish({ success: false });
      return;
    }

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      showToast(tt('submitUnreachable'));
      finish({ success: false });
    }, 6000);

    socket.emit('team:submit', { answers }, (ack) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (ack && ack.success) {
        finish({ success: true });
      } else {
        showToast(tt('submitFailed'));
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
        round={round}
        language={language}
      />
    );
  }

  if (customScreen) {
    return <CustomScreenView screen={customScreen} toast={toast} />;
  }

  if (leaderboardData) {
    return (
      <LeaderboardView
        leaderboard={leaderboardData}
        myTeamId={myTeamId}
        mode={leaderboardMode}
        language={language}
      />
    );
  }

  // Waiting screen
  return (
    <div style={waitStyles.room}>
      <div style={waitStyles.bgGlow} />
      <div style={waitStyles.content}>
        <img src="/logo.png" alt="Quiz Masters of Melody" style={waitStyles.logo} />
        <h2 style={waitStyles.welcome}>{tt('welcome', { name: teamName })}</h2>
        <p style={waitStyles.subtitle}>{tt('waitingForQuizmaster')}</p>

        <div style={{
          ...waitStyles.statusBadge,
          backgroundColor: connectionStatus === 'connected' ? colors.successMuted
            : connectionStatus === 'reconnecting' ? colors.warningMuted : colors.errorMuted,
          color: connectionStatus === 'connected' ? colors.success
            : connectionStatus === 'reconnecting' ? colors.warning : colors.error,
        }}>
          {connectionStatus === 'connected' ? `● ${tt('connected')}`
            : connectionStatus === 'reconnecting' ? `● ${tt('reconnecting')}`
            : `● ${tt('disconnected')}`}
        </div>

        <div style={waitStyles.dots}>
          <div className="pulse-dot" style={{ animationDelay: '0s' }} />
          <div className="pulse-dot" style={{ animationDelay: '0.3s' }} />
          <div className="pulse-dot" style={{ animationDelay: '0.6s' }} />
        </div>

        <button onClick={handleLeaveTeam} style={waitStyles.leaveBtn}>
          {tt('leaveTeam')}
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

// An opening, break or end screen the quizmaster pushed. Deliberately plain:
// whatever text you wrote is the whole point, so nothing competes with it.
// Blank lines in the body are preserved (`white-space: pre-wrap`) so you can
// write a few short lines rather than one paragraph.
function CustomScreenView({ screen, toast }) {
  return (
    <div style={waitStyles.room}>
      <div style={waitStyles.bgGlow} />
      <div style={{ ...waitStyles.content, padding: '0 24px', maxWidth: '600px' }}>
        <img src="/logo.png" alt="Quiz Masters of Melody" style={waitStyles.logo} />
        <h2 style={screenStyles.title}>{screen.title}</h2>
        {screen.body ? <p style={screenStyles.body}>{screen.body}</p> : null}
      </div>
      {toast && <div style={commonStyles.toast}>{toast}</div>}
    </div>
  );
}

// Two shapes, chosen by the quizmaster at reveal time:
//   'top3' — the podium, then (if the viewing team isn't on it) a divider and
//            their own highlighted standing below.
//   'all'  — every team in order, with the viewing team's row highlighted.
function LeaderboardView({ leaderboard, myTeamId, mode, language }) {
  const tt = translator(language);
  const myIndex = leaderboard.findIndex((team) => team.id === myTeamId);
  const myEntry = myIndex >= 0 ? leaderboard[myIndex] : null;
  const medals = ['🥇', '🥈', '🥉'];
  const rankLabel = (i) => (i < 3 ? medals[i] : `#${i + 1}`);

  const showAll = mode === 'all';
  const visible = showAll ? leaderboard : leaderboard.slice(0, 3);
  const myInVisible = myIndex >= 0 && myIndex < visible.length;

  return (
    <div style={waitStyles.room}>
      <div style={waitStyles.bgGlow} />
      <div style={{ ...waitStyles.content, paddingTop: showAll ? '40px' : 0, paddingBottom: '40px' }}>
        <img src="/logo.png" alt="Quiz Masters of Melody" style={waitStyles.logo} />
        <h2 style={waitStyles.welcome}>🏆 {tt('leaderboard')}</h2>

        <div style={leaderboardStyles.list}>
          {visible.map((team, i) => (
            <div
              key={team.id}
              style={{
                ...leaderboardStyles.row,
                ...(team.id === myTeamId ? leaderboardStyles.rowMine : {}),
              }}
            >
              <span style={leaderboardStyles.medal}>{rankLabel(i)}</span>
              <span style={leaderboardStyles.name}>{team.team_name}</span>
              <span style={leaderboardStyles.score}>{formatScore(team.score)}</span>
            </div>
          ))}
        </div>

        {myEntry && !myInVisible && (
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

const screenStyles = {
  title: {
    fontSize: '32px', fontWeight: '800', marginBottom: '16px',
    textAlign: 'center', lineHeight: '1.25',
  },
  body: {
    fontSize: '18px', color: colors.textMuted, textAlign: 'center',
    lineHeight: '1.7', whiteSpace: 'pre-wrap', margin: 0,
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
  medal: { fontSize: '20px', width: '38px', textAlign: 'center', flexShrink: 0 },
  name: { flex: 1, fontSize: '16px', fontWeight: '700', color: colors.text },
  score: { fontSize: '18px', fontWeight: '800', color: colors.primary },
  divider: {
    color: colors.textDim, fontSize: '20px', letterSpacing: '4px',
    margin: '18px 0',
  },
};

export default App;
