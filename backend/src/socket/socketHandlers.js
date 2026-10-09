const { verifyToken } = require('../auth');
const { dbHelpers } = require('../database');
const { formatQuestionsForClient } = require('../utils/questionOptions');
const {
  STATUS,
  buildAnswerRow,
  saveAnswer,
  getQuestionWithRound,
  countRoundDrafts,
  getSubmittedTeamIds,
  getTeamRoundAnswers,
  getLeaderboard,
} = require('../utils/answers');
const { parseStoredLinks } = require('../utils/screens');

// What each quiz is currently showing its teams, when it isn't a round.
// Kept in memory (not the database) because it is per-evening ephemeral state
// and PM2 restarts mid-quiz are already disruptive for other reasons. Its job
// is to make a team that reloads, or joins late, land on the same screen as
// everyone else instead of dropping back to "waiting for the quizmaster".
//   key:   String(quizId)
//   value: { type: 'leaderboard', leaderboard, mode }
//        | { type: 'screen', screen, endsAt }   (endsAt: ms timestamp or null)
const displayState = new Map();

const TEAM_QUESTION_COLUMNS = `id, question_text, question_type, image_url,
        option_a, option_b, option_c, option_d, options_json, answer_mode,
        image_size, show_option_letters`;

async function loadRoundQuestions(db, roundId) {
  return db.all(
    `SELECT ${TEAM_QUESTION_COLUMNS}
     FROM questions WHERE round_id = ? ORDER BY sort_order, id`,
    [roundId]
  );
}

/**
 * The 'round:started' payload. Broadcast to the whole quiz room, so it can't
 * be personalised — instead it lists which teams already handed this round
 * in, and each phone checks its own id. That's what makes a reopened round
 * (or a refresh after submitting) show a team its review instead of letting
 * it fill the round in again.
 */
async function buildRoundStarted(db, round) {
  const questionRows = await loadRoundQuestions(db, round.id);
  return {
    roundId: Number(round.id),
    roundNumber: round.round_number,
    roundName: round.name || null,
    questions: formatQuestionsForClient(questionRows),
    submittedTeamIds: await getSubmittedTeamIds(db, round.id),
  };
}

/**
 * A screen as teams receive it. The countdown is sent as *time remaining*
 * computed on the server at send time, never as a wall-clock end time:
 * phone clocks are routinely minutes off, so "ends at 21:43:10" would show
 * a different number on every table. Each phone adds the remaining time to
 * its own clock instead, which is accurate to network latency.
 */
