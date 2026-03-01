import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import io from 'socket.io-client';

function OrganizerDashboard() {
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);

  // Answer grading
  const [gradingRoundId, setGradingRoundId] = useState(null);
  const [roundAnswers, setRoundAnswers] = useState([]);

  // Quiz creation form
  const [showCreateQuiz, setShowCreateQuiz] = useState(false);
  const [newQuizName, setNewQuizName] = useState('');
  const [newQuizCode, setNewQuizCode] = useState('');

  // Fetch quizzes on mount
  useEffect(() => {
    fetchQuizzes();
  }, []);

  // Connect socket and fetch quiz data when a quiz is selected
  useEffect(() => {
    if (!selectedQuizId) return;

    // Connect to WebSocket
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
      console.log('Round activated:', data);
      alert('Round activated! All teams received questions.');
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
      alert('Please enter both a quiz name and access code');
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
        // Auto-select the new quiz
        setSelectedQuizId(data.quiz.id);
      } else {
        alert(data.error || 'Failed to create quiz');
      }
    } catch (error) {
      console.error('Error creating quiz:', error);
      alert('Failed to create quiz');
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
      } else {
        alert('Failed to delete quiz');
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

      if (response.ok) {
        fetchRounds(selectedQuizId);
      } else {
        alert('Failed to add round');
      }
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

      if (response.ok) {
        fetchRounds(selectedQuizId);
      }
    } catch (error) {
      console.error('Error deleting round:', error);
    }
  };

  const activateRound = async (roundId) => {
    if (!socket) {
      alert('WebSocket not connected!');
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
        alert('Quiz reset successfully!');
        fetchTeams(selectedQuizId);
        fetchRounds(selectedQuizId);
        fetchLeaderboard(selectedQuizId);
        setRoundAnswers([]);
        setGradingRoundId(null);
      } else {
        alert('Failed to reset quiz');
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

      // Update local state
      setRoundAnswers(prev =>
        prev.map(a => a.answer_id === answerId ? { ...a, is_correct: isCorrect ? 1 : 0 } : a)
      );
      fetchLeaderboard(selectedQuizId);
    } catch (error) {
      console.error('Error grading answer:', error);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.loadingText}>Loading...</p>
      </div>
    );
  }

  // ==========================================
  // QUIZ SELECTOR VIEW (no quiz selected)
  // ==========================================
  if (!selectedQuizId) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>🎮 Organizer Dashboard</h1>
        </div>

        <div style={styles.content}>
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>📋 Your Quizzes</h2>
              <button onClick={() => setShowCreateQuiz(!showCreateQuiz)} style={styles.addRoundButton}>
                ➕ New Quiz
              </button>
            </div>

            {showCreateQuiz && (
              <div style={styles.createQuizForm}>
                <input
                  type="text"
                  placeholder="Quiz name (e.g. Friday Night Trivia)"
                  value={newQuizName}
                  onChange={(e) => setNewQuizName(e.target.value)}
                  style={styles.formInput}
                />
                <input
                  type="text"
                  placeholder="Access code (e.g. FRIDAY1)"
                  value={newQuizCode}
                  onChange={(e) => setNewQuizCode(e.target.value.toUpperCase())}
                  style={styles.formInput}
                  maxLength={20}
                />
                <div style={styles.formButtons}>
                  <button onClick={createQuiz} style={styles.saveButton}>Create Quiz</button>
                  <button onClick={() => setShowCreateQuiz(false)} style={styles.cancelButton}>Cancel</button>
                </div>
              </div>
            )}

            <div style={styles.quizGrid}>
              {quizzes.length === 0 ? (
                <p style={styles.emptyText}>No quizzes yet. Create your first one!</p>
              ) : (
                quizzes.map((quiz) => (
                  <div key={quiz.id} style={styles.quizCard}>
                    <div style={styles.quizCardTop}>
                      <h3 style={styles.quizCardName}>{quiz.name}</h3>
                      <span style={styles.codeBadge}>Code: {quiz.access_code}</span>
                    </div>
                    <div style={styles.quizCardStats}>
                      <span>{quiz.round_count || 0} rounds</span>
                      <span style={styles.statDivider}>·</span>
                      <span>{quiz.team_count || 0} teams</span>
                    </div>
                    <div style={styles.quizCardActions}>
                      <button
                        onClick={() => setSelectedQuizId(quiz.id)}
                        style={styles.openButton}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => deleteQuiz(quiz.id, quiz.name)}
                        style={styles.deleteSmallButton}
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
      </div>
    );
  }

  // ==========================================
  // QUIZ DASHBOARD VIEW (quiz selected)
  // ==========================================
  const selectedQuiz = quizzes.find(q => q.id === selectedQuizId);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={() => setSelectedQuizId(null)} style={styles.backBtn}>
          ← All Quizzes
        </button>
        <div>
          <h1 style={styles.title}>{selectedQuiz?.name || 'Quiz'}</h1>
          <span style={styles.headerCode}>Code: {selectedQuiz?.access_code}</span>
        </div>
        <button onClick={resetQuiz} style={styles.resetButton}>
          🔄 Reset
        </button>
      </div>

      <div style={styles.content}>
        {/* Teams Section */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>👥 Teams ({teams.length})</h2>
          <div style={styles.cardContainer}>
            {teams.length === 0 ? (
              <p style={styles.emptyText}>No teams have joined yet...</p>
            ) : (
              teams.map((team) => (
                <div key={team.id} style={styles.teamCard}>
                  <span style={styles.teamName}>{team.team_name}</span>
                  <span style={styles.teamTime}>
                    {new Date(team.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Rounds Section */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>📋 Rounds</h2>
            <button onClick={addRound} style={styles.addRoundButton}>
              ➕ Add Round
            </button>
          </div>
          <div style={styles.roundsContainer}>
            {rounds.length === 0 ? (
              <p style={styles.emptyText}>No rounds yet. Add your first round!</p>
            ) : (
              rounds.map((round) => (
                <div key={round.id} style={styles.roundCard}>
                  <div style={styles.roundInfo}>
                    <h3 style={styles.roundTitle}>Round {round.round_number}</h3>
                    <p style={styles.roundQuestions}>
                      {round.question_count} questions
                    </p>
                    {round.is_active === 1 && (
                      <span style={styles.activeBadge}>ACTIVE</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => fetchRoundAnswers(round.id)}
                      style={styles.reviewButton}
                    >
                      📝 Review
                    </button>
                    <button
                      onClick={() => activateRound(round.id)}
                      style={{
                        ...styles.activateButton,
                        ...(round.is_active === 1 ? styles.activeButton : {})
                      }}
                      disabled={round.is_active === 1}
                    >
                      {round.is_active === 1 ? 'Active' : 'Activate'}
                    </button>
                    <button
                      onClick={() => deleteRound(round.id)}
                      style={styles.deleteSmallButton}
                    >
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
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>
                📝 Answers — Round {rounds.find(r => r.id === gradingRoundId)?.round_number}
              </h2>
              <button onClick={() => { setGradingRoundId(null); setRoundAnswers([]); }} style={styles.closeGradingButton}>
                ✕ Close
              </button>
            </div>

            {roundAnswers.length === 0 ? (
              <p style={styles.emptyText}>No answers submitted yet for this round.</p>
            ) : (
              (() => {
                // Group answers by question
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
                  <div key={qId} style={styles.gradingQuestionCard}>
                    <div style={styles.gradingQuestionHeader}>
                      <strong>{q.question_text}</strong>
                      <span style={q.question_type === 'open' ? styles.typeBadgeOpen : styles.typeBadgeMC}>
                        {q.question_type === 'open' ? 'Open' : 'MC'}
                      </span>
                    </div>
                    <p style={styles.correctAnswerHint}>Correct: {q.correct_answer}</p>
                    <div style={styles.answersGrid}>
                      {q.answers.map(a => (
                        <div key={a.answer_id} style={{
                          ...styles.answerRow,
                          borderLeftColor: a.is_correct === 1 ? '#2ecc71' : a.is_correct === 0 ? '#e74c3c' : '#f39c12'
                        }}>
                          <div style={styles.answerInfo}>
                            <span style={styles.answerTeam}>{a.team_name}</span>
                            <span style={styles.answerValue}>
                              {a.question_type === 'open' ? (a.answer_text || '—') : (a.selected_answer || '—')}
                            </span>
                          </div>
                          {q.question_type === 'open' && (
                            <div style={styles.gradeButtons}>
                              <button
                                onClick={() => gradeAnswer(a.answer_id, true)}
                                style={{
                                  ...styles.gradeBtn,
                                  ...(a.is_correct === 1 ? styles.gradeBtnActiveCorrect : {})
                                }}
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => gradeAnswer(a.answer_id, false)}
                                style={{
                                  ...styles.gradeBtn,
                                  ...(a.is_correct === 0 ? styles.gradeBtnActiveWrong : {})
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          )}
                          {q.question_type !== 'open' && (
                            <span style={a.is_correct === 1 ? styles.correctMark : styles.wrongMark}>
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
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>🏆 Leaderboard</h2>
          <div style={styles.leaderboardContainer}>
            {leaderboard.length === 0 ? (
              <p style={styles.emptyText}>No scores yet...</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr style={styles.tableHeader}>
                    <th style={styles.tableHeaderCell}>Rank</th>
                    <th style={styles.tableHeaderCell}>Team Name</th>
                    <th style={styles.tableHeaderCell}>Score</th>
                    <th style={styles.tableHeaderCell}>Answered</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((team, index) => (
                    <tr key={team.id} style={styles.tableRow}>
                      <td style={styles.tableCell}>
                        <span style={styles.rank}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                      </td>
                      <td style={styles.tableCell}>{team.team_name}</td>
                      <td style={styles.tableCell}>
                        <strong style={styles.score}>{team.score}</strong>
                      </td>
                      <td style={styles.tableCell}>{team.total_answered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#1a1a2e',
    color: '#fff',
    padding: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '40px',
    flexWrap: 'wrap',
    gap: '15px',
  },
  title: {
    fontSize: '32px',
    margin: 0,
  },
  headerCode: {
    color: '#a0a0a0',
    fontSize: '14px',
  },
  backBtn: {
    padding: '10px 20px',
    backgroundColor: '#16213e',
    color: '#fff',
    border: '1px solid #0f3460',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  section: {
    marginBottom: '40px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '2px solid #0f3460',
    paddingBottom: '10px',
  },
  sectionTitle: {
    fontSize: '24px',
    margin: 0,
  },
  // Quiz grid
  quizGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
    marginTop: '20px',
  },
  quizCard: {
    backgroundColor: '#16213e',
    padding: '25px',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  quizCardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  quizCardName: {
    fontSize: '20px',
    margin: 0,
  },
  codeBadge: {
    backgroundColor: '#0f3460',
    color: '#fff',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'monospace',
    letterSpacing: '1px',
  },
  quizCardStats: {
    color: '#a0a0a0',
    fontSize: '14px',
  },
  statDivider: {
    margin: '0 8px',
  },
  quizCardActions: {
    display: 'flex',
    gap: '10px',
  },
  openButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#0f3460',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '15px',
  },
  deleteSmallButton: {
    padding: '10px 14px',
    backgroundColor: '#16213e',
    border: '1px solid #e74c3c',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  // Create quiz form
  createQuizForm: {
    backgroundColor: '#16213e',
    padding: '25px',
    borderRadius: '10px',
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  formInput: {
    padding: '12px',
    fontSize: '16px',
    border: 'none',
    borderRadius: '5px',
    boxSizing: 'border-box',
  },
  formButtons: {
    display: 'flex',
    gap: '10px',
  },
  saveButton: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#2ecc71',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '15px',
  },
  cancelButton: {
    padding: '12px 24px',
    backgroundColor: '#555',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  addRoundButton: {
    padding: '10px 20px',
    backgroundColor: '#2ecc71',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px',
  },
  // Teams
  cardContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '15px',
  },
  teamCard: {
    backgroundColor: '#16213e',
    padding: '15px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  teamName: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  teamTime: {
    fontSize: '12px',
    color: '#a0a0a0',
  },
  emptyText: {
    color: '#a0a0a0',
    fontStyle: 'italic',
  },
  // Rounds
  roundsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  roundCard: {
    backgroundColor: '#16213e',
    padding: '20px',
    borderRadius: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roundInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  roundTitle: {
    fontSize: '20px',
    margin: 0,
  },
  roundQuestions: {
    color: '#a0a0a0',
    margin: 0,
  },
  activeBadge: {
    backgroundColor: '#2ecc71',
    color: '#fff',
    padding: '5px 10px',
    borderRadius: '5px',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  activateButton: {
    padding: '10px 30px',
    fontSize: '16px',
    backgroundColor: '#0f3460',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  activeButton: {
    backgroundColor: '#555',
    cursor: 'not-allowed',
  },
  // Leaderboard
  leaderboardContainer: {
    backgroundColor: '#16213e',
    borderRadius: '8px',
    padding: '20px',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    borderBottom: '2px solid #0f3460',
  },
  tableHeaderCell: {
    padding: '12px',
    textAlign: 'left',
    color: '#a0a0a0',
    fontWeight: 'bold',
  },
  tableRow: {
    borderBottom: '1px solid #0f3460',
  },
  tableCell: {
    padding: '15px 12px',
  },
  rank: {
    fontSize: '20px',
  },
  score: {
    fontSize: '24px',
    color: '#2ecc71',
  },
  resetButton: {
    padding: '12px 24px',
    fontSize: '16px',
    backgroundColor: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  reviewButton: {
    padding: '10px 20px',
    fontSize: '14px',
    backgroundColor: '#8e44ad',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  closeGradingButton: {
    padding: '8px 16px',
    backgroundColor: '#555',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  gradingQuestionCard: {
    backgroundColor: '#16213e',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '15px',
  },
  gradingQuestionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    marginBottom: '5px',
  },
  typeBadgeMC: { backgroundColor: '#0f3460', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  typeBadgeOpen: { backgroundColor: '#8e44ad', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  correctAnswerHint: {
    color: '#2ecc71',
    fontSize: '13px',
    marginBottom: '12px',
    fontStyle: 'italic',
  },
  answersGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  answerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    backgroundColor: '#1a1a3e',
    borderRadius: '5px',
    borderLeft: '4px solid #f39c12',
  },
  answerInfo: {
    display: 'flex',
    gap: '15px',
    alignItems: 'center',
    flex: 1,
  },
  answerTeam: {
    fontWeight: 'bold',
    minWidth: '120px',
  },
  answerValue: {
    color: '#ccc',
  },
  gradeButtons: {
    display: 'flex',
    gap: '6px',
  },
  gradeBtn: {
    width: '36px',
    height: '36px',
    border: '2px solid #555',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    backgroundColor: 'transparent',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeBtnActiveCorrect: {
    backgroundColor: '#2ecc71',
    borderColor: '#2ecc71',
  },
  gradeBtnActiveWrong: {
    backgroundColor: '#e74c3c',
    borderColor: '#e74c3c',
  },
  correctMark: {
    color: '#2ecc71',
    fontSize: '20px',
    fontWeight: 'bold',
  },
  wrongMark: {
    color: '#e74c3c',
    fontSize: '20px',
    fontWeight: 'bold',
  },
  loadingText: {
    textAlign: 'center',
    fontSize: '18px',
    marginTop: '50px',
  },
};

export default OrganizerDashboard;