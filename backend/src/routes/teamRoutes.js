const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { dbHelpers } = require('../database');

// Register a new team
router.post('/register', async (req, res) => {
  const { teamName, quizId } = req.body;

  // Validation
  if (!teamName || !quizId) {
    return res.status(400).json({ error: 'Team name and quiz ID are required' });
  }

  try {
    // Check if team name already exists in this quiz
    const existingTeam = await dbHelpers.get(
      'SELECT id FROM teams WHERE team_name = ? AND quiz_id = ?',
      [teamName, quizId]
    );

    if (existingTeam) {
      return res.status(409).json({ error: 'Team name already taken' });
    }

    // Create new team with unique session token
    const sessionToken = uuidv4();
    const result = await dbHelpers.run(
      'INSERT INTO teams (quiz_id, team_name, session_token) VALUES (?, ?, ?)',
      [quizId, teamName, sessionToken]
    );

    res.status(201).json({
      teamId: result.id,
      teamName,
      sessionToken,
      message: 'Team registered successfully'
    });
  } catch (error) {
    console.error('Error registering team:', error);
    res.status(500).json({ error: 'Failed to register team' });
  }
});

module.exports = router;