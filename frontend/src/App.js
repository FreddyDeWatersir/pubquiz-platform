import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from './config';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn } from './auth';
import TeamJoin from './components/TeamJoin';
import OrganizerDashboard from './components/OrganizerDashboard';
import QuestionDisplay, { getQuestionOptions } from './components/QuestionDisplay';
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
// TEAM LOGIN — remembered on the phone
// ──────────────────────────────────────────────────────────
//
// When a team joins, the server hands the phone a login key (a session
// token). It used to live in sessionStorage, which belongs to one tab: a
// closed tab threw it away, and re-joining under the same name is refused as
// a duplicate, so the team was locked out of its own name. A browser warning
// on reload was the only thing guarding against that.
//
// Now it lives in localStorage, which survives closing the tab and restarting
// the browser. Reopening the site puts the team straight back in, and drafts
// restore its answers, so the reload warning has no job left and is gone.
//
// It expires 12 hours after the phone last connected, so next week's quiz
// starts at the code screen. The clock is renewed on every (re)connect, so a
// long evening never expires mid-quiz.
//
// Every access is wrapped: private browsing can make storage throw or forget.
// When it does, the phone simply behaves as before (login lasts for the tab).

const TEAM_SESSION_KEY = 'quizTeamSession';
const TEAM_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function loadTeamSession() {
  try {
    const raw = localStorage.getItem(TEAM_SESSION_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.token && Date.now() - Number(saved.savedAt || 0) < TEAM_SESSION_TTL_MS) {
        return saved;
      }
      localStorage.removeItem(TEAM_SESSION_KEY);
    }
  } catch {
    // Unreadable or blocked storage: fall through.
  }

  // A phone that was mid-quiz when this version was deployed still holds its
  // login in the tab's sessionStorage. Carry it over instead of kicking it
  // back to the code screen.
  try {
    const token = sessionStorage.getItem('quizSessionToken');
    if (token) {
      const migrated = {
        token,
        teamName: sessionStorage.getItem('quizTeamName') || '',
        language: sessionStorage.getItem('quizLanguage') || 'en',
        savedAt: Date.now(),
      };
      saveTeamSession(migrated);
      sessionStorage.removeItem('quizSessionToken');
      sessionStorage.removeItem('quizTeamName');
      sessionStorage.removeItem('quizLanguage');
      return migrated;
    }
  } catch {
    // Nothing to migrate.
  }
  return null;
}

