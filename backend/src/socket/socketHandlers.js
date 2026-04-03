const { dbHelpers } = require('../database');

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
          
          socket.emit('team:joined', {
            teamId: team.id,
            teamName: team.team_name,
            quizId: team.quiz_id
          });

          // Check if there's already an active round
          const currentRound = await dbHelpers.get(
            'SELECT * FROM rounds WHERE quiz_id = ? AND is_active = 1',
            [team.quiz_id]
          );

          if (currentRound) {
            // Only send questions if round is not closed
            if (!currentRound.is_closed) {
              const questions = await dbHelpers.all(
                `SELECT id, question_text, question_type, image_url, 
                        option_a, option_b, option_c, option_d 
                 FROM questions WHERE round_id = ?`,
                [currentRound.id]
              );

              socket.emit('round:started', {
                roundNumber: currentRound.round_number,
                questions
              });
            }
            // If round is closed, team stays on waiting screen
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
      const { quizId } = data;
      socket.join(`organizer-${quizId}`);
      socket.quizId = quizId;
      console.log(`Organizer joined quiz ${quizId}`);
      
      socket.emit('organizer:joined', { quizId });
    });

    // Team submits answers
    socket.on('team:submit', async (data) => {
      const { answers } = data; // Array of { questionId, selectedAnswer, answerText }
      
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
            return;
          }
        }

        for (const answer of answers) {
          const question = await dbHelpers.get(
            'SELECT correct_answer, question_type FROM questions WHERE id = ?',
            [answer.questionId]
          );

          if (question.question_type === 'open') {
            // Open question: store text, leave is_correct as NULL (pending review)
            await dbHelpers.run(
              `INSERT OR REPLACE INTO answers (team_id, question_id, answer_text, is_correct)
               VALUES (?, ?, ?, NULL)`,
              [socket.teamId, answer.questionId, answer.answerText || '']
            );
          } else {
            // Multiple choice: auto-grade
            const isCorrect = question.correct_answer === answer.selectedAnswer ? 1 : 0;
            await dbHelpers.run(
              `INSERT OR REPLACE INTO answers (team_id, question_id, selected_answer, is_correct)
               VALUES (?, ?, ?, ?)`,
              [socket.teamId, answer.questionId, answer.selectedAnswer, isCorrect]
            );
          }
        }

        socket.emit('team:submitted', { success: true });
        
        // Notify organizer
        const team = await dbHelpers.get('SELECT team_name FROM teams WHERE id = ?', [socket.teamId]);
        io.to(`organizer-${socket.quizId}`).emit('team:answered', {
          teamId: socket.teamId,
          teamName: team.team_name
        });

      } catch (error) {
        console.error('Error submitting answers:', error);
        socket.emit('error', { message: 'Failed to submit answers' });
      }
    });

    // Organizer activates a round
    socket.on('organizer:activateRound', async (data) => {
      const { roundId } = data;
      
      try {
        const round = await dbHelpers.get('SELECT quiz_id, round_number FROM rounds WHERE id = ?', [roundId]);
        
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
        const questions = await dbHelpers.all(
          `SELECT id, question_text, question_type, image_url, 
                  option_a, option_b, option_c, option_d 
           FROM questions WHERE round_id = ?`,
          [roundId]
        );

        // Broadcast to all teams in this quiz
        io.to(`quiz-${round.quiz_id}`).emit('round:started', {
          roundNumber: round.round_number,
          questions
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
      const { roundId } = data;

      try {
        const round = await dbHelpers.get('SELECT quiz_id, round_number FROM rounds WHERE id = ?', [roundId]);

        await dbHelpers.run(
          'UPDATE rounds SET is_closed = 0 WHERE id = ?',
          [roundId]
        );

        // Re-send questions to all teams
        const questions = await dbHelpers.all(
          `SELECT id, question_text, question_type, image_url, 
                  option_a, option_b, option_c, option_d 
           FROM questions WHERE round_id = ?`,
          [roundId]
        );

        io.to(`quiz-${round.quiz_id}`).emit('round:started', {
          roundNumber: round.round_number,
          questions
        });

        socket.emit('organizer:roundReopened', { success: true, roundId });
        console.log(`Round ${roundId} reopened for quiz ${round.quiz_id}`);
      } catch (error) {
        console.error('Error reopening round:', error);
        socket.emit('error', { message: 'Failed to reopen round' });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}

module.exports = { setupSocketHandlers };