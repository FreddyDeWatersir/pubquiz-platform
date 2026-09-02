const { verifyToken } = require('../auth');
const { dbHelpers } = require('../database');
const {
  formatQuestionsForClient,
  parseCorrectAnswersFromRow,
  scoreSelectedAnswers,
} = require('../utils/questionOptions');

// What each quiz is currently showing its teams, when it isn't a round.
// Kept in memory (not the database) because it is per-evening ephemeral state
// and PM2 restarts mid-quiz are already disruptive for other reasons. Its job
// is to make a team that reloads, or joins late, land on the same screen as
// everyone else instead of dropping back to "waiting for the quizmaster".
//   key:   String(quizId)
//   value: { type: 'leaderboard', leaderboard, mode } | { type: 'screen', screen }
const displayState = new Map();

const TEAM_QUESTION_COLUMNS = `id, question_text, question_type, image_url,
        option_a, option_b, option_c, option_d, options_json, answer_mode,
        image_size, show_option_letters`;

async function loadRoundQuestions(dbHelpers, roundId) {
  return dbHelpers.all(
    `SELECT ${TEAM_QUESTION_COLUMNS}
     FROM questions WHERE round_id = ? ORDER BY sort_order, id`,
    [roundId]
  );
}

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Team joins with their session token
    socket.on('team:join', async (data) => {
      const { sessionToken } = data;
      
      try {
        const team = await dbHelpers.get(
          'SELECT * FROM teams WHERE session_token = ?',
          [sessionToken]
        );

        if (team) {
          socket.join(`quiz-${team.quiz_id}`);
          socket.teamId = team.id;
          socket.quizId = team.quiz_id;

          console.log(`Team ${team.team_name} joined quiz ${team.quiz_id}`);

          const quiz = await dbHelpers.get(
            'SELECT language FROM quizzes WHERE id = ?',
            [team.quiz_id]
          );

          socket.emit('team:joined', {
            teamId: team.id,
            teamName: team.team_name,
            quizId: team.quiz_id,
            language: quiz?.language === 'nl' ? 'nl' : 'en',
          });

          // Check if there's already an active round
          const currentRound = await dbHelpers.get(
            'SELECT * FROM rounds WHERE quiz_id = ? AND is_active = 1',
            [team.quiz_id]
          );

          if (currentRound && !currentRound.is_closed) {
            const questionRows = await loadRoundQuestions(dbHelpers, currentRound.id);

            socket.emit('round:started', {
              roundNumber: currentRound.round_number,
              roundName: currentRound.name || null,
              questions: formatQuestionsForClient(questionRows),
            });
          } else {
            // No live round: replay whatever the room is currently showing, so a
            // reload or a late join doesn't strand this team on the default
            // waiting screen while everyone else sees the break screen.
            const current = displayState.get(String(team.quiz_id));
            if (current && current.type === 'leaderboard') {
              socket.emit('leaderboard:show', {
                leaderboard: current.leaderboard,
                mode: current.mode,
              });
            } else if (current && current.type === 'screen') {
              socket.emit('screen:show', current.screen);
            }
          }
        } else {
          socket.emit('error', { message: 'Invalid session token' });
        }
      } catch (error) {
        console.error('Error in team:join:', error);
        socket.emit('error', { message: 'Failed to join quiz' });
      }
    });

    // Organizer joins
    socket.on('organizer:join', async (data) => {
      if (!verifyToken(data && data.token)) {
      return socket.emit('error', { message: 'Unauthorized' });
      }
      socket.isOrganizer = true;
      const { quizId } = data;
      socket.join(`organizer-${quizId}`);
      socket.quizId = quizId;
      console.log(`Organizer joined quiz ${quizId}`);
      
      socket.emit('organizer:joined', { quizId });
    });

    // Team submits answers
    socket.on('team:submit', async (data, callback) => {
      const { answers } = data; // Array of { questionId, selectedAnswer, selectedAnswers, answerText }
      const ack = typeof callback === 'function' ? callback : () => {};

      try {
        // Check if the round is closed before accepting answers
        if (answers.length > 0) {
          const question = await dbHelpers.get(
            `SELECT r.is_closed FROM questions q
             JOIN rounds r ON q.round_id = r.id
             WHERE q.id = ?`,
            [answers[0].questionId]
          );
          if (question && question.is_closed) {
            socket.emit('error', { message: 'This round is closed. Answers can no longer be submitted.' });
            socket.emit('round:closed', {});
            ack({ success: false, error: 'round_closed' });
            return;
          }
        }

        for (const answer of answers) {
          const question = await dbHelpers.get(
            'SELECT correct_answer, correct_answers_json, question_type, answer_mode FROM questions WHERE id = ?',
            [answer.questionId]
          );

          if (question.question_type === 'open') {
            // Open question: store text, leave is_correct as NULL (pending review)
            await dbHelpers.run(
              `REPLACE INTO answers (team_id, question_id, answer_text, is_correct)
               VALUES (?, ?, ?, NULL)`,
              [socket.teamId, answer.questionId, answer.answerText || '']
            );
          } else {
            const selectedAnswers = question.answer_mode === 'multi'
              ? (Array.isArray(answer.selectedAnswers) ? answer.selectedAnswers : [])
              : [answer.selectedAnswer];
            const correctAnswers = parseCorrectAnswersFromRow(question);
            const { score, isCorrect } = scoreSelectedAnswers(
              selectedAnswers,
              correctAnswers,
              question.answer_mode || 'single'
            );
            await dbHelpers.run(
              `REPLACE INTO answers (team_id, question_id, selected_answer, selected_answers_json, is_correct, score)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                socket.teamId,
                answer.questionId,
                selectedAnswers[0] || null,
                JSON.stringify(selectedAnswers),
                isCorrect,
                score,
              ]
            );
          }
        }

        socket.emit('team:submitted', { success: true });
        ack({ success: true });

        // Notify organizer
        const team = await dbHelpers.get('SELECT team_name FROM teams WHERE id = ?', [socket.teamId]);
        io.to(`organizer-${socket.quizId}`).emit('team:answered', {
          teamId: socket.teamId,
          teamName: team.team_name
        });

      } catch (error) {
        console.error('Error submitting answers:', error);
        socket.emit('error', { message: 'Failed to submit answers' });
        ack({ success: false, error: 'server_error' });
      }
    });

    // Organizer activates a round
    socket.on('organizer:activateRound', async (data) => {
      if (!socket.isOrganizer) return socket.emit('error', { message: 'Unauthorized' });
      const { roundId } = data;
      
      try {
        const round = await dbHelpers.get('SELECT quiz_id, round_number, name FROM rounds WHERE id = ?', [roundId]);

        // Deactivate all rounds for this quiz first
        await dbHelpers.run(
          'UPDATE rounds SET is_active = 0 WHERE quiz_id = ?',
          [round.quiz_id]
        );

        // Activate the selected round (and ensure it's open)
        await dbHelpers.run(
          'UPDATE rounds SET is_active = 1, is_closed = 0 WHERE id = ?',
          [roundId]
        );

        // Get questions for this round (WITHOUT correct answers)
        const questionRows = await loadRoundQuestions(dbHelpers, roundId);

        // A live round outranks any screen or leaderboard that was showing.
        displayState.delete(String(round.quiz_id));

        // Broadcast to all teams in this quiz
        io.to(`quiz-${round.quiz_id}`).emit('round:started', {
          roundNumber: round.round_number,
          roundName: round.name || null,
          questions: formatQuestionsForClient(questionRows),
        });

        socket.emit('organizer:roundActivated', { success: true, roundId });
        
        console.log(`Round ${roundId} activated for quiz ${round.quiz_id}`);
      } catch (error) {
        console.error('Error activating round:', error);
        socket.emit('error', { message: 'Failed to activate round' });
      }
    });

    // Organizer closes a round (no more submissions)
    socket.on('organizer:closeRound', async (data) => {
      if (!socket.isOrganizer) return socket.emit('error', { message: 'Unauthorized' });
      const { roundId } = data;

      try {
        const round = await dbHelpers.get('SELECT quiz_id, round_number FROM rounds WHERE id = ?', [roundId]);

        await dbHelpers.run(
          'UPDATE rounds SET is_closed = 1 WHERE id = ?',
          [roundId]
        );

        // Tell all teams the round is closed — clears their questions
        io.to(`quiz-${round.quiz_id}`).emit('round:closed', {
          roundNumber: round.round_number
        });

        socket.emit('organizer:roundClosed', { success: true, roundId });
        console.log(`Round ${roundId} closed for quiz ${round.quiz_id}`);
      } catch (error) {
        console.error('Error closing round:', error);
        socket.emit('error', { message: 'Failed to close round' });
      }
    });

    // Organizer reopens a closed round
    socket.on('organizer:reopenRound', async (data) => {
      if (!socket.isOrganizer) return socket.emit('error', { message: 'Unauthorized' });
      const { roundId } = data;

      try {
        const round = await dbHelpers.get('SELECT quiz_id, round_number, name FROM rounds WHERE id = ?', [roundId]);

        await dbHelpers.run(
          'UPDATE rounds SET is_closed = 0 WHERE id = ?',
          [roundId]
        );

        // Re-send questions to all teams
        const questionRows = await loadRoundQuestions(dbHelpers, roundId);

        displayState.delete(String(round.quiz_id));

        io.to(`quiz-${round.quiz_id}`).emit('round:started', {
          roundNumber: round.round_number,
          roundName: round.name || null,
          questions: formatQuestionsForClient(questionRows),
        });

        socket.emit('organizer:roundReopened', { success: true, roundId });
        console.log(`Round ${roundId} reopened for quiz ${round.quiz_id}`);
      } catch (error) {
        console.error('Error reopening round:', error);
        socket.emit('error', { message: 'Failed to reopen round' });
      }
    });

    // Organizer reveals the leaderboard to all teams.
    // mode 'top3' (default) shows the podium plus the viewing team's own row;
    // mode 'all' sends the full standings.
    socket.on('organizer:showLeaderboard', async (data) => {
      if (!socket.isOrganizer) return socket.emit('error', { message: 'Unauthorized' });
      const { quizId } = data;
      const mode = data && data.mode === 'all' ? 'all' : 'top3';

      try {
        const leaderboard = await dbHelpers.all(
          `SELECT
            t.id,
            t.team_name,
            COALESCE(SUM(a.score), 0) as score,
            COUNT(a.id) as total_answered
           FROM teams t
           LEFT JOIN answers a ON t.id = a.team_id
           WHERE t.quiz_id = ?
           GROUP BY t.id, t.team_name
           ORDER BY score DESC, total_answered DESC`,
          [quizId]
        );

        displayState.set(String(quizId), { type: 'leaderboard', leaderboard, mode });

        io.to(`quiz-${quizId}`).emit('leaderboard:show', { leaderboard, mode });
        socket.emit('organizer:leaderboardShown', { success: true, mode });
        console.log(`Leaderboard (${mode}) shown to teams for quiz ${quizId}`);
      } catch (error) {
        console.error('Error showing leaderboard:', error);
        socket.emit('error', { message: 'Failed to show leaderboard' });
      }
    });

    // Organizer hides the leaderboard from teams
    socket.on('organizer:hideLeaderboard', (data) => {
      if (!socket.isOrganizer) return socket.emit('error', { message: 'Unauthorized' });
      const { quizId } = data;
      const current = displayState.get(String(quizId));
      if (current && current.type === 'leaderboard') displayState.delete(String(quizId));
      io.to(`quiz-${quizId}`).emit('leaderboard:hide', {});
      socket.emit('organizer:leaderboardHidden', { success: true });
    });

    // Organizer pushes a saved screen (opening / break / end / a message)
    socket.on('organizer:showScreen', async (data) => {
      if (!socket.isOrganizer) return socket.emit('error', { message: 'Unauthorized' });
      const { quizId, screenId } = data || {};

      try {
        const screen = await dbHelpers.get(
          'SELECT id, title, body FROM quiz_screens WHERE id = ? AND quiz_id = ?',
          [screenId, quizId]
        );

        if (!screen) {
          return socket.emit('error', { message: 'Screen not found' });
        }

        const payload = { id: screen.id, title: screen.title, body: screen.body || '' };
        displayState.set(String(quizId), { type: 'screen', screen: payload });

        io.to(`quiz-${quizId}`).emit('screen:show', payload);
        socket.emit('organizer:screenShown', { success: true, screenId: screen.id });
        console.log(`Screen "${screen.title}" shown to teams for quiz ${quizId}`);
      } catch (error) {
        console.error('Error showing screen:', error);
        socket.emit('error', { message: 'Failed to show screen' });
      }
    });

    // Organizer sends everyone back to the default waiting room
    socket.on('organizer:hideScreen', (data) => {
      if (!socket.isOrganizer) return socket.emit('error', { message: 'Unauthorized' });
      const { quizId } = data || {};
      displayState.delete(String(quizId));
      io.to(`quiz-${quizId}`).emit('screen:hide', {});
      io.to(`quiz-${quizId}`).emit('leaderboard:hide', {});
      socket.emit('organizer:screenHidden', { success: true });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}

module.exports = { setupSocketHandlers };