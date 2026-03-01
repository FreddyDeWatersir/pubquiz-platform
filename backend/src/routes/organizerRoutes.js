const express = require('express');
const router = express.Router();
const { dbHelpers } = require('../database');

// ==========================================
// QUIZ MANAGEMENT
// ==========================================

// Get all quizzes
router.get('/quizzes', async (req, res) => {
  try {
    const quizzes = await dbHelpers.all(
      `SELECT q.*, 
        (SELECT COUNT(*) FROM rounds WHERE quiz_id = q.id) as round_count,
        (SELECT COUNT(*) FROM teams WHERE quiz_id = q.id) as team_count
       FROM quizzes q 
       ORDER BY q.created_at DESC`
    );
    res.json(quizzes);
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    res.status(500).json({ error: 'Failed to fetch quizzes' });
  }
});

// Create a new quiz
router.post('/quizzes', async (req, res) => {
  const { name, access_code } = req.body;

  if (!name || !access_code) {
    return res.status(400).json({ error: 'Name and access code are required' });
  }

  // Check if access code is already in use
  const existing = await dbHelpers.get(
    'SELECT id FROM quizzes WHERE access_code = ?',
    [access_code.toUpperCase()]
  );
  if (existing) {
    return res.status(409).json({ error: 'Access code already in use' });
  }

  try {
    const result = await dbHelpers.run(
      'INSERT INTO quizzes (name, access_code, status) VALUES (?, ?, ?)',
      [name, access_code.toUpperCase(), 'draft']
    );

    res.status(201).json({
      message: 'Quiz created successfully',
      quiz: {
        id: result.id,
        name,
        access_code: access_code.toUpperCase(),
        status: 'draft'
      }
    });
  } catch (error) {
    console.error('Error creating quiz:', error);
    res.status(500).json({ error: 'Failed to create quiz' });
  }
});

// Update a quiz
router.put('/quizzes/:quizId', async (req, res) => {
  const { quizId } = req.params;
  const { name, access_code, status } = req.body;

  try {
    // If changing access code, check it's not taken by another quiz
    if (access_code) {
      const existing = await dbHelpers.get(
        'SELECT id FROM quizzes WHERE access_code = ? AND id != ?',
        [access_code.toUpperCase(), quizId]
      );
      if (existing) {
        return res.status(409).json({ error: 'Access code already in use' });
      }
    }

    await dbHelpers.run(
      `UPDATE quizzes SET 
        name = COALESCE(?, name),
        access_code = COALESCE(?, access_code),
        status = COALESCE(?, status)
       WHERE id = ?`,
      [name, access_code ? access_code.toUpperCase() : null, status, quizId]
    );

    res.json({ message: 'Quiz updated successfully' });
  } catch (error) {
    console.error('Error updating quiz:', error);
    res.status(500).json({ error: 'Failed to update quiz' });
  }
});

// Delete a quiz and all its data
router.delete('/quizzes/:quizId', async (req, res) => {
  const { quizId } = req.params;

  try {
    // Delete answers for teams in this quiz
    await dbHelpers.run(
      `DELETE FROM answers WHERE team_id IN 
       (SELECT id FROM teams WHERE quiz_id = ?)`,
      [quizId]
    );
    // Delete teams
    await dbHelpers.run('DELETE FROM teams WHERE quiz_id = ?', [quizId]);
    // Delete questions for rounds in this quiz
    await dbHelpers.run(
      `DELETE FROM questions WHERE round_id IN 
       (SELECT id FROM rounds WHERE quiz_id = ?)`,
      [quizId]
    );
    // Delete rounds
    await dbHelpers.run('DELETE FROM rounds WHERE quiz_id = ?', [quizId]);
    // Delete quiz
    await dbHelpers.run('DELETE FROM quizzes WHERE id = ?', [quizId]);

    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error('Error deleting quiz:', error);
    res.status(500).json({ error: 'Failed to delete quiz' });
  }
});

// ==========================================
// ROUND MANAGEMENT
// ==========================================

// Create a new round for a quiz
router.post('/quiz/:quizId/rounds', async (req, res) => {
  const { quizId } = req.params;
  const { round_number } = req.body;

  try {
    // Auto-determine round number if not provided
    let roundNum = round_number;
    if (!roundNum) {
      const lastRound = await dbHelpers.get(
        'SELECT MAX(round_number) as max_round FROM rounds WHERE quiz_id = ?',
        [quizId]
      );
      roundNum = (lastRound?.max_round || 0) + 1;
    }

    const result = await dbHelpers.run(
      'INSERT INTO rounds (quiz_id, round_number, is_active) VALUES (?, ?, 0)',
      [quizId, roundNum]
    );

    res.status(201).json({
      message: 'Round created',
      round: { id: result.id, quiz_id: parseInt(quizId), round_number: roundNum, is_active: 0 }
    });
  } catch (error) {
    console.error('Error creating round:', error);
    res.status(500).json({ error: 'Failed to create round' });
  }
});

// Delete a round
router.delete('/rounds/:roundId', async (req, res) => {
  const { roundId } = req.params;

  try {
    // Delete answers for questions in this round
    await dbHelpers.run(
      `DELETE FROM answers WHERE question_id IN 
       (SELECT id FROM questions WHERE round_id = ?)`,
      [roundId]
    );
    // Delete questions
    await dbHelpers.run('DELETE FROM questions WHERE round_id = ?', [roundId]);
    // Delete round
    await dbHelpers.run('DELETE FROM rounds WHERE id = ?', [roundId]);

    res.json({ message: 'Round deleted successfully' });
  } catch (error) {
    console.error('Error deleting round:', error);
    res.status(500).json({ error: 'Failed to delete round' });
  }
});

// ==========================================
// ANSWER REVIEW (for open questions)
// ==========================================

// Get all answers for a round (for organizer grading)
router.get('/quiz/:quizId/round/:roundId/answers', async (req, res) => {
  const { quizId, roundId } = req.params;

  try {
    const answers = await dbHelpers.all(
      `SELECT 
        a.id as answer_id,
        a.selected_answer,
        a.answer_text,
        a.is_correct,
        a.question_id,
        t.team_name,
        t.id as team_id,
        q.question_text,
        q.question_type,
        q.correct_answer
       FROM answers a
       JOIN teams t ON a.team_id = t.id
       JOIN questions q ON a.question_id = q.id
       JOIN rounds r ON q.round_id = r.id
       WHERE t.quiz_id = ? AND q.round_id = ?
       ORDER BY q.id, t.team_name`,
      [quizId, roundId]
    );

    res.json(answers);
  } catch (error) {
    console.error('Error fetching answers:', error);
    res.status(500).json({ error: 'Failed to fetch answers' });
  }
});

// Grade an open question answer
router.put('/answers/:answerId/grade', async (req, res) => {
  const { answerId } = req.params;
  const { is_correct } = req.body;

  if (is_correct === undefined || is_correct === null) {
    return res.status(400).json({ error: 'is_correct is required (0 or 1)' });
  }

  try {
    await dbHelpers.run(
      'UPDATE answers SET is_correct = ? WHERE id = ?',
      [is_correct ? 1 : 0, answerId]
    );

    res.json({ message: 'Answer graded successfully' });
  } catch (error) {
    console.error('Error grading answer:', error);
    res.status(500).json({ error: 'Failed to grade answer' });
  }
});

// ==========================================
// EXISTING ROUTES (updated)
// ==========================================

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