function screenPayload(state) {
  const remainingMs = state.endsAt ? Math.max(0, state.endsAt - Date.now()) : null;
  return { ...state.screen, remainingMs };
}

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Drafts, submissions and lookups from one phone run strictly one after
    // another. The handlers are async, so without this a quick A-then-B tap
    // could interleave at an `await` and leave A stored as the final answer
    // while the phone shows B. Worse, a draft that started before a Submit
    // could finish after it and demote the submitted answer back to a draft.
    let queue = Promise.resolve();
    const serial = (fn) => {
      // .catch keeps one failed handler from poisoning every later one, and
      // from surfacing as an unhandled rejection.
      queue = queue.then(() => fn()).catch((error) => {
        console.error('Team socket handler failed:', error);
      });
      return queue;
    };

    // Team joins with their session token
    socket.on('team:join', async (data) => {
      const { sessionToken } = data || {};

      try {
        const team = await dbHelpers.get(
          'SELECT * FROM teams WHERE session_token = ?',
          [sessionToken]
        );

        if (!team) {
          socket.emit('error', { message: 'Invalid session token' });
          return;
        }

        socket.join(`quiz-${team.quiz_id}`);
        socket.teamId = Number(team.id);
        socket.quizId = Number(team.quiz_id);

        console.log(`Team ${team.team_name} joined quiz ${team.quiz_id}`);

        const quiz = await dbHelpers.get(
          'SELECT language FROM quizzes WHERE id = ?',
          [team.quiz_id]
        );

        socket.emit('team:joined', {
          teamId: socket.teamId,
          teamName: team.team_name,
          quizId: socket.quizId,
          language: quiz?.language === 'nl' ? 'nl' : 'en',
        });

        // Check if there's already an active round
        const currentRound = await dbHelpers.get(
          'SELECT * FROM rounds WHERE quiz_id = ? AND is_active = 1',
          [team.quiz_id]
        );

        if (currentRound && !currentRound.is_closed) {
          socket.emit('round:started', await buildRoundStarted(dbHelpers, currentRound));
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
            socket.emit('screen:show', screenPayload(current));
          }
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

    // ──────────────────────────────────────────────────────
    // A team changed one answer. Saved immediately as a draft.
    // ──────────────────────────────────────────────────────
    // Drafts are what let a manually closed round keep the answers of teams
    // that never pressed Submit. They never count towards any score until the
    // round closes or the team submits — see utils/answers.js.
    socket.on('team:draft', (data, callback) => serial(async () => {
      const ack = typeof callback === 'function' ? callback : () => {};
      if (!socket.teamId) return ack({ ok: false, error: 'not_joined' });

      try {
        const questionId = Number(data && data.questionId);
        const question = questionId ? await getQuestionWithRound(dbHelpers, questionId) : null;

        // Only the live round of this team's own quiz accepts drafts. This is
        // also the security boundary: a team can't write into another quiz,
        // a closed round, or a round that isn't running.
        if (
          !question
          || Number(question.quiz_id) !== socket.quizId
          || !question.round_is_active
          || question.round_is_closed
        ) {
          return ack({ ok: false, error: 'round_not_open' });
        }

        const existing = await dbHelpers.get(
          'SELECT answer_status FROM answers WHERE team_id = ? AND question_id = ?',
          [socket.teamId, questionId]
        );
        // A handed-in answer is final; a stray draft must never demote it.
        if (existing && existing.answer_status === STATUS.SUBMITTED) {
          return ack({ ok: false, error: 'already_submitted' });
        }

        const row = buildAnswerRow(question, data);
        if (row.isEmpty) {
          // The team cleared its answer: forget it rather than store a blank.
          if (existing) {
            await dbHelpers.run(
              'DELETE FROM answers WHERE team_id = ? AND question_id = ? AND answer_status <> ?',
              [socket.teamId, questionId, STATUS.SUBMITTED]
            );
          }
        } else {
          await saveAnswer(dbHelpers, socket.teamId, questionId, row, STATUS.DRAFT);
        }

        ack({ ok: true });
        io.to(`organizer-${socket.quizId}`).emit('team:progress', { teamId: socket.teamId });
      } catch (error) {
        console.error('Error saving draft:', error);
        ack({ ok: false, error: 'server_error' });
      }
    }));

    // ──────────────────────────────────────────────────────
    // A phone asks for its own stored answers for a round —
    // to restore them after a refresh, or to show the review.
    // ──────────────────────────────────────────────────────
    socket.on('team:getRoundAnswers', (data, callback) => serial(async () => {
      const ack = typeof callback === 'function' ? callback : () => {};
      if (!socket.teamId) return ack({ ok: false, error: 'not_joined' });

      try {
        const roundId = Number(data && data.roundId);
        const round = roundId
          ? await dbHelpers.get('SELECT id, quiz_id FROM rounds WHERE id = ?', [roundId])
          : null;
        if (!round || Number(round.quiz_id) !== socket.quizId) {
          return ack({ ok: false, error: 'not_found' });
        }

        const answers = await getTeamRoundAnswers(dbHelpers, socket.teamId, roundId);
        const submitted = Object.values(answers).some((a) => a.status === STATUS.SUBMITTED);
        ack({ ok: true, answers, submitted });
      } catch (error) {
        console.error('Error loading round answers:', error);
        ack({ ok: false, error: 'server_error' });
      }
    }));

    // Team submits answers
    socket.on('team:submit', (data, callback) => serial(async () => {
      const ack = typeof callback === 'function' ? callback : () => {};
      const answers = Array.isArray(data && data.answers) ? data.answers : [];

      if (!socket.teamId) {
        ack({ success: false, error: 'not_joined' });
        return;
      }

      try {
        const round = await dbHelpers.get(
          'SELECT * FROM rounds WHERE quiz_id = ? AND is_active = 1',
          [socket.quizId]
        );

        if (!round || round.is_closed) {
          socket.emit('error', { message: 'This round is closed. Answers can no longer be submitted.' });
          socket.emit('round:closed', {});
          ack({ success: false, error: 'round_closed' });
          return;
        }

        // Only questions from the live round are accepted, which also stops a
        // team from submitting into another quiz by guessing question ids.
        const questionRows = await dbHelpers.all(
          'SELECT * FROM questions WHERE round_id = ?',
          [round.id]
        );
        const questionsById = new Map(questionRows.map((q) => [Number(q.id), q]));

        for (const answer of answers) {
          const question = questionsById.get(Number(answer && answer.questionId));
          if (!question) continue;
          const row = buildAnswerRow(question, answer);
          await saveAnswer(dbHelpers, socket.teamId, question.id, row, STATUS.SUBMITTED);
        }

        socket.emit('team:submitted', { success: true });
        ack({ success: true });

        // Notify organizer
        const team = await dbHelpers.get('SELECT team_name FROM teams WHERE id = ?', [socket.teamId]);
        io.to(`organizer-${socket.quizId}`).emit('team:answered', {
          teamId: socket.teamId,
          teamName: team ? team.team_name : '',
        });
      } catch (error) {
        console.error('Error submitting answers:', error);
        socket.emit('error', { message: 'Failed to submit answers' });
        ack({ success: false, error: 'server_error' });
      }
    }));

    // Organizer activates a round
    socket.on('organizer:activateRound', async (data) => {
      if (!socket.isOrganizer) return socket.emit('error', { message: 'Unauthorized' });
      const { roundId } = data;

      try {
        const round = await dbHelpers.get('SELECT * FROM rounds WHERE id = ?', [roundId]);
        if (!round) return socket.emit('error', { message: 'Round not found' });

        // Drafts in other rounds stay drafts. Teams can only ever see the
        // active round, so those answers are frozen, but counting them is the
        // organizer's call from the hand-ins panel, not a side effect of
        // moving on to the next round.

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

        // A live round outranks any screen or leaderboard that was showing.
        displayState.delete(String(round.quiz_id));

        // Broadcast to all teams in this quiz (WITHOUT correct answers)
        io.to(`quiz-${round.quiz_id}`).emit('round:started', await buildRoundStarted(dbHelpers, round));

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
        if (!round) return socket.emit('error', { message: 'Round not found' });

        await dbHelpers.run(
          'UPDATE rounds SET is_closed = 1 WHERE id = ?',
          [roundId]
        );

        // Drafts are NOT promoted here. They are kept in the database and
        // reported back so the dashboard can offer to count them, but a team
        // that never pressed Submit scores nothing until the organizer says so.
        const pendingDrafts = await countRoundDrafts(dbHelpers, roundId);

        // Tell all teams the round is closed — clears their questions
        io.to(`quiz-${round.quiz_id}`).emit('round:closed', {
          roundId: Number(roundId),
          roundNumber: round.round_number,
        });

        socket.emit('organizer:roundClosed', { success: true, roundId, pendingDrafts });
        console.log(`Round ${roundId} closed for quiz ${round.quiz_id} (${pendingDrafts} unsubmitted answers awaiting a decision)`);
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
        const round = await dbHelpers.get('SELECT * FROM rounds WHERE id = ?', [roundId]);
        if (!round) return socket.emit('error', { message: 'Round not found' });

        await dbHelpers.run(
          'UPDATE rounds SET is_closed = 0 WHERE id = ?',
          [roundId]
        );

        displayState.delete(String(round.quiz_id));

        // Re-send questions. Teams that already handed in see their review;
        // the rest get their kept answers back to carry on from.
        io.to(`quiz-${round.quiz_id}`).emit('round:started', await buildRoundStarted(dbHelpers, round));

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
        const leaderboard = await getLeaderboard(dbHelpers, quizId);

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
        const row = await dbHelpers.get(
          'SELECT * FROM quiz_screens WHERE id = ? AND quiz_id = ?',
          [screenId, quizId]
        );

        if (!row) {
          return socket.emit('error', { message: 'Screen not found' });
        }

        const seconds = row.countdown_seconds ? Number(row.countdown_seconds) : 0;
        const state = {
          type: 'screen',
          screen: {
            id: Number(row.id),
            title: row.title,
            body: row.body || '',
            links: parseStoredLinks(row.links_json),
          },
          // Each Show restarts the countdown from its full length.
          endsAt: seconds > 0 ? Date.now() + seconds * 1000 : null,
        };
        displayState.set(String(quizId), state);

        io.to(`quiz-${quizId}`).emit('screen:show', screenPayload(state));
        socket.emit('organizer:screenShown', { success: true, screenId: row.id });
        console.log(`Screen "${row.title}" shown to teams for quiz ${quizId}`);
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
