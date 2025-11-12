const express = require('express');
const router = express.Router();
const { dbHelpers } = require('../database');

// Get all teams for a quiz
router.get('/quiz/:quizId/teams', async (req, res) => {
  const { quizId } = req.params;

  try {
    const teams = await dbHelpers.all(
      'SELECT id, team_name, created_at FROM teams WHERE quiz_id = ? ORDER BY team_name',
      [quizId]
    );

    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to get teams' });
  }
});

// Get all rounds for a quiz
router.get('/quiz/:quizId/rounds', async (req, res) => {
  const { quizId } = req.params;

  try {
    const rounds = await dbHelpers.all(
      `SELECT r.*, 
        (SELECT COUNT(*) FROM questions WHERE round_id = r.id) as question_count
       FROM rounds r 
       WHERE r.quiz_id = ? 
       ORDER BY r.round_number`,
      [quizId]
    );

    res.json(rounds);
  } catch (error) {
    console.error('Error fetching rounds:', error);
    res.status(500).json({ error: 'Failed to get rounds' });
  }
});


// Get leaderboard with scores
router.get('/quiz/:quizId/leaderboard', async (req, res) => {
  const { quizId } = req.params;

  try {
    const leaderboard = await dbHelpers.all(
      `SELECT 
        t.id,
        t.team_name,
        COUNT(CASE WHEN a.is_correct = 1 THEN 1 END) as score,
        COUNT(a.id) as total_answered
       FROM teams t
       LEFT JOIN answers a ON t.id = a.team_id
       WHERE t.quiz_id = ?
       GROUP BY t.id, t.team_name
       ORDER BY score DESC, total_answered DESC`,
      [quizId]
    );

    res.json(leaderboard);
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});


// Reset everything - clear teams, answers, deactivate rounds
router.post('/quiz/:quizId/reset', async (req, res) => {
  const { quizId } = req.params;
  
  try {
    // Delete all answers for this quiz's teams
    await dbHelpers.run(
      `DELETE FROM answers WHERE team_id IN 
       (SELECT id FROM teams WHERE quiz_id = ?)`,
      [quizId]
    );
    
    // Delete all teams
    await dbHelpers.run(
      'DELETE FROM teams WHERE quiz_id = ?',
      [quizId]
    );
    
    // Deactivate all rounds
    await dbHelpers.run(
      'UPDATE rounds SET is_active = 0 WHERE quiz_id = ?',
      [quizId]
    );
    
    console.log(`Quiz ${quizId} reset - teams, answers cleared, rounds deactivated`);
    
    res.json({ 
      message: 'Quiz reset successfully',
      cleared: {
        teams: true,
        answers: true,
        rounds: true
      }
    });
  } catch (error) {
    console.error('Error resetting quiz:', error);
    res.status(500).json({ error: 'Failed to reset quiz' });
  }
});

module.exports = router;