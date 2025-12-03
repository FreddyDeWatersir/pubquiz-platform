const express = require('express');
const router = express.Router();
const { dbHelpers } = require('../database');

// ==========================================
// GET ALL QUESTIONS
// ==========================================
// Purpose: Fetch all questions from database
// Used by: Admin question list page
router.get('/questions', async (req, res) => {
  try {
    // SQL query to get all questions with their round info
    const questions = await dbHelpers.all(
      `SELECT 
        q.*,                          -- All question columns
        r.round_number               -- Round number from rounds table
       FROM questions q
       LEFT JOIN rounds r ON q.round_id = r.id    -- Join to get round info
       ORDER BY r.round_number, q.id              -- Sort by round, then question
      `
    );
    
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

// ==========================================
// CREATE NEW QUESTION
// ==========================================
// Purpose: Add a new question to the database
// Used by: Admin "Add Question" form
router.post('/questions', async (req, res) => {
  // Extract data from request body
  const { 
    round_id,           // Which round this question belongs to
    question_text,      // The question itself
    option_a,           // First option
    option_b,           // Second option
    option_c,           // Third option
    option_d,           // Fourth option
    correct_answer      // Which option is correct (A, B, C, or D)
  } = req.body;

  // Validation: Make sure all fields are provided
  if (!round_id || !question_text || !option_a || !option_b || 
      !option_c || !option_d || !correct_answer) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Validation: Correct answer must be A, B, C, or D
  if (!['A', 'B', 'C', 'D'].includes(correct_answer)) {
    return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
  }

  try {
    // Insert the question into database
    const result = await dbHelpers.run(
      `INSERT INTO questions 
       (round_id, question_text, option_a, option_b, option_c, option_d, correct_answer)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [round_id, question_text, option_a, option_b, option_c, option_d, correct_answer]
    );

    // Return the new question with its ID
    res.status(201).json({
      message: 'Question created successfully',
      questionId: result.id,
      question: {
        id: result.id,
        round_id,
        question_text,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_answer
      }
    });
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

// ==========================================
// UPDATE EXISTING QUESTION
// ==========================================
// Purpose: Edit a question that already exists
// Used by: Admin "Edit Question" form
router.put('/questions/:id', async (req, res) => {
  const { id } = req.params;  // Question ID from URL
  const { 
    round_id,
    question_text,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_answer
  } = req.body;

  // Validation
  if (!round_id || !question_text || !option_a || !option_b || 
      !option_c || !option_d || !correct_answer) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!['A', 'B', 'C', 'D'].includes(correct_answer)) {
    return res.status(400).json({ error: 'Correct answer must be A, B, C, or D' });
  }

  try {
    // Update the question in database
    await dbHelpers.run(
      `UPDATE questions 
       SET round_id = ?,
           question_text = ?,
           option_a = ?,
           option_b = ?,
           option_c = ?,
           option_d = ?,
           correct_answer = ?
       WHERE id = ?`,
      [round_id, question_text, option_a, option_b, option_c, option_d, correct_answer, id]
    );

    res.json({
      message: 'Question updated successfully',
      question: {
        id,
        round_id,
        question_text,
        option_a,
        option_b,
        option_c,
        option_d,
        correct_answer
      }
    });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// ==========================================
// DELETE QUESTION
// ==========================================
// Purpose: Remove a question from database
// Used by: Admin question list "Delete" button
router.delete('/questions/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // First, delete any answers to this question
    // (Otherwise we'd have orphaned answers)
    await dbHelpers.run(
      'DELETE FROM answers WHERE question_id = ?',
      [id]
    );

    // Then delete the question itself
    await dbHelpers.run(
      'DELETE FROM questions WHERE id = ?',
      [id]
    );

    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

// ==========================================
// GET ALL ROUNDS
// ==========================================
// Purpose: List all available rounds
// Used by: Admin page to show round options in dropdown
router.get('/rounds', async (req, res) => {
  try {
    const rounds = await dbHelpers.all(
      `SELECT 
        r.*,
        COUNT(q.id) as question_count
       FROM rounds r
       LEFT JOIN questions q ON r.id = q.round_id
       GROUP BY r.id
       ORDER BY r.round_number`
    );

    res.json(rounds);
  } catch (error) {
    console.error('Error fetching rounds:', error);
    res.status(500).json({ error: 'Failed to fetch rounds' });
  }
});

module.exports = router;