import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import io from 'socket.io-client';
import { colors, commonStyles, shadows } from '../theme';

function OrganizerDashboard() {
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const [toast, setToast] = useState(null);

  // Answer grading
  const [gradingRoundId, setGradingRoundId] = useState(null);
  const [roundAnswers, setRoundAnswers] = useState([]);

  // Quiz creation form
  const [showCreateQuiz, setShowCreateQuiz] = useState(false);
  const [newQuizName, setNewQuizName] = useState('');
  const [newQuizCode, setNewQuizCode] = useState('');

  const showToast = (message, duration = 3000) => {
    setToast(message);
    setTimeout(() => setToast(null), duration);
  };

  // Fetch quizzes on mount
  useEffect(() => {
    fetchQuizzes();
  }, []);

  // Connect socket and fetch quiz data when a quiz is selected
  useEffect(() => {
    if (!selectedQuizId) return;

    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.emit('organizer:join', { quizId: selectedQuizId });

    newSocket.on('organizer:joined', (data) => {
      console.log('Organizer connected:', data);
    });

    newSocket.on('team:answered', (data) => {
      console.log('Team answered:', data);
      fetchLeaderboard(selectedQuizId);
    });

    newSocket.on('organizer:roundActivated', (data) => {
      showToast('Round activated! All teams received questions.');
      fetchRounds(selectedQuizId);
    });

    fetchTeams(selectedQuizId);
    fetchRounds(selectedQuizId);
    fetchLeaderboard(selectedQuizId);

    return () => {
      newSocket.disconnect();
    };
  }, [selectedQuizId]);

  const fetchQuizzes = async () => {
    try {
      const response = await fetch(`${API_URL}/api/organizer/quizzes`);
      const data = await response.json();
      setQuizzes(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      setLoading(false);
    }
  };

  const fetchTeams = async (quizId) => {
    try {
      const response = await fetch(`${API_URL}/api/organizer/quiz/${quizId}/teams`);
      const data = await response.json();
      setTeams(data);
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };

  const fetchRounds = async (quizId) => {
    try {
      const response = await fetch(`${API_URL}/api/organizer/quiz/${quizId}/rounds`);
      const data = await response.json();
      setRounds(data);
    } catch (error) {
      console.error('Error fetching rounds:', error);
    }
  };

  const fetchLeaderboard = async (quizId) => {
    try {
      const response = await fetch(`${API_URL}/api/organizer/quiz/${quizId}/leaderboard`);
      const data = await response.json();
      setLeaderboard(data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  const createQuiz = async () => {
    if (!newQuizName.trim() || !newQuizCode.trim()) {
      showToast('Please enter both a quiz name and access code');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/organizer/quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newQuizName, access_code: newQuizCode })
      });
      const data = await response.json();
      if (response.ok) {
        setNewQuizName('');
        setNewQuizCode('');
        setShowCreateQuiz(false);
        fetchQuizzes();
        setSelectedQuizId(data.quiz.id);
      } else {
        showToast(data.error || 'Failed to create quiz');
      }
    } catch (error) {
      showToast('Failed to create quiz');
    }
  };

  const deleteQuiz = async (quizId, quizName) => {
    if (!window.confirm(`Delete "${quizName}" and all its data? This cannot be undone.`)) return;
    try {
      const response = await fetch(`${API_URL}/api/organizer/quizzes/${quizId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        if (selectedQuizId === quizId) {
          setSelectedQuizId(null);
          setTeams([]);
          setRounds([]);
          setLeaderboard([]);
        }
        fetchQuizzes();
      }
    } catch (error) {
      console.error('Error deleting quiz:', error);
    }
  };

  const addRound = async () => {
    try {
      const response = await fetch(`${API_URL}/api/organizer/quiz/${selectedQuizId}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (response.ok) fetchRounds(selectedQuizId);
    } catch (error) {
      console.error('Error adding round:', error);
    }
  };

  const deleteRound = async (roundId) => {
    if (!window.confirm('Delete this round and all its questions?')) return;
    try {
      const response = await fetch(`${API_URL}/api/organizer/rounds/${roundId}`, {
        method: 'DELETE'
      });
      if (response.ok) fetchRounds(selectedQuizId);
    } catch (error) {
      console.error('Error deleting round:', error);
    }
  };

  const activateRound = async (roundId) => {
    if (!socket) {
      showToast('WebSocket not connected!');
      return;
    }
    socket.emit('organizer:activateRound', { roundId });
  };

  const resetQuiz = async () => {
    if (!window.confirm('⚠️ This will DELETE all teams, answers, and reset rounds. Are you sure?')) return;
    try {
      const response = await fetch(`${API_URL}/api/organizer/quiz/${selectedQuizId}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        showToast('Quiz reset successfully!');
        fetchTeams(selectedQuizId);
        fetchRounds(selectedQuizId);
        fetchLeaderboard(selectedQuizId);
        setRoundAnswers([]);
        setGradingRoundId(null);
      }
    } catch (error) {
      console.error('Error resetting quiz:', error);
    }
  };

  const fetchRoundAnswers = async (roundId) => {
    try {
      const response = await fetch(
        `${API_URL}/api/organizer/quiz/${selectedQuizId}/round/${roundId}/answers`
      );
      const data = await response.json();
      setRoundAnswers(data);
      setGradingRoundId(roundId);
    } catch (error) {
      console.error('Error fetching answers:', error);
    }
  };

  const gradeAnswer = async (answerId, isCorrect) => {
    try {
      await fetch(`${API_URL}/api/organizer/answers/${answerId}/grade`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_correct: isCorrect })
      });
      setRoundAnswers(prev =>
        prev.map(a => a.answer_id === answerId ? { ...a, is_correct: isCorrect ? 1 : 0 } : a)
      );
      fetchLeaderboard(selectedQuizId);
    } catch (error) {
      console.error('Error grading answer:', error);
    }
  };

  // ──────────────────────────────────────────────────────────
  // SPREADSHEET EXPORT
  // ──────────────────────────────────────────────────────────
  //
  // LEARNING POINT: This generates a CSV file entirely on the client.
  // No backend needed. We take the roundAnswers data (which is already
  // in memory) and convert it to a CSV string, then trigger a download.
  //
  // The trick: we create a Blob (binary data), make a temporary URL for it,
  // create an invisible <a> link, click it programmatically, then clean up.
  // This is the standard pattern for client-side file downloads in JS.
  //
  const exportToSpreadsheet = () => {
    if (roundAnswers.length === 0) {
      showToast('No answers to export');
      return;
    }

    // Build CSV rows
    const headers = ['Question', 'Type', 'Correct Answer', 'Team', 'Team Answer', 'Result'];
    const rows = roundAnswers.map(a => {
      const teamAnswer = a.question_type === 'open'
        ? (a.answer_text || '—')
        : (a.selected_answer || '—');
      const result = a.is_correct === 1 ? 'Correct'
        : a.is_correct === 0 ? 'Wrong'
        : 'Pending';

      // CSV escaping: wrap in quotes if the value contains commas or quotes
      return [
        a.question_text,
        a.question_type,
        a.correct_answer,
        a.team_name,
        teamAnswer,
        result,
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');

    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const roundNum = rounds.find(r => r.id === gradingRoundId)?.round_number || 'unknown';
    const quizName = quizzes.find(q => q.id === selectedQuizId)?.name || 'quiz';
    link.download = `${quizName}_round${roundNum}_answers.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Spreadsheet downloaded! ✓');
  };

  // Also export the full leaderboard
  const exportLeaderboard = () => {
    if (leaderboard.length === 0) {
      showToast('No leaderboard data to export');
      return;
    }

    const headers = ['Rank', 'Team Name', 'Score', 'Total Answered'];
    const rows = leaderboard.map((team, index) => {
      return [index + 1, team.team_name, team.score, team.total_answered]
        .map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const quizName = quizzes.find(q => q.id === selectedQuizId)?.name || 'quiz';
    link.download = `${quizName}_leaderboard.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Leaderboard exported! ✓');
  };

  if (loading) {
    return (
      <div style={s.container}>
        <p style={{ textAlign: 'center', fontSize: '18px', marginTop: '50px', color: colors.textMuted }}>
          Loading...
        </p>
      </div>
    );
  }

  // ==========================================
  // QUIZ SELECTOR VIEW
  // ==========================================
  if (!selectedQuizId) {
    return (
      <div style={s.container}>
        <div style={s.header}>
          <h1 style={s.title}>⚡ Organizer Dashboard</h1>
        </div>

        <div style={s.content}>
          <div style={s.section}>
            <div style={s.sectionHeader}>
              <h2 style={s.sectionTitle}>Your Quizzes</h2>
              <button onClick={() => setShowCreateQuiz(!showCreateQuiz)} style={s.addBtn}>
                + New Quiz
              </button>
            </div>

            {showCreateQuiz && (
              <div style={s.createForm}>
                <input
                  type="text"
                  placeholder="Quiz name (e.g. Friday Night Trivia)"
                  value={newQuizName}
                  onChange={(e) => setNewQuizName(e.target.value)}
                  style={commonStyles.input}
                />
                <input
                  type="text"
                  placeholder="Access code (e.g. FRIDAY1)"
                  value={newQuizCode}
                  onChange={(e) => setNewQuizCode(e.target.value.toUpperCase())}
                  style={commonStyles.input}
                  maxLength={20}
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={createQuiz} style={s.saveBtn}>Create Quiz</button>
                  <button onClick={() => setShowCreateQuiz(false)} style={s.ghostBtn}>Cancel</button>
                </div>
              </div>
            )}

            <div style={s.quizGrid}>
              {quizzes.length === 0 ? (
                <p style={s.emptyText}>No quizzes yet. Create your first one!</p>
              ) : (
                quizzes.map((quiz) => (
                  <div key={quiz.id} style={s.quizCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h3 style={s.quizCardName}>{quiz.name}</h3>
                      <span style={commonStyles.badgeOrange}>
                        {quiz.access_code}
                      </span>
                    </div>
                    <div style={s.quizCardStats}>
                      <span>{quiz.round_count || 0} rounds</span>
                      <span style={s.statDot}>·</span>
                      <span>{quiz.team_count || 0} teams</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => setSelectedQuizId(quiz.id)}
                        style={s.openBtn}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => deleteQuiz(quiz.id, quiz.name)}
                        style={s.deleteSmBtn}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {toast && <div style={commonStyles.toast}>{toast}</div>}
      </div>
    );
  }

  // ==========================================
  // QUIZ DASHBOARD VIEW
  // ==========================================
  const selectedQuiz = quizzes.find(q => q.id === selectedQuizId);

  return (
    <div style={s.container}>
      <div style={s.header}>
        <button onClick={() => setSelectedQuizId(null)} style={s.backBtn}>
          ← All Quizzes
        </button>
        <div>
          <h1 style={s.title}>{selectedQuiz?.name || 'Quiz'}</h1>
          <span style={{ color: colors.textMuted, fontSize: '14px' }}>
            Code: {selectedQuiz?.access_code}
          </span>
        </div>
        <button onClick={resetQuiz} style={s.dangerBtn}>
          🔄 Reset
        </button>
      </div>

      <div style={s.content}>
        {/* Teams Section */}
        <div style={s.section}>
          <h2 style={s.sectionTitle}>👥 Teams ({teams.length})</h2>
          <div style={s.teamGrid}>
            {teams.length === 0 ? (
              <p style={s.emptyText}>No teams have joined yet...</p>
            ) : (
              teams.map((team) => (
                <div key={team.id} style={s.teamCard}>
                  <span style={{ fontSize: '16px', fontWeight: '600' }}>{team.team_name}</span>
                  <span style={{ fontSize: '12px', color: colors.textDim }}>
                    {new Date(team.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Rounds Section */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>📋 Rounds</h2>
            <button onClick={addRound} style={s.addBtn}>+ Add Round</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rounds.length === 0 ? (
              <p style={s.emptyText}>No rounds yet. Add your first round!</p>
            ) : (
              rounds.map((round) => (
                <div key={round.id} style={s.roundCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h3 style={{ fontSize: '18px', margin: 0, fontWeight: '700' }}>
                      Round {round.round_number}
                    </h3>
                    <span style={{ color: colors.textMuted, fontSize: '14px' }}>
                      {round.question_count} questions
                    </span>
                    {round.is_active === 1 && (
                      <span style={commonStyles.badgeGreen}>ACTIVE</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => fetchRoundAnswers(round.id)} style={s.purpleBtn}>
                      📝 Review
                    </button>
                    <button
                      onClick={() => activateRound(round.id)}
                      style={{
                        ...s.activateBtn,
                        ...(round.is_active === 1 ? s.activeBtnDisabled : {})
                      }}
                      disabled={round.is_active === 1}
                    >
                      {round.is_active === 1 ? 'Active' : 'Activate'}
                    </button>
                    <button onClick={() => deleteRound(round.id)} style={s.deleteSmBtn}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Answer Grading Section */}
        {gradingRoundId && (
          <div style={s.section}>
            <div style={s.sectionHeader}>
              <h2 style={s.sectionTitle}>
                📝 Answers — Round {rounds.find(r => r.id === gradingRoundId)?.round_number}
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                {/* SPREADSHEET EXPORT BUTTON */}
                <button onClick={exportToSpreadsheet} style={s.exportBtn}>
                  📊 Export CSV
                </button>
                <button onClick={() => { setGradingRoundId(null); setRoundAnswers([]); }} style={s.ghostBtn}>
                  ✕ Close
                </button>
              </div>
            </div>

            {roundAnswers.length === 0 ? (
              <p style={s.emptyText}>No answers submitted yet for this round.</p>
            ) : (
              (() => {
                const byQuestion = {};
                roundAnswers.forEach(a => {
                  if (!byQuestion[a.question_id]) {
                    byQuestion[a.question_id] = {
                      question_text: a.question_text,
                      question_type: a.question_type,
                      correct_answer: a.correct_answer,
                      answers: []
                    };
                  }
                  byQuestion[a.question_id].answers.push(a);
                });

                return Object.entries(byQuestion).map(([qId, q]) => (
                  <div key={qId} style={s.gradingCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '16px' }}>{q.question_text}</strong>
                      <span style={q.question_type === 'open' ? commonStyles.badgePurple : commonStyles.badgeOrange}>
                        {q.question_type === 'open' ? 'Open' : 'MC'}
                      </span>
                    </div>
                    <p style={{ color: colors.success, fontSize: '13px', marginBottom: '12px', fontStyle: 'italic' }}>
                      Correct: {q.correct_answer}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {q.answers.map(a => (
                        <div key={a.answer_id} style={{
                          ...s.answerRow,
                          borderLeftColor: a.is_correct === 1 ? colors.success
                            : a.is_correct === 0 ? colors.error : colors.warning,
                        }}>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: 1 }}>
                            <span style={{ fontWeight: '700', minWidth: '100px' }}>{a.team_name}</span>
                            <span style={{ color: colors.textMuted }}>
                              {a.question_type === 'open' ? (a.answer_text || '—') : (a.selected_answer || '—')}
                            </span>
                          </div>
                          {q.question_type === 'open' ? (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => gradeAnswer(a.answer_id, true)}
                                style={{
                                  ...s.gradeBtn,
                                  ...(a.is_correct === 1 ? s.gradeBtnCorrect : {}),
                                }}
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => gradeAnswer(a.answer_id, false)}
                                style={{
                                  ...s.gradeBtn,
                                  ...(a.is_correct === 0 ? s.gradeBtnWrong : {}),
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span style={{
                              fontSize: '20px', fontWeight: '700',
                              color: a.is_correct === 1 ? colors.success : colors.error,
                            }}>
                              {a.is_correct === 1 ? '✓' : '✕'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()
            )}
          </div>
        )}

        {/* Leaderboard Section */}
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <h2 style={s.sectionTitle}>🏆 Leaderboard</h2>
            {leaderboard.length > 0 && (
              <button onClick={exportLeaderboard} style={s.exportBtn}>
                📊 Export CSV
              </button>
            )}
          </div>
          <div style={s.tableContainer}>
            {leaderboard.length === 0 ? (
              <p style={s.emptyText}>No scores yet...</p>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr style={s.tableHead}>
                    <th style={s.th}>Rank</th>
                    <th style={s.th}>Team Name</th>
                    <th style={s.th}>Score</th>
                    <th style={s.th}>Answered</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((team, index) => (
                    <tr key={team.id} style={s.tr}>
                      <td style={s.td}>
                        <span style={{ fontSize: '20px' }}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                      </td>
                      <td style={{ ...s.td, fontWeight: '600' }}>{team.team_name}</td>
                      <td style={s.td}>
                        <strong style={{ fontSize: '22px', color: colors.primary }}>
                          {team.score}
                        </strong>
                      </td>
                      <td style={{ ...s.td, color: colors.textMuted }}>{team.total_answered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {toast && <div style={commonStyles.toast}>{toast}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// STYLES
// ──────────────────────────────────────────────────────────
const s = {
  container: {
    ...commonStyles.pageContainer,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '40px', flexWrap: 'wrap', gap: '15px',
    maxWidth: '1200px', margin: '0 auto 40px',
  },
  title: { fontSize: '28px', fontWeight: '800', margin: 0 },
  content: { maxWidth: '1200px', margin: '0 auto' },

  section: { marginBottom: '40px' },
  sectionHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '20px', borderBottom: `1px solid ${colors.border}`, paddingBottom: '12px',
  },
  sectionTitle: { fontSize: '20px', fontWeight: '700', margin: 0 },

  // Buttons
  backBtn: {
    ...commonStyles.buttonGhost,
  },
  addBtn: {
    padding: '10px 20px', backgroundColor: colors.primary, color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontWeight: '700', fontSize: '14px',
  },
  saveBtn: {
    flex: 1, padding: '12px', backgroundColor: colors.success, color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontWeight: '700', fontSize: '15px',
  },
  ghostBtn: {
    ...commonStyles.buttonGhost,
  },
  dangerBtn: { ...commonStyles.buttonDanger },
  openBtn: {
    flex: 1, padding: '10px', backgroundColor: colors.primary, color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px',
  },
  deleteSmBtn: {
    padding: '10px 14px', backgroundColor: colors.bgCard,
    border: `1px solid ${colors.error}`, borderRadius: '8px',
    cursor: 'pointer', fontSize: '14px', color: colors.text,
  },
  purpleBtn: {
    ...commonStyles.buttonSecondary,
  },
  activateBtn: {
    padding: '10px 24px', fontSize: '14px', backgroundColor: colors.bgInput,
    color: colors.text, border: `1px solid ${colors.border}`,
    borderRadius: '8px', cursor: 'pointer', fontWeight: '600',
  },
  activeBtnDisabled: {
    opacity: 0.4, cursor: 'not-allowed',
  },
  exportBtn: {
    padding: '8px 16px', backgroundColor: colors.successMuted, color: colors.success,
    border: `1px solid ${colors.success}`, borderRadius: '8px',
    cursor: 'pointer', fontWeight: '600', fontSize: '13px',
  },

  // Quiz grid
  quizGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px', marginTop: '16px',
  },
  quizCard: {
    backgroundColor: colors.bgCard, padding: '24px', borderRadius: '14px',
    display: 'flex', flexDirection: 'column', gap: '14px',
    border: `1px solid ${colors.border}`,
  },
  quizCardName: { fontSize: '18px', margin: 0, fontWeight: '700' },
  quizCardStats: { color: colors.textMuted, fontSize: '14px' },
  statDot: { margin: '0 8px' },

  // Create form
  createForm: {
    backgroundColor: colors.bgCard, padding: '24px', borderRadius: '14px',
    marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
    border: `1px solid ${colors.border}`,
  },

  // Teams
  teamGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '12px',
  },
  teamCard: {
    backgroundColor: colors.bgCard, padding: '16px', borderRadius: '10px',
    display: 'flex', flexDirection: 'column', gap: '4px',
    border: `1px solid ${colors.border}`,
  },

  // Rounds
  roundCard: {
    backgroundColor: colors.bgCard, padding: '18px 20px', borderRadius: '12px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    border: `1px solid ${colors.border}`,
  },

  // Grading
  gradingCard: {
    backgroundColor: colors.bgCard, padding: '20px', borderRadius: '12px',
    marginBottom: '12px', border: `1px solid ${colors.border}`,
  },
  answerRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', backgroundColor: colors.bgInput, borderRadius: '8px',
    borderLeft: `4px solid ${colors.warning}`,
  },
  gradeBtn: {
    width: '36px', height: '36px', border: `1px solid ${colors.border}`,
    borderRadius: '8px', cursor: 'pointer', fontSize: '16px',
    backgroundColor: 'transparent', color: colors.text,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  gradeBtnCorrect: { backgroundColor: colors.success, borderColor: colors.success },
  gradeBtnWrong: { backgroundColor: colors.error, borderColor: colors.error },

  // Leaderboard
  tableContainer: {
    backgroundColor: colors.bgCard, borderRadius: '12px', padding: '20px',
    overflowX: 'auto', border: `1px solid ${colors.border}`,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHead: { borderBottom: `2px solid ${colors.border}` },
  th: { padding: '12px', textAlign: 'left', color: colors.textMuted, fontWeight: '600', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px' },
  tr: { borderBottom: `1px solid ${colors.border}` },
  td: { padding: '14px 12px' },

  emptyText: { color: colors.textDim, fontStyle: 'italic', padding: '20px 0' },
};

export default OrganizerDashboard;
