const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { dbHelpers } = require('./database');
const teamRoutes = require('./routes/teamRoutes'); 
const organizerRoutes = require('./routes/organizerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { setupSocketHandlers } = require('./socket/socketHandlers');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3001",
  credentials: true
}));
app.use(express.json());

// Serve uploaded images as static files
app.use('/uploads', express.static(uploadsDir));

// Image upload endpoint
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided' });
  }
  
  // Build the full URL for accessing the image
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
  
  res.json({ 
    imageUrl,
    filename: req.file.filename 
  });
});

app.use('/api/teams', teamRoutes);
app.use('/api/organizer', organizerRoutes);
app.use('/api/admin', adminRoutes);
// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PubQuiz server is running' });
});

// Initialize database with quiz questions (one-time use)
app.get('/api/init-quiz', async (req, res) => {
  try {
    // Import the init function
    const { dbHelpers } = require('./database');
    
    // Check if quiz already exists
    const existing = await dbHelpers.get('SELECT * FROM quizzes WHERE id = 1');
    if (existing) {
      return res.json({ message: 'Quiz already initialized', quizId: existing.id });
    }
    
    // Run the initialization (simplified version)
    const { exec } = require('child_process');
    const path = require('path');
    
    exec('node src/initDatabase.js', { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
      if (error) {
        console.error('Init error:', error);
        return res.status(500).json({ error: error.message, stderr });
      }
      console.log('Init output:', stdout);
      res.json({ 
        message: 'Database initialized successfully', 
        output: stdout 
      });
    });
    
  } catch (error) {
    console.error('Error in init-quiz:', error);
    res.status(500).json({ error: error.message });
  }
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