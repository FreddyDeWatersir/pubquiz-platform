const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { dbHelpers } = require('../database');

// Verify quiz access code (step 1: team enters code)
router.post('/verify-code', async (req, res) => {
  const { accessCode } = req.body;

  if (!accessCode) {
    return res.status(400).json({ error: 'Access code is required' });
  }

  try {
    const quiz = await dbHelpers.get(
      'SELECT id, name FROM quizzes WHERE access_code = ? AND status != ?',
      [accessCode.toUpperCase(), 'archived']
    );

    if (!quiz) {
      return res.status(404).json({ error: 'Invalid access code' });
    }

    res.json({
      quizId: quiz.id,
      quizName: quiz.name
    });
  } catch (error) {
    console.error('Error verifying code:', error);
    res.status(500).json({ error: 'Failed to verify access code' });
  }
});

// Register a new team (step 2: team enters name)
router.post('/register', async (req, res) => {
  const { teamName, quizId } = req.body;

  // Validation
  if (!teamName || !quizId) {
    return res.status(400).json({ error: 'Team name and quiz ID are required' });
  }

  try {
    // Verify quiz exists
    const quiz = await dbHelpers.get('SELECT id, name FROM quizzes WHERE id = ?', [quizId]);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

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
      quizId: quiz.id,
      quizName: quiz.name,
      sessionToken,
      message: 'Team registered successfully'
    });
  } catch (error) {
    console.error('Error registering team:', error);
    res.status(500).json({ error: 'Failed to register team' });
  }
});

module.exports = router;