import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import io from 'socket.io-client';

function OrganizerDashboard() {
  const [teams, setTeams] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const quizId = 1; // Hardcoded for now

  // Connect to WebSocket and fetch data when component loads
  useEffect(() => {
    // Connect to WebSocket
    const newSocket = io(API_URL);
    setSocket(newSocket);

    // Join as organizer
    newSocket.emit('organizer:join', { quizId });

    // Listen for confirmation
    newSocket.on('organizer:joined', (data) => {
      console.log('Organizer connected:', data);
    });

    // Listen for team answers
    newSocket.on('team:answered', (data) => {
      console.log('Team answered:', data);
      fetchLeaderboard();
      // Optionally refresh team list or show notification
    });

    // Listen for round activation confirmation
    newSocket.on('organizer:roundActivated', (data) => {
      console.log('Round activated:', data);
      alert('Round activated successfully! All teams received questions.');
      fetchRounds(); // Refresh to show updated active status
    });

    // Fetch initial data
    fetchTeams();
    fetchRounds();
    fetchLeaderboard();

    // Cleanup on unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

  const fetchTeams = async () => {
    try {
      const response = await fetch(`${API_URL}/api/organizer/quiz/${quizId}/teams`);
      const data = await response.json();
      setTeams(data);
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };

  const fetchRounds = async () => {
    try {
      const response = await fetch(`${API_URL}/api/organizer/quiz/${quizId}/rounds`);
      const data = await response.json();
      setRounds(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching rounds:', error);
      setLoading(false);
    }
  };

  const fetchLeaderboard = async () => {
  try {
    const response = await fetch(`${API_URL}/api/organizer/quiz/${quizId}/leaderboard`);
    const data = await response.json();
    setLeaderboard(data);
   } catch (error) {
    console.error('Error fetching leaderboard:', error);
   }
  };


  const activateRound = async (roundId) => {
    if (!socket) {
      alert('WebSocket not connected!');
      return;
    }

    // Send activation via WebSocket
    socket.emit('organizer:activateRound', { roundId });
    console.log('Activating round:', roundId);
  };


  const resetQuiz = async () => {
  const confirmed = window.confirm(
    '⚠️ This will DELETE all teams, answers, and reset rounds. Are you sure?'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`${API_URL}/api/organizer/quiz/${quizId}/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      alert('✅ Quiz reset successfully!');
      // Refresh data
      fetchTeams();
      fetchRounds();
    } else {
      alert('Failed to reset quiz: ' + data.error);
    }
  } catch (error) {
    console.error('Error resetting quiz:', error);
    alert('Failed to reset quiz');
  }
};


  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.loadingText}>Loading...</p>
      </div>
    );
  }

return (
  <div style={styles.container}>
    <div style={styles.header}>
      <h1 style={styles.title}>🎮 Organizer Dashboard</h1>
      <button onClick={resetQuiz} style={styles.resetButton}>
       🔄 Reset Everything
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
        <h2 style={styles.sectionTitle}>📋 Rounds</h2>
        <div style={styles.roundsContainer}>
          {rounds.map((round) => (
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
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard Section - ADD THIS WHOLE SECTION */}
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
    textAlign: 'center',
    marginBottom: '40px',
  },
  title: {
    fontSize: '36px',
    marginBottom: '10px',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  section: {
    marginBottom: '40px',
  },
  sectionTitle: {
    fontSize: '24px',
    marginBottom: '20px',
    borderBottom: '2px solid #0f3460',
    paddingBottom: '10px',
  },
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
  activeButton: {
    backgroundColor: '#555',
    cursor: 'not-allowed',
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
  marginTop: '15px',
  },
  loadingText: {
    textAlign: 'center',
    fontSize: '18px',
    marginTop: '50px',
  },
};


export default OrganizerDashboard;