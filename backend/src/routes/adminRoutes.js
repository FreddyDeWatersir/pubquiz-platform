const express = require('express');
const router = express.Router();
const { dbHelpers } = require('../database');

// ==========================================
// GET ALL QUESTIONS (optionally filtered by quiz)
// ==========================================
router.get('/questions', async (req, res) => {
  const { quiz_id } = req.query;

  try {
    let sql = `
      SELECT 
        q.*,
        r.round_number,
        r.quiz_id
       FROM questions q
       LEFT JOIN rounds r ON q.round_id = r.id
    `;
    const params = [];

    if (quiz_id) {
      sql += ' WHERE r.quiz_id = ?';
      params.push(quiz_id);
    }

    sql += ' ORDER BY r.quiz_id, r.round_number, q.id';

    const questions = await dbHelpers.all(sql, params);
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// ==========================================
// CREATE NEW QUESTION
// ==========================================
router.post('/questions', async (req, res) => {
  const { 
    round_id,
    question_text,
    question_type,
    image_url,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_answer
  } = req.body;

  const type = question_type || 'multiple_choice';

  if (!round_id || !question_text || !correct_answer) {
    return res.status(400).json({ error: 'Round, question text, and correct answer are required' });
  }

  // Multiple choice requires all options
  if (type === 'multiple_choice') {
    if (!option_a || !option_b || !option_c || !option_d) {
      return res.status(400).json({ error: 'All four options are required for multiple choice questions' });
    }
    if (!['A', 'B', 'C', 'D'].includes(correct_answer)) {
      return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
    }
  }

  try {
    const result = await dbHelpers.run(
      `INSERT INTO questions 
       (round_id, question_text, question_type, image_url, option_a, option_b, option_c, option_d, correct_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [round_id, question_text, type, image_url || null, 
       option_a || null, option_b || null, option_c || null, option_d || null, correct_answer]
    );

    res.status(201).json({
      message: 'Question created successfully',
      questionId: result.id
    });
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// ==========================================
// UPDATE EXISTING QUESTION
// ==========================================
router.put('/questions/:id', async (req, res) => {
  const { id } = req.params;
  const { 
    round_id,
    question_text,
    question_type,
    image_url,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_answer
  } = req.body;

  const type = question_type || 'multiple_choice';

  if (!round_id || !question_text || !correct_answer) {
    return res.status(400).json({ error: 'Round, question text, and correct answer are required' });
  }

  if (type === 'multiple_choice') {
    if (!option_a || !option_b || !option_c || !option_d) {
      return res.status(400).json({ error: 'All four options are required for multiple choice questions' });
    }
    if (!['A', 'B', 'C', 'D'].includes(correct_answer)) {
      return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
    }
  }

  try {
    await dbHelpers.run(
      `UPDATE questions 
       SET round_id = ?, question_text = ?, question_type = ?, image_url = ?,
           option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_answer = ?
       WHERE id = ?`,
      [round_id, question_text, type, image_url || null,
       option_a || null, option_b || null, option_c || null, option_d || null, correct_answer, id]
    );

    res.json({ message: 'Question updated successfully' });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// ==========================================
// DELETE QUESTION
// ==========================================
router.delete('/questions/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await dbHelpers.run('DELETE FROM answers WHERE question_id = ?', [id]);
    await dbHelpers.run('DELETE FROM questions WHERE id = ?', [id]);
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// ==========================================
// GET ROUNDS (optionally filtered by quiz)
// ==========================================
router.get('/rounds', async (req, res) => {
  const { quiz_id } = req.query;

  try {
    let sql = `
      SELECT 
        r.*,
        COUNT(q.id) as question_count
       FROM rounds r
       LEFT JOIN questions q ON r.id = q.round_id
    `;
    const params = [];

    if (quiz_id) {
      sql += ' WHERE r.quiz_id = ?';
      params.push(quiz_id);
    }

    sql += ' GROUP BY r.id ORDER BY r.round_number';

    const rounds = await dbHelpers.all(sql, params);
    res.json(rounds);
  } catch (error) {
    console.error('Error fetching rounds:', error);
    res.status(500).json({ error: 'Failed to fetch rounds' });
  }
});

module.exports = router;