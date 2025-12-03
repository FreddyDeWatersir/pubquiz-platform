import React, { useState } from 'react';
import { API_URL } from './config';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import TeamJoin from './components/TeamJoin';
import OrganizerDashboard from './components/OrganizerDashboard';
import QuestionDisplay from './components/QuestionDisplay';
import io from 'socket.io-client';
import './App.css';
import AdminLogin from './components/AdminLogin';
import QuestionManager from './components/QuestionManager';

function App() {
  return (
    <Router>
      <Routes>
        {/* Team page - the default homepage */}
        <Route path="/" element={<TeamPage />} />
        
        {/* Organizer page */}
        <Route path="/organizer" element={<OrganizerDashboard />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/questions" element={<QuestionManager />} />
      </Routes>
    </Router>
  );
}


function TeamPage() {
  const [sessionToken, setSessionToken] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [questions, setQuestions] = useState(null);
  const [socket, setSocket] = useState(null);

  const handleJoinSuccess = (token, name) => {
    setSessionToken(token);
    setTeamName(name);
    console.log('Team joined successfully!', { token, name });
    
    // Connect to WebSocket
    const newSocket = io(API_URL);
    setSocket(newSocket);

    // Join the quiz room with session token
    newSocket.emit('team:join', { sessionToken: token });

    // Listen for team joined confirmation
    newSocket.on('team:joined', (data) => {
      console.log('WebSocket connected:', data);
    });

    // Listen for round started event
    newSocket.on('round:started', (data) => {
      console.log('Round started!', data);
      setQuestions(data.questions);
    });

    // Listen for submission confirmation
    newSocket.on('team:submitted', (data) => {
      console.log('Answers submitted successfully!', data);
      alert('Answers submitted successfully!');
      setQuestions(null); // Go back to waiting
    });

    // Listen for errors
    newSocket.on('error', (data) => {
      console.error('WebSocket error:', data);
      alert(data.message);
    });

    // Cleanup on unmount
    return () => {
      newSocket.disconnect();
    };
  };

  const handleSubmitAnswers = (answers) => {
    console.log('Submitting answers:', answers);
    if (socket) {
      socket.emit('team:submit', { answers });
    }
  };

  // Show join form if not registered
  if (!sessionToken) {
    return <TeamJoin onJoinSuccess={handleJoinSuccess} />;
  }

  // Show questions if available
  if (questions) {
    return (
      <QuestionDisplay 
        questions={questions}
        onSubmit={handleSubmitAnswers}
        teamName={teamName}
      />
    );
  }

  // Show waiting screen
  return (
    <div className="App">
      <div style={styles.waitingRoom}>
        <h2 style={styles.welcomeText}>Welcome, {teamName}! 🎉</h2>
        <p style={styles.waitingText}>Waiting for organizer to start the quiz...</p>
        <div style={styles.spinner}></div>
      </div>
    </div>
  );
}

const styles = {
  waitingRoom: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#1a1a2e',
    color: '#fff',
  },
  welcomeText: {
    fontSize: '28px',
    marginBottom: '20px',
  },
  waitingText: {
    fontSize: '18px',
    color: '#a0a0a0',
    marginBottom: '30px',
  },
  spinner: {
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #0f3460',
    borderRadius: '50%',
    width: '50px',
    height: '50px',
    animation: 'spin 1s linear infinite',
  },
};

export default App;