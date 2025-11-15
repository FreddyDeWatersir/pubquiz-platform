const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { dbHelpers } = require('./database');
const teamRoutes = require('./routes/teamRoutes'); 
const organizerRoutes = require('./routes/organizerRoutes');
const { setupSocketHandlers } = require('./socket/socketHandlers');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3001",
  credentials: true
}));
app.use(express.json());
app.use('/api/teams', teamRoutes);
app.use('/api/organizer', organizerRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PubQuiz server is running' });
});

// Test endpoint to get active quiz
app.get('/api/quiz/active', async (req, res) => {
  try {
    const quiz = await dbHelpers.get(
      'SELECT * FROM quizzes WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
    );
    
    if (!quiz) {
      return res.status(404).json({ error: 'No active quiz found' });
    }
    
    res.json(quiz);
  } catch (error) {
    console.error('Error getting active quiz:', error);
    res.status(500).json({ error: 'Failed to get active quiz' });
  }
});

setupSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ WebSocket server ready`);
});