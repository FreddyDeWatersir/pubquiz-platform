const express = require('express');
const router = express.Router();
const { dbHelpers } = require('../database');
const {
  getLeaderboard,
  getRoundHandIns,
  acceptRoundDrafts,
  countRoundDrafts,
} = require('../utils/answers');
const {
  normalizeLinksInput,
  normalizeCountdownInput,
  formatScreenRow,
} = require('../utils/screens');

/**
 * Validate a screen body from the editor. Shared by create and update so the
 * two can't accept different things. Returns { values } or { error }.
 */
function readScreenInput(body) {
  const { title, body: text, links, countdown_seconds } = body || {};
  if (!title || !String(title).trim()) {
    return { error: 'A screen title is required' };
  }
  const linkResult = normalizeLinksInput(links);
  if (linkResult.error) return { error: linkResult.error };
  const countdown = normalizeCountdownInput(countdown_seconds);
  if (countdown.error) return { error: countdown.error };

  return {
    values: {
      title: String(title).trim(),
      body: text ? String(text) : null,
      links_json: linkResult.links.length ? JSON.stringify(linkResult.links) : null,
      countdown_seconds: countdown.seconds,
    },
  };
}

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
//
// The previous version passed every field straight into the query as
// `COALESCE(?, name)`. When the dashboard sent only { name, access_code },
// `status` arrived as `undefined` — and mysql2's execute() rejects undefined
// bind parameters outright ("Bind parameters must not contain undefined"),
// so every rename in production came back as "Failed to update the quiz".
// SQLite tolerated it, which is why it only ever broke on the VPS.
//
// Building the SET clause from the keys actually present avoids the whole
// class of problem: a field that wasn't sent is simply not part of the query.
router.put('/quizzes/:quizId', async (req, res) => {
  const { quizId } = req.params;
  const { name, access_code, status, language } = req.body;

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

    const updates = [];
    const params = [];

    if (name !== undefined && name !== null && String(name).trim()) {
      updates.push('name = ?');
      params.push(String(name).trim());
    }
    if (access_code !== undefined && access_code !== null && String(access_code).trim()) {
      updates.push('access_code = ?');
      params.push(String(access_code).trim().toUpperCase());
    }
    if (status !== undefined && status !== null) {
      updates.push('status = ?');
      params.push(status);
    }
    if (language !== undefined && language !== null) {
      updates.push('language = ?');
      params.push(language === 'nl' ? 'nl' : 'en');
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    params.push(quizId);
    await dbHelpers.run(
      `UPDATE quizzes SET ${updates.join(', ')} WHERE id = ?`,
      params
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

/**
 * "Music" -> "Music copy" -> "Music copy 2" -> "Music copy 3"
 * Returns null for an unnamed round so it stays unnamed.
 */
function buildCopyName(name) {
  if (!name || !String(name).trim()) return null;
  const base = String(name).trim();

  const repeat = base.match(/^(.*\bcopy)(?:\s+(\d+))?$/i);
  if (repeat) {
    const n = repeat[2] ? parseInt(repeat[2], 10) : 1;
    return `${repeat[1]} ${n + 1}`;
  }
  return `${base} copy`;
}

// Copy a round and all its questions into another quiz
router.post('/rounds/:roundId/copy', async (req, res) => {
  const { roundId } = req.params;
  const { targetQuizId } = req.body;

  if (!targetQuizId) {
    return res.status(400).json({ error: 'targetQuizId is required' });
  }

  try {
    const sourceRound = await dbHelpers.get('SELECT * FROM rounds WHERE id = ?', [roundId]);
    if (!sourceRound) return res.status(404).json({ error: 'Round not found' });

    const targetQuiz = await dbHelpers.get('SELECT * FROM quizzes WHERE id = ?', [targetQuizId]);
    if (!targetQuiz) return res.status(404).json({ error: 'Target quiz not found' });

    const questions = await dbHelpers.all(
      'SELECT * FROM questions WHERE round_id = ? ORDER BY sort_order, id',
      [roundId]
    );

    // New round always lands at the end of the target quiz, inactive.
    const last = await dbHelpers.get(
      'SELECT MAX(round_number) as max_round FROM rounds WHERE quiz_id = ?',
      [targetQuizId]
    );
    const newRoundNumber = (last?.max_round || 0) + 1;

    // Carry the round's name across. A copy of "Music" becomes "Music copy",
    // and copying that again gives "Music copy 2" rather than "Music copy copy",
    // so repeat copies stay readable. An unnamed round stays unnamed.
    const copiedName = buildCopyName(sourceRound.name);

    const inserted = await dbHelpers.run(
      'INSERT INTO rounds (quiz_id, round_number, name, is_active, is_closed) VALUES (?, ?, ?, 0, 0)',
      [targetQuizId, newRoundNumber, copiedName]
    );
    const newRoundId = inserted.id;

    // sort_order, title, image_size and show_option_letters were being dropped
    // here, so a copied round lost its question order and per-question display
    // settings along with its name.
    for (const [index, q] of questions.entries()) {
      await dbHelpers.run(
        `INSERT INTO questions
         (round_id, question_text, question_type, image_url, image_size, title, option_a, option_b, option_c, option_d, options_json, answer_mode, correct_answers_json, correct_answer, sort_order, show_option_letters)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newRoundId, q.question_text, q.question_type, q.image_url,
          q.image_size || 'medium', q.title || null,
          q.option_a, q.option_b, q.option_c, q.option_d,
          q.options_json, q.answer_mode, q.correct_answers_json, q.correct_answer,
          q.sort_order || index + 1,
          q.show_option_letters === 0 ? 0 : 1,
        ]
      );
    }

    res.json({
      success: true,
      targetQuizName: targetQuiz.name,
      questionsCopied: questions.length,
      round: {
        id: newRoundId,
        quiz_id: parseInt(targetQuizId),
        round_number: newRoundNumber,
        name: copiedName,
        is_active: 0,
        is_closed: 0
      }
    });
  } catch (error) {
    console.error('Error copying round:', error);
    res.status(500).json({ error: 'Failed to copy round' });
  }
});

// ==========================================
// TEAM-FACING SCREENS (opening / break / end / messages)
// ==========================================
//
// A screen is just a title and a body that the organizer can push onto every
// team's device instead of the default "waiting for the quizmaster" room.
// Saving them per quiz means the opening and closing text doesn't have to be
// retyped each night; a one-off message is simply a screen you show once.

// List a quiz's screens
router.get('/quiz/:quizId/screens', async (req, res) => {
  const { quizId } = req.params;

  try {
    const screens = await dbHelpers.all(
      'SELECT * FROM quiz_screens WHERE quiz_id = ? ORDER BY sort_order, id',
      [quizId]
    );
    res.json(screens.map(formatScreenRow));
  } catch (error) {
    console.error('Error fetching screens:', error);
    res.status(500).json({ error: 'Failed to fetch screens' });
  }
});

// Create a screen
router.post('/quiz/:quizId/screens', async (req, res) => {
  const { quizId } = req.params;
  const input = readScreenInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  const v = input.values;

  try {
    const last = await dbHelpers.get(
      'SELECT MAX(sort_order) as max_order FROM quiz_screens WHERE quiz_id = ?',
      [quizId]
    );
    const result = await dbHelpers.run(
      `INSERT INTO quiz_screens (quiz_id, title, body, links_json, countdown_seconds, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [quizId, v.title, v.body, v.links_json, v.countdown_seconds, (Number(last?.max_order) || 0) + 1]
    );

    res.status(201).json({
      message: 'Screen created',
      screen: formatScreenRow({ id: result.id, quiz_id: parseInt(quizId), ...v }),
    });
  } catch (error) {
    console.error('Error creating screen:', error);
    res.status(500).json({ error: 'Failed to create screen' });
  }
});

// Update a screen
router.put('/screens/:screenId', async (req, res) => {
  const { screenId } = req.params;
  const input = readScreenInput(req.body);
  if (input.error) return res.status(400).json({ error: input.error });
  const v = input.values;

  try {
    await dbHelpers.run(
      'UPDATE quiz_screens SET title = ?, body = ?, links_json = ?, countdown_seconds = ? WHERE id = ?',
      [v.title, v.body, v.links_json, v.countdown_seconds, screenId]
    );
    res.json({ message: 'Screen updated' });
  } catch (error) {
    console.error('Error updating screen:', error);
    res.status(500).json({ error: 'Failed to update screen' });
  }
});

// Delete a screen
router.delete('/screens/:screenId', async (req, res) => {
  const { screenId } = req.params;

  try {
    await dbHelpers.run('DELETE FROM quiz_screens WHERE id = ?', [screenId]);
    res.json({ message: 'Screen deleted' });
  } catch (error) {
    console.error('Error deleting screen:', error);
    res.status(500).json({ error: 'Failed to delete screen' });
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

// Rename a round
router.put('/rounds/:roundId', async (req, res) => {
  const { roundId } = req.params;
  const { name } = req.body;

  try {
    await dbHelpers.run(
      'UPDATE rounds SET name = ? WHERE id = ?',
      [name && name.trim() ? name.trim() : null, roundId]
    );
    res.json({ message: 'Round updated successfully' });
  } catch (error) {
    console.error('Error updating round:', error);
    res.status(500).json({ error: 'Failed to update round' });
  }
});

// Reorder rounds within a quiz
router.put('/quiz/:quizId/round-order', async (req, res) => {
  const { quizId } = req.params;
  const { roundIds } = req.body;

  if (!Array.isArray(roundIds) || roundIds.length === 0) {
    return res.status(400).json({ error: 'roundIds array is required' });
  }

  try {
    for (let i = 0; i < roundIds.length; i++) {
      await dbHelpers.run(
        'UPDATE rounds SET round_number = ? WHERE id = ? AND quiz_id = ?',
        [i + 1, roundIds[i], quizId]
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering rounds:', error);
    res.status(500).json({ error: 'Failed to reorder rounds' });
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
        a.selected_answers_json,
        a.answer_text,
        a.is_correct,
        a.score,
        a.answer_status,
        a.question_id,
        t.team_name,
        t.id as team_id,
        q.question_text,
        q.question_type,
        q.answer_mode,
        q.correct_answer,
        q.correct_answers_json
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
      'UPDATE answers SET is_correct = ?, score = ? WHERE id = ?',
      [is_correct ? 1 : 0, is_correct ? 1 : 0, answerId]
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

// Rename a team. Teams can't rename themselves (and with the Leave Team button
// gone they can't re-register either), so a typo at the door is the
// organizer's to fix.
router.put('/teams/:teamId', async (req, res) => {
  const { teamId } = req.params;
  const { team_name } = req.body || {};

  if (!team_name || !String(team_name).trim()) {
    return res.status(400).json({ error: 'A team name is required' });
  }
  const name = String(team_name).trim();

  try {
    const team = await dbHelpers.get('SELECT id, quiz_id FROM teams WHERE id = ?', [teamId]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    // Same uniqueness rule the join flow enforces, scoped to the quiz.
    const clash = await dbHelpers.get(
      'SELECT id FROM teams WHERE quiz_id = ? AND team_name = ? AND id <> ?',
      [team.quiz_id, name, teamId]
    );
    if (clash) return res.status(409).json({ error: 'Another team already has that name' });

    await dbHelpers.run('UPDATE teams SET team_name = ? WHERE id = ?', [name, teamId]);
    res.json({ message: 'Team renamed', team: { id: Number(teamId), team_name: name } });
  } catch (error) {
    console.error('Error renaming team:', error);
    res.status(500).json({ error: 'Failed to rename team' });
  }
});

// Remove a team and everything it answered. For ghost teams: a table that
// registered twice leaves one behind on 0 points, permanently showing as
// "not handed in".
router.delete('/teams/:teamId', async (req, res) => {
  const { teamId } = req.params;

  try {
    const team = await dbHelpers.get('SELECT id FROM teams WHERE id = ?', [teamId]);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    await dbHelpers.run('DELETE FROM answers WHERE team_id = ?', [teamId]);
    await dbHelpers.run('DELETE FROM teams WHERE id = ?', [teamId]);
    res.json({ message: 'Team removed' });
  } catch (error) {
    console.error('Error removing team:', error);
    res.status(500).json({ error: 'Failed to remove team' });
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

// Close a round (prevent further submissions)
router.post('/rounds/:roundId/close', async (req, res) => {
  const { roundId } = req.params;

  try {
    await dbHelpers.run(
      'UPDATE rounds SET is_closed = 1 WHERE id = ?',
      [roundId]
    );
    // Same rule as the socket close: unsubmitted answers are left as drafts
    // and reported, never counted automatically.
    const pendingDrafts = await countRoundDrafts(dbHelpers, roundId);

    res.json({ message: 'Round closed successfully', pendingDrafts });
  } catch (error) {
    console.error('Error closing round:', error);
    res.status(500).json({ error: 'Failed to close round' });
  }
});

// Reopen a closed round
router.post('/rounds/:roundId/reopen', async (req, res) => {
  const { roundId } = req.params;

  try {
    await dbHelpers.run(
      'UPDATE rounds SET is_closed = 0 WHERE id = ?',
      [roundId]
    );

    res.json({ message: 'Round reopened successfully' });
  } catch (error) {
    console.error('Error reopening round:', error);
    res.status(500).json({ error: 'Failed to reopen round' });
  }
});


// Get leaderboard with scores
router.get('/quiz/:quizId/leaderboard', async (req, res) => {
  const { quizId } = req.params;

  try {
    // Shared with the team-facing reveal so the two can never disagree, and so
    // drafts are excluded in exactly one place.
    res.json(await getLeaderboard(dbHelpers, quizId));
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});


// Which teams have handed in a round — and which haven't.
// status per team: 'submitted' | 'accepted' | 'drafting' | 'none'
router.get('/quiz/:quizId/round/:roundId/hand-ins', async (req, res) => {
  const { quizId, roundId } = req.params;

  try {
    const round = await dbHelpers.get(
      'SELECT id FROM rounds WHERE id = ? AND quiz_id = ?',
      [roundId, quizId]
    );
    if (!round) return res.status(404).json({ error: 'Round not found' });

    res.json(await getRoundHandIns(dbHelpers, quizId, roundId));
  } catch (error) {
    console.error('Error getting hand-ins:', error);
    res.status(500).json({ error: 'Failed to get hand-ins' });
  }
});

// Count the answers of teams that never pressed Submit in this round.
// Deliberately a separate, explicit action: closing a round does not do it.
router.post('/rounds/:roundId/accept-drafts', async (req, res) => {
  const { roundId } = req.params;

  try {
    const round = await dbHelpers.get('SELECT id FROM rounds WHERE id = ?', [roundId]);
    if (!round) return res.status(404).json({ error: 'Round not found' });

    const accepted = await acceptRoundDrafts(dbHelpers, roundId);
    res.json({ message: 'Unsubmitted answers accepted', accepted });
  } catch (error) {
    console.error('Error accepting drafts:', error);
    res.status(500).json({ error: 'Failed to accept unsubmitted answers' });
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