function saveTeamSession(session) {
  try {
    localStorage.setItem(TEAM_SESSION_KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
  } catch {
    // Storage blocked: the login just won't outlive this tab.
  }
}

function clearTeamSession() {
  try {
    localStorage.removeItem(TEAM_SESSION_KEY);
  } catch {
    // Nothing to clear.
  }
}

// ──────────────────────────────────────────────────────────
// TEAM PAGE — with session persistence and proper WebSocket
// ──────────────────────────────────────────────────────────
//
// The team client is a small state machine. Precedence, highest first:
//   1. answering       — a round is live and this team hasn't handed in
//   2. customScreen    — the quizmaster pushed an opening/break/end screen
//   3. leaderboardData — the quizmaster revealed the standings
//   4. review          — what this team handed in (or had, if the round closed)
//   5. waiting room    — the default between rounds
// The server enforces the same order (activating a round clears any screen),
// so the two can't disagree about what teams should be looking at. Review sits
// below the quizmaster's screens on purpose: if they reveal standings while a
// team is looking at its own answers, the standings win, and hiding them
// returns the team to its review.
//
function TeamPage() {
  // Read once on mount. Survives a refresh and a closed tab (see above).
  const [initialSession] = useState(loadTeamSession);
  const [sessionToken, setSessionToken] = useState(() => initialSession?.token || null);
  const [teamName, setTeamName] = useState(() => initialSession?.teamName || '');
  // Seeded from the join response so the waiting room is already in the right
  // language on first paint; 'team:joined' then confirms it from the server.
  const [language, setLanguage] = useState(() => normalizeLanguage(initialSession?.language));
  const [questions, setQuestions] = useState(null);
  const [round, setRound] = useState(null); // { number, name }
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [toast, setToast] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [leaderboardMode, setLeaderboardMode] = useState('top3');
  const [customScreen, setCustomScreen] = useState(null); // { title, body, links, remainingMs }
  const [myTeamId, setMyTeamId] = useState(null);
  // null while a team can still answer; 'submitted' once they hand in;
  // 'closed' if the quizmaster closed the round before they did. In both
  // review states `questions` stays loaded, because the review is rendered
  // from the same questions plus whatever the server holds for this team.
  const [reviewMode, setReviewMode] = useState(null);
  // The server's copy of this team's answers for the live round, keyed by
  // question id. Feeds both the restore-after-refresh path and the review.
  const [savedAnswers, setSavedAnswers] = useState(null);

  const tt = translator(language);

  // The socket effect deliberately runs once per login, so its handlers can't
  // close over state that changes during a quiz. These refs give them the
  // current value without making the socket tear down and reconnect.
  const socketRef = useRef(null);
  const myTeamIdRef = useRef(null);
  const roundRef = useRef(null);
  useEffect(() => { myTeamIdRef.current = myTeamId; }, [myTeamId]);
  useEffect(() => { roundRef.current = round; }, [round]);

  const showToast = useCallback((message, duration = 3000) => {
    setToast(message);
    setTimeout(() => setToast(null), duration);
  }, []);

  // Back to the code screen. Not reachable by a team on purpose: the Leave
  // Team button is gone, because on a phone it sat right under the waiting
  // text and got pressed by accident, and re-joining under the same name is
  // refused as a duplicate. The only caller now is the server telling us this
  // login is dead (a quiz reset), where sitting on the waiting screen with an
  // error is worse than starting over.
  const clearSession = useCallback(() => {
    clearTeamSession();
    setSessionToken(null);
    setTeamName('');
    setQuestions(null);
    setRound(null);
    setCustomScreen(null);
    setLeaderboardData(null);
    setReviewMode(null);
    setSavedAnswers(null);
  }, []);

  // No "are you sure you want to reload?" warning any more. Its wording was
  // the browser's and could never be changed, and it only existed because a
  // refresh or closed tab used to lose answers and the login. Drafts and the
  // remembered login cover both, so it would just be a scary prompt.

  // WebSocket — properly managed in useEffect
  useEffect(() => {
    if (!sessionToken) return;

    const newSocket = io(API_URL, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    setSocket(newSocket);
    socketRef.current = newSocket;
    setConnectionStatus('connecting');

    // Ask the server what it already holds for this team in `round`, and use
    // it both to repopulate the inputs and to render the review. Called on
    // every round:started (covers a refresh and a reopened round), on submit,
    // and on close.
    const loadMyAnswers = (roundId, onLoaded) => {
      if (!roundId) return;
      newSocket.emit('team:getRoundAnswers', { roundId }, (ack) => {
        if (!ack || !ack.ok) return;
        setSavedAnswers(ack.answers || {});
        if (onLoaded) onLoaded(ack);
      });
    };

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
      if (data && data.teamId) {
        setMyTeamId(data.teamId);
        myTeamIdRef.current = data.teamId;
      }
      // The server is authoritative on every (re)join: the quiz's language
      // (so switching a quiz to Dutch mid-evening reaches teams already in the
      // room) and the team's name (so an organizer's rename shows up too).
      const lang = normalizeLanguage(data && data.language);
      const name = (data && data.teamName) || '';
      setLanguage(lang);
      if (name) setTeamName(name);
      // Saving again also renews the 12-hour expiry, so a phone that keeps
      // reconnecting through a long evening never gets logged out mid-quiz.
      saveTeamSession({ token: sessionToken, teamName: name, language: lang });
    });
    newSocket.on('round:started', (data) => {
      setQuestions(data.questions);
      setRound({ id: data.roundId, number: data.roundNumber, name: data.roundName || null });
      setLeaderboardData(null);
      setCustomScreen(null);
      // The payload is broadcast to the whole room, so it carries the list of
      // teams that already handed in and each phone checks for its own id.
      // That's what stops a reopened round, or a refresh after submitting,
      // from letting one team fill the same round in twice.
      const alreadyIn = Array.isArray(data.submittedTeamIds)
        && myTeamIdRef.current != null
        && data.submittedTeamIds.includes(myTeamIdRef.current);
      setReviewMode(alreadyIn ? 'submitted' : null);
      setSavedAnswers(null);
      loadMyAnswers(data.roundId);
    });
    newSocket.on('round:closed', (data) => {
      // Show the team what it had entered rather than dropping it back to the
      // waiting room with nothing. Teams that never touched the round have
      // nothing to show, so they go to the waiting room as before.
      const roundId = (data && data.roundId) || (roundRef.current && roundRef.current.id);
      loadMyAnswers(roundId, (ack) => {
        if (ack.answers && Object.keys(ack.answers).length > 0) {
          setReviewMode(ack.submitted ? 'submitted' : 'closed');
        } else {
          setQuestions(null);
          setRound(null);
          setReviewMode(null);
        }
      });
    });
    newSocket.on('team:submitted', () => {
      showToast(tt('answersSubmitted'));
      setReviewMode('submitted');
      loadMyAnswers(roundRef.current && roundRef.current.id);
    });
    newSocket.on('leaderboard:show', (data) => {
      setLeaderboardData(data.leaderboard);
      setLeaderboardMode(data.mode === 'all' ? 'all' : 'top3');
      setCustomScreen(null);
    });
    newSocket.on('leaderboard:hide', () => setLeaderboardData(null));
    newSocket.on('screen:show', (data) => {
      setCustomScreen({
        title: data.title,
        body: data.body || '',
        links: Array.isArray(data.links) ? data.links : [],
        // Time remaining as the server measured it at send time, not a
        // wall-clock end time: phone clocks are routinely minutes off.
        remainingMs: typeof data.remainingMs === 'number' ? data.remainingMs : null,
        // Changes on every push, so a re-shown screen restarts its countdown
        // rather than keeping the previous one's deadline.
        shownAt: Date.now(),
      });
      setLeaderboardData(null);
    });
    newSocket.on('screen:hide', () => setCustomScreen(null));
    newSocket.on('error', (data) => {
      // A login the server doesn't recognise any more — almost always because
      // the quiz was reset between rounds. Without this the phone sits on the
      // waiting screen forever, flashing an error it can't act on.
      if (data && data.message === 'Invalid session token') {
        clearSession();
        return;
      }
      showToast(tt('errorPrefix', { message: data.message }));
    });
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
    saveTeamSession({ token, teamName: name, language: lang });
    setSessionToken(token);
    setTeamName(name);
    setLanguage(lang);
  };

  // Every tap and keystroke goes to the server as a draft. Fire and forget:
  // a failed draft is not worth interrupting a team mid-round for, because
  // Submit sends the full set of answers anyway and is the path that reports
  // failure. What drafts buy is the organizer being able to recover answers
  // from a team that never got to press Submit.
  //
  // Taps go immediately. Typed answers wait until the team pauses for 700ms:
  // otherwise every keystroke from every table becomes a database write plus
  // a dashboard refresh, which on a full room is thousands of writes a round.
  const draftTimersRef = useRef({});
  const handleDraftChange = useCallback((questionId, value) => {
    const send = () => {
      const live = socketRef.current;
      if (!live || !live.connected) return;
      live.emit('team:draft', { questionId, ...value });
    };

    clearTimeout(draftTimersRef.current[questionId]);
    if (value && value.answerText !== undefined) {
      draftTimersRef.current[questionId] = setTimeout(send, 700);
    } else {
      send();
    }
  }, []);

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

  if (questions && !reviewMode) {
    return (
      <QuestionDisplay
        questions={questions}
        onSubmit={handleSubmitAnswers}
        teamName={teamName}
        connected={connectionStatus === 'connected'}
        round={round}
        language={language}
        savedAnswers={savedAnswers}
        onDraftChange={handleDraftChange}
      />
    );
  }

  if (customScreen) {
    return <CustomScreenView screen={customScreen} toast={toast} language={language} />;
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

  if (questions && reviewMode) {
    return (
      <AnswerReview
        questions={questions}
        answers={savedAnswers}
        round={round}
        teamName={teamName}
        mode={reviewMode}
        language={language}
        toast={toast}
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
        {/* No Leave Team button: on a phone it sat right under this text and
            got pressed by accident, and a team that left could not rejoin
            under the same name. Organizers fix mistakes from the dashboard. */}
      </div>

      {toast && <div style={commonStyles.toast}>{toast}</div>}
    </div>
  );
}

function formatScore(score) {
  const numeric = Number(score || 0);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

// What one team entered, with no indication of whether it was right. Teams
// asked to see their own answers after handing in; telling them how they did
// would give away the answers to every other table still playing, so the
// server never sends correctness to a phone in the first place.
function AnswerReview({ questions, answers, round, teamName, mode, language, toast }) {
  const tt = translator(language);
  const given = answers || {};

  // Mirrors the option-letter logic in QuestionDisplay: a question whose
  // letters are hidden should read back as "Rens", not "B. Rens".
  const describe = (question) => {
    const saved = given[question.id];
    if (!saved) return null;

    if (question.question_type === 'open') {
      const text = (saved.answerText || '').trim();
      return text || null;
    }

    const labels = question.answer_mode === 'multi'
      ? (Array.isArray(saved.selectedAnswers) ? saved.selectedAnswers : [])
      : [saved.selectedAnswer].filter(Boolean);
    if (labels.length === 0) return null;

    const options = getQuestionOptions(question);
    const showLetters = question.show_option_letters !== 0;
    return labels
      .map((label) => {
        const option = options.find((o) => o.label === label);
        if (!option) return label;
        return showLetters ? `${option.label}. ${option.text}` : option.text;
      })
      .join(', ');
  };

  return (
    <div style={reviewStyles.page}>
      <div style={reviewStyles.inner}>
        <span style={reviewStyles.teamBadge}>⚡ {teamName}</span>
        <h2 style={reviewStyles.title}>
          {mode === 'closed' ? tt('reviewClosedTitle') : tt('reviewSubmittedTitle')}
        </h2>
        <p style={reviewStyles.subtitle}>
          {mode === 'closed' ? tt('reviewClosedSubtitle') : tt('reviewSubmittedSubtitle')}
        </p>
        {round && round.number != null && (
          <p style={reviewStyles.round}>
            {tt('round', { number: round.number })}
            {round.name ? ` — ${round.name}` : ''}
          </p>
        )}

        <div style={reviewStyles.list}>
          {questions.map((question, index) => {
            const answer = describe(question);
            const prompt = (question.question_text && question.question_text.trim())
              || (question.image_url ? tt('pictureQuestion') : `${tt('untitledQuestion')} ${index + 1}`);
            return (
              <div key={question.id} style={reviewStyles.row}>
                <p style={reviewStyles.prompt}>{prompt}</p>
                <p style={answer ? reviewStyles.answer : reviewStyles.missing}>
                  {answer || tt('noAnswer')}
                </p>
              </div>
            );
          })}
        </div>
      </div>
      {toast && <div style={commonStyles.toast}>{toast}</div>}
    </div>
  );
}

/** mm:ss, or h:mm:ss once a countdown runs past an hour. */
function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

// An opening, break or end screen the quizmaster pushed. Deliberately plain:
// whatever text you wrote is the whole point. It can also carry a few link
// buttons (socials, the playlist, a feedback form) and a countdown.
// Blank lines in the body are preserved (`white-space: pre-wrap`) so you can
// write a few short lines rather than one paragraph.
function CustomScreenView({ screen, toast, language }) {
  const tt = translator(language);
  const { remainingMs, shownAt } = screen;

  // Counts down from the remaining time the server sent, measured against
  // this phone's own clock from the moment the screen arrived. Never compares
  // against a server timestamp, because phone clocks disagree by minutes.
  const [msLeft, setMsLeft] = useState(() => (
    remainingMs == null ? null : Math.max(0, remainingMs - (Date.now() - shownAt))
  ));

  useEffect(() => {
    if (remainingMs == null) {
      setMsLeft(null);
      return undefined;
    }
    const tick = () => setMsLeft(Math.max(0, remainingMs - (Date.now() - shownAt)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [remainingMs, shownAt]);

  return (
    <div style={waitStyles.room}>
      <div style={waitStyles.bgGlow} />
      <div style={{ ...waitStyles.content, padding: '40px 24px', maxWidth: '600px' }}>
        <img src="/logo.png" alt="Quiz Masters of Melody" style={waitStyles.logo} />
        <h2 style={screenStyles.title}>{screen.title}</h2>
        {screen.body ? <p style={screenStyles.body}>{screen.body}</p> : null}

        {msLeft != null && (
          <div style={screenStyles.countdownWrap}>
            {msLeft > 0 ? (
              <>
                <span style={screenStyles.countdownLabel}>{tt('backIn')}</span>
                <span style={screenStyles.countdown}>{formatRemaining(msLeft)}</span>
              </>
            ) : (
              <span style={screenStyles.countdownDone}>{tt('countdownDone')}</span>
            )}
          </div>
        )}

        {screen.links && screen.links.length > 0 && (
          <div style={screenStyles.links}>
            {screen.links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                // noreferrer as well as noopener: without it the opened page
                // can see where it was linked from, and on older browsers
                // noopener alone is not honoured.
                rel="noopener noreferrer"
                style={screenStyles.linkBtn}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
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
  countdownWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '4px', marginTop: '28px',
  },
  countdownLabel: {
    fontSize: '13px', fontWeight: '700', letterSpacing: '1px',
    textTransform: 'uppercase', color: colors.textMuted,
  },
  countdown: {
    fontSize: '44px', fontWeight: '800', color: colors.primary,
    // Stops the whole number jittering as the digits change width.
    fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
  },
  countdownDone: {
    fontSize: '22px', fontWeight: '800', color: colors.success, textAlign: 'center',
  },
  links: {
    display: 'flex', flexDirection: 'column', gap: '10px',
    marginTop: '32px', width: '300px', maxWidth: '90vw',
  },
  linkBtn: {
    display: 'block', padding: '14px 18px', textAlign: 'center',
    backgroundColor: colors.bgCard, color: colors.text,
    border: `1px solid ${colors.border}`, borderRadius: '12px',
    fontSize: '16px', fontWeight: '700', textDecoration: 'none',
  },
};

const reviewStyles = {
  page: {
    minHeight: '100vh', backgroundColor: colors.bg, color: colors.text,
    padding: '24px 20px 48px', fontFamily: "'Outfit', 'Segoe UI', sans-serif",
  },
  inner: { maxWidth: '800px', margin: '0 auto' },
  teamBadge: {
    ...commonStyles.badgeOrange, fontSize: '14px', padding: '6px 14px',
    display: 'inline-block', marginBottom: '16px',
  },
  title: { fontSize: '26px', fontWeight: '800', margin: '0 0 8px' },
  subtitle: { fontSize: '15px', color: colors.textMuted, margin: '0 0 4px', lineHeight: 1.6 },
  round: { fontSize: '14px', color: colors.textDim, margin: '0 0 24px', fontWeight: '600' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  row: {
    backgroundColor: colors.bgCard, border: `1px solid ${colors.border}`,
    borderRadius: '14px', padding: '16px 18px',
  },
  prompt: { fontSize: '14px', color: colors.textMuted, margin: '0 0 8px', lineHeight: 1.5 },
  answer: { fontSize: '17px', fontWeight: '700', margin: 0, color: colors.text },
  missing: { fontSize: '17px', fontWeight: '600', margin: 0, color: colors.textDim, fontStyle: 'italic' },
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
    border: `1px solid ${colors.primary}`, backgroundColor: colors.primaryMuted,
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
