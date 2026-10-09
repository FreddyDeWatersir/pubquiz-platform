/**
 * End-to-end smoke test over a throwaway SQLite database.
 *
 * Boots the real Express app + socket server, then drives the new behaviour
 * through the actual HTTP and WebSocket surfaces:
 *   - quiz rename / access-code change / language (the 500 that was reported)
 *   - round copy keeping the name, order and per-question display settings
 *   - a question saved with no question text
 *   - show_option_letters reaching the team payload
 *   - saved screens: create, push to teams, back to the waiting room
 *   - leaderboard reveal in top3 and all modes
 *
 * Run (from backend/):
 *     npm install --no-save socket.io-client
 *     node src/test/integration.smoke.js
 *
 * socket.io-client is deliberately NOT added to package.json: this is the only
 * thing that needs it, and adding it would put package.json and package-lock
 * out of sync, which makes `npm ci` fail on the server.
 *
 * It writes to backend/data/quiz.db and DELETES that file first, so never run
 * it anywhere that has a quiz you care about. It only touches SQLite; it never
 * connects to MySQL (it clears MYSQL_HOST before loading the database module).
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Fresh database file per run, and the auth secrets the server insists on.
const DATA_DIR = path.join(__dirname, '../../data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'quiz.db');
fs.rmSync(DB_FILE, { force: true });

process.env.ADMIN_PASSWORD = 'test-password';
process.env.AUTH_SECRET = 'test-secret-value-for-smoke-run';
process.env.PORT = '0';
delete process.env.MYSQL_HOST;

const express = require('express');
const cors = require('cors');
const socketIo = require('socket.io');
const ioClient = require('socket.io-client');

const { dbHelpers } = require('../database');
const teamRoutes = require('../routes/teamRoutes');
const organizerRoutes = require('../routes/organizerRoutes');
const adminRoutes = require('../routes/adminRoutes');
const authRoutes = require('../routes/authRoutes');
const { setupSocketHandlers } = require('../socket/socketHandlers');
const { requireAuth, createToken } = require('../auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/teams', teamRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/organizer', requireAuth, organizerRoutes);
app.use('/api/admin', requireAuth, adminRoutes);

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });
setupSocketHandlers(io);

const TOKEN = createToken();

let BASE;
function api(method, urlPath, body, auth = true) {
  return fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));
}

/** Resolve on the named socket event, or reject after `ms`. */
function waitFor(socket, event, ms = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

// ──────────────────────────────────────────────────────────

check('quiz rename + access code + language no longer 500s', async (ctx) => {
  const created = await api('POST', '/api/organizer/quizzes', {
    name: 'Smoke Quiz',
    access_code: 'SMOKE1',
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  ctx.quizId = created.body.quiz.id;

  // This is the exact payload the dashboard sends: no `status` field. It used
  // to reach mysql2 as an undefined bind parameter and fail with
  // "Failed to update the quiz".
  const updated = await api('PUT', `/api/organizer/quizzes/${ctx.quizId}`, {
    name: 'Renamed Quiz',
    access_code: 'newcode',
    language: 'nl',
  });
  assert.strictEqual(updated.status, 200, JSON.stringify(updated.body));

  const quiz = await dbHelpers.get('SELECT * FROM quizzes WHERE id = ?', [ctx.quizId]);
  assert.strictEqual(quiz.name, 'Renamed Quiz');
  assert.strictEqual(quiz.access_code, 'NEWCODE', 'access code should be upper-cased');
  assert.strictEqual(quiz.language, 'nl');
  assert.strictEqual(quiz.status, 'draft', 'omitted fields must be left alone');
});

check('a duplicate access code is still rejected', async (ctx) => {
  await api('POST', '/api/organizer/quizzes', { name: 'Other', access_code: 'TAKEN1' });
  const clash = await api('PUT', `/api/organizer/quizzes/${ctx.quizId}`, {
    name: 'Renamed Quiz',
    access_code: 'TAKEN1',
  });
  assert.strictEqual(clash.status, 409, 'expected a 409 conflict');
});

check('the team join flow reports the quiz language', async (ctx) => {
  const verified = await api('POST', '/api/teams/verify-code', { accessCode: 'newcode' }, false);
  assert.strictEqual(verified.status, 200, JSON.stringify(verified.body));
  assert.strictEqual(verified.body.language, 'nl');

  const registered = await api('POST', '/api/teams/register', {
    teamName: 'De Bierbuiken',
    quizId: ctx.quizId,
  }, false);
  assert.strictEqual(registered.status, 201, JSON.stringify(registered.body));
  assert.strictEqual(registered.body.language, 'nl');
  ctx.sessionToken = registered.body.sessionToken;
  ctx.teamId = registered.body.teamId;
});

check('a round can be named, and questions can have no text', async (ctx) => {
  const round = await api('POST', `/api/organizer/quiz/${ctx.quizId}/rounds`, {});
  assert.strictEqual(round.status, 201);
  ctx.roundId = round.body.round.id;

  const named = await api('PUT', `/api/organizer/rounds/${ctx.roundId}`, { name: 'Music' });
  assert.strictEqual(named.status, 200);

  // Letters hidden — the "A. Rens, B. Freddy" case.
  const q1 = await api('POST', '/api/admin/questions', {
    round_id: ctx.roundId,
    question_text: 'Who sang it?',
    title: 'Opening banger',
    options: ['Rens', 'Freddy', 'Jurre'],
    correct_answers: ['B'],
    show_option_letters: false,
  });
  assert.strictEqual(q1.status, 201, JSON.stringify(q1.body));

  // No question text at all — this used to be a 400.
  const q2 = await api('POST', '/api/admin/questions', {
    round_id: ctx.roundId,
    image_url: 'https://example.com/cover.jpg',
    options: ['Yes', 'No'],
    correct_answers: ['A'],
  });
  assert.strictEqual(q2.status, 201, JSON.stringify(q2.body));

  const stored = await dbHelpers.get('SELECT * FROM questions WHERE id = ?', [q2.body.questionId]);
  assert.strictEqual(stored.question_text, '', 'empty text is stored as "" (column is NOT NULL)');
  assert.strictEqual(stored.show_option_letters, 1, 'letters default to visible');
});

check('the admin questions list carries the round name', async (ctx) => {
  const list = await api('GET', `/api/admin/questions?quiz_id=${ctx.quizId}`);
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.length >= 2);
  assert.strictEqual(list.body[0].round_name, 'Music');
  assert.strictEqual(list.body[0].round_number, 1);
});

check('copying a round keeps its name, order and display settings', async (ctx) => {
  const copied = await api('POST', `/api/organizer/rounds/${ctx.roundId}/copy`, {
    targetQuizId: ctx.quizId,
  });
  assert.strictEqual(copied.status, 200, JSON.stringify(copied.body));
  assert.strictEqual(copied.body.round.name, 'Music copy', 'the name must survive the copy');
  assert.strictEqual(copied.body.questionsCopied, 2);

  const copiedQuestions = await dbHelpers.all(
    'SELECT * FROM questions WHERE round_id = ? ORDER BY sort_order, id',
    [copied.body.round.id]
  );
  assert.strictEqual(copiedQuestions[0].title, 'Opening banger', 'titles must survive');
  assert.strictEqual(copiedQuestions[0].show_option_letters, 0, 'letter setting must survive');
  assert.ok(copiedQuestions[0].sort_order > 0, 'ordering must survive');

  // Copying the copy shouldn't produce "Music copy copy".
  const again = await api('POST', `/api/organizer/rounds/${copied.body.round.id}/copy`, {
    targetQuizId: ctx.quizId,
  });
  assert.strictEqual(again.body.round.name, 'Music copy 2');

  // Clean up so later round-activation assertions aren't ambiguous.
  await api('DELETE', `/api/organizer/rounds/${copied.body.round.id}`);
  await api('DELETE', `/api/organizer/rounds/${again.body.round.id}`);
});

check('screens can be created, listed and updated', async (ctx) => {
  const created = await api('POST', `/api/organizer/quiz/${ctx.quizId}/screens`, {
    title: 'Welkom!',
    body: 'De quiz begint zo.\n\nVeel plezier.',
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  ctx.screenId = created.body.screen.id;

  const blank = await api('POST', `/api/organizer/quiz/${ctx.quizId}/screens`, { title: '  ' });
  assert.strictEqual(blank.status, 400, 'a screen needs a title');

  const list = await api('GET', `/api/organizer/quiz/${ctx.quizId}/screens`);
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.body.length, 1);
  assert.strictEqual(list.body[0].title, 'Welkom!');
});

check('a team socket receives the round name and letter setting', async (ctx) => {
  const team = ioClient(BASE, { transports: ['websocket'], forceNew: true });
  ctx.team = team;

  await waitFor(team, 'connect');
  team.emit('team:join', { sessionToken: ctx.sessionToken });
  const joined = await waitFor(team, 'team:joined');
  assert.strictEqual(joined.language, 'nl', 'the socket join confirms the language');

  const organizer = ioClient(BASE, { transports: ['websocket'], forceNew: true });
  ctx.organizer = organizer;
  await waitFor(organizer, 'connect');
  organizer.emit('organizer:join', { quizId: ctx.quizId, token: TOKEN });
  await waitFor(organizer, 'organizer:joined');

  const started = waitFor(team, 'round:started');
  organizer.emit('organizer:activateRound', { roundId: ctx.roundId });
  const payload = await started;

  assert.strictEqual(payload.roundNumber, 1);
  assert.strictEqual(payload.roundName, 'Music', 'teams must receive the round name');
  assert.strictEqual(payload.questions.length, 2);
  assert.strictEqual(payload.questions[0].show_option_letters, 0);
  assert.strictEqual(payload.questions[1].show_option_letters, 1);
  assert.strictEqual(
    payload.questions[0].correct_answer,
    undefined,
    'answers must never be sent to teams'
  );
});

check('showing a screen, then the leaderboard, then the waiting room', async (ctx) => {
  const { team, organizer } = ctx;

  // Close the round so teams are back between rounds.
  const closed = waitFor(team, 'round:closed');
  organizer.emit('organizer:closeRound', { roundId: ctx.roundId });
  await closed;

  const screenShown = waitFor(team, 'screen:show');
  organizer.emit('organizer:showScreen', { quizId: ctx.quizId, screenId: ctx.screenId });
  const screen = await screenShown;
  assert.strictEqual(screen.title, 'Welkom!');
  assert.ok(screen.body.includes('Veel plezier'));

  const top3 = waitFor(team, 'leaderboard:show');
  organizer.emit('organizer:showLeaderboard', { quizId: ctx.quizId });
  const top3Payload = await top3;
  assert.strictEqual(top3Payload.mode, 'top3', 'top3 is the default reveal');

  const all = waitFor(team, 'leaderboard:show');
  organizer.emit('organizer:showLeaderboard', { quizId: ctx.quizId, mode: 'all' });
  const allPayload = await all;
  assert.strictEqual(allPayload.mode, 'all');
  assert.ok(Array.isArray(allPayload.leaderboard));

  const hidden = waitFor(team, 'screen:hide');
  organizer.emit('organizer:hideScreen', { quizId: ctx.quizId });
  await hidden;
});

check('a team that reloads lands on the screen everyone else sees', async (ctx) => {
  const { organizer } = ctx;

  organizer.emit('organizer:showScreen', { quizId: ctx.quizId, screenId: ctx.screenId });
  await new Promise((r) => setTimeout(r, 200));

  // A brand new socket, as if the phone was refreshed.
  const rejoining = ioClient(BASE, { transports: ['websocket'], forceNew: true });
  await waitFor(rejoining, 'connect');
  const replayed = waitFor(rejoining, 'screen:show');
  rejoining.emit('team:join', { sessionToken: ctx.sessionToken });
  const screen = await replayed;
  assert.strictEqual(screen.title, 'Welkom!', 'the current screen is replayed on join');
  rejoining.disconnect();
});

check('an unauthorised socket cannot drive the quiz', async (ctx) => {
  const impostor = ioClient(BASE, { transports: ['websocket'], forceNew: true });
  await waitFor(impostor, 'connect');
  const rejected = waitFor(impostor, 'error');
  impostor.emit('organizer:showScreen', { quizId: ctx.quizId, screenId: ctx.screenId });
  const err = await rejected;
  assert.strictEqual(err.message, 'Unauthorized');
  impostor.disconnect();
});

// ──────────────────────────────────────────────────────────
// DRAFTS — unsubmitted answers survive a manual close
// ──────────────────────────────────────────────────────────
// A fresh quiz so these checks don't depend on the state left above.

/** socket.emit with an acknowledgement, as a promise with a timeout. */
function emitAck(socket, event, payload, ms = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No ack for "${event}"`)), ms);
    socket.emit(event, payload, (reply) => {
      clearTimeout(timer);
      resolve(reply);
    });
  });
}

async function joinTeam(quizId, name) {
  const reg = await api('POST', '/api/teams/register', { teamName: name, quizId }, false);
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.body));
  const socket = ioClient(BASE, { transports: ['websocket'], forceNew: true });
  await waitFor(socket, 'connect');
  const joined = waitFor(socket, 'team:joined');
  socket.emit('team:join', { sessionToken: reg.body.sessionToken });
  await joined;
  return { socket, id: reg.body.teamId, token: reg.body.sessionToken };
}

const leaderboardOf = async (quizId) =>
  (await api('GET', `/api/organizer/quiz/${quizId}/leaderboard`)).body;
const handInsOf = async (quizId, roundId) =>
  (await api('GET', `/api/organizer/quiz/${quizId}/round/${roundId}/hand-ins`)).body;
const scoreOf = (board, teamId) => board.find((t) => t.id === teamId).score;
const statusOf = (handIns, teamId) => handIns.find((t) => t.team_id === teamId).status;

check('drafts: setup a second quiz with two rounds and three teams', async (ctx) => {
  const quiz = await api('POST', '/api/organizer/quizzes', { name: 'Drafts', access_code: 'DRAFTS' });
  ctx.d = { quizId: quiz.body.quiz.id };
  const { d } = ctx;

  for (const n of [1, 2]) {
    const round = await api('POST', `/api/organizer/quiz/${d.quizId}/rounds`, {});
    d[`round${n}`] = round.body.round.id;
  }
  const q = async (roundId, opts, correct, extra = {}) =>
    (await api('POST', '/api/admin/questions', {
      round_id: roundId, question_text: 'q', options: opts, correct_answers: correct, ...extra,
    })).body.questionId;
  d.q1 = await q(d.round1, ['A1', 'B1', 'C1'], ['B']);
  d.q2 = await q(d.round1, ['A2', 'B2'], ['A']);
  d.qOpen = (await api('POST', '/api/admin/questions', {
    round_id: d.round1, question_type: 'open', question_text: 'Capital?', correct_answer: 'Paris',
  })).body.questionId;
  d.qRound2 = await q(d.round2, ['X', 'Y'], ['A']);

  d.organizer = ioClient(BASE, { transports: ['websocket'], forceNew: true });
  await waitFor(d.organizer, 'connect');
  d.organizer.emit('organizer:join', { quizId: d.quizId, token: TOKEN });
  await waitFor(d.organizer, 'organizer:joined');

  d.submitter = await joinTeam(d.quizId, 'Submitter');
  d.dawdler = await joinTeam(d.quizId, 'Dawdler');
  d.idle = await joinTeam(d.quizId, 'Idle');

  const started = waitFor(d.dawdler.socket, 'round:started');
  d.organizer.emit('organizer:activateRound', { roundId: d.round1 });
  const payload = await started;
  assert.strictEqual(payload.roundId, d.round1, 'round:started carries the round id');
  assert.deepStrictEqual(payload.submittedTeamIds, [], 'nobody has handed in yet');
});

check('drafts: a tap is saved, but is NOT on the leaderboard', async (ctx) => {
  const { d } = ctx;
  const ack = await emitAck(d.dawdler.socket, 'team:draft', { questionId: d.q1, selectedAnswer: 'B' });
  assert.deepStrictEqual(ack, { ok: true });

  const row = await dbHelpers.get(
    'SELECT * FROM answers WHERE team_id = ? AND question_id = ?', [d.dawdler.id, d.q1]
  );
  assert.strictEqual(row.answer_status, 'draft');
  assert.strictEqual(row.score, 1, 'scored at write time...');
  assert.strictEqual(scoreOf(await leaderboardOf(d.quizId), d.dawdler.id), 0, '...but hidden from standings');
  // While the round is open 'drafting' reads as "still answering"; after it
  // closes the same state reads as "never handed in".
  assert.strictEqual(statusOf(await handInsOf(d.quizId, d.round1), d.dawdler.id), 'drafting');
});

check('drafts: rapid A-then-B taps store B (no interleaving)', async (ctx) => {
  const { d } = ctx;
  // Fire without awaiting, exactly like a fast double tap.
  const first = emitAck(d.dawdler.socket, 'team:draft', { questionId: d.q2, selectedAnswer: 'B' });
  const second = emitAck(d.dawdler.socket, 'team:draft', { questionId: d.q2, selectedAnswer: 'A' });
  await Promise.all([first, second]);
  const row = await dbHelpers.get(
    'SELECT selected_answer FROM answers WHERE team_id = ? AND question_id = ?', [d.dawdler.id, d.q2]
  );
  assert.strictEqual(row.selected_answer, 'A', 'the last tap wins');
});

check('drafts: clearing an answer deletes it; junk labels are ignored', async (ctx) => {
  const { d } = ctx;
  await emitAck(d.dawdler.socket, 'team:draft', { questionId: d.qOpen, answerText: 'Par' });
  await emitAck(d.dawdler.socket, 'team:draft', { questionId: d.qOpen, answerText: '   ' });
  const cleared = await dbHelpers.get(
    'SELECT id FROM answers WHERE team_id = ? AND question_id = ?', [d.dawdler.id, d.qOpen]
  );
  assert.strictEqual(cleared, undefined, 'a blanked answer is removed, not stored empty');

  // "Z" is not an option on this question: treated as no answer at all.
  await emitAck(d.idle.socket, 'team:draft', { questionId: d.q1, selectedAnswer: 'Z' });
  const junk = await dbHelpers.get(
    'SELECT id FROM answers WHERE team_id = ? AND question_id = ?', [d.idle.id, d.q1]
  );
  assert.strictEqual(junk, undefined);
});

check('drafts: refused outside the live round of your own quiz', async (ctx) => {
  const { d } = ctx;
  const notLive = await emitAck(d.dawdler.socket, 'team:draft', { questionId: d.qRound2, selectedAnswer: 'A' });
  assert.strictEqual(notLive.error, 'round_not_open', 'round 2 is not active');

  // ctx.roundId belongs to the first quiz: another quiz's question.
  const otherQuiz = await dbHelpers.get('SELECT id FROM questions WHERE round_id = ? LIMIT 1', [ctx.roundId]);
  const foreign = await emitAck(d.dawdler.socket, 'team:draft', { questionId: otherQuiz.id, selectedAnswer: 'A' });
  assert.strictEqual(foreign.error, 'round_not_open');
});

check('drafts: submit is final — a later stray draft cannot demote it', async (ctx) => {
  const { d } = ctx;
  const ack = await emitAck(d.submitter.socket, 'team:submit', {
    answers: [
      { questionId: d.q1, selectedAnswer: 'B' },
      { questionId: d.q2, selectedAnswer: 'A' },
      { questionId: d.qOpen, answerText: 'Paris' },
      { questionId: d.qRound2, selectedAnswer: 'A' }, // not in the live round: ignored
    ],
  });
  assert.strictEqual(ack.success, true);

  const stray = await emitAck(d.submitter.socket, 'team:draft', { questionId: d.q1, selectedAnswer: 'C' });
  assert.strictEqual(stray.error, 'already_submitted');

  const sneaked = await dbHelpers.get(
    'SELECT id FROM answers WHERE team_id = ? AND question_id = ?', [d.submitter.id, d.qRound2]
  );
  assert.strictEqual(sneaked, undefined, 'a submit cannot write into a round that is not live');

  assert.strictEqual(statusOf(await handInsOf(d.quizId, d.round1), d.submitter.id), 'submitted');
  assert.strictEqual(scoreOf(await leaderboardOf(d.quizId), d.submitter.id), 2, 'two MC right, open ungraded');

  const mine = await emitAck(d.submitter.socket, 'team:getRoundAnswers', { roundId: d.round1 });
  assert.strictEqual(mine.submitted, true);
  assert.strictEqual(mine.answers[d.qOpen].answerText, 'Paris', 'the review gets back what was typed');
  assert.strictEqual(mine.answers[d.q1].selectedAnswer, 'B');
});

check('drafts: closing a round does NOT count unsubmitted answers', async (ctx) => {
  const { d } = ctx;
  const closedForOrganizer = waitFor(d.organizer, 'organizer:roundClosed');
  d.organizer.emit('organizer:closeRound', { roundId: d.round1 });
  const closed = await closedForOrganizer;
  assert.strictEqual(closed.pendingDrafts, 2, 'the dawdler had two answers awaiting a decision');

  const row = await dbHelpers.get(
    'SELECT answer_status FROM answers WHERE team_id = ? AND question_id = ?', [d.dawdler.id, d.q1]
  );
  assert.strictEqual(row.answer_status, 'draft', 'still a draft after the close');

  assert.strictEqual(scoreOf(await leaderboardOf(d.quizId), d.dawdler.id), 0,
    'an unsubmitted answer scores nothing until the organizer accepts it');

  const handIns = await handInsOf(d.quizId, d.round1);
  assert.strictEqual(statusOf(handIns, d.dawdler.id), 'drafting');
  assert.strictEqual(handIns.find((h) => h.team_id === d.dawdler.id).draft_count, 2,
    'the dashboard can say how much is at stake');
  assert.strictEqual(statusOf(handIns, d.idle.id), 'none', 'the team that did nothing is visible');
  assert.strictEqual(statusOf(handIns, d.submitter.id), 'submitted');

  const late = await emitAck(d.dawdler.socket, 'team:draft', { questionId: d.q1, selectedAnswer: 'C' });
  assert.strictEqual(late.error, 'round_not_open', 'no drafts after the close');

  // The team still gets to see what it had entered.
  const mine = await emitAck(d.dawdler.socket, 'team:getRoundAnswers', { roundId: d.round1 });
  assert.strictEqual(mine.submitted, false);
  assert.strictEqual(mine.answers[d.q1].selectedAnswer, 'B', 'the review shows what they had');
});

check('drafts: the organizer accepts them explicitly, and only then they score', async (ctx) => {
  const { d } = ctx;
  const accepted = await api('POST', `/api/organizer/rounds/${d.round1}/accept-drafts`);
  assert.strictEqual(accepted.status, 200, JSON.stringify(accepted.body));
  assert.strictEqual(accepted.body.accepted, 2);

  const row = await dbHelpers.get(
    'SELECT answer_status FROM answers WHERE team_id = ? AND question_id = ?', [d.dawdler.id, d.q1]
  );
  assert.strictEqual(row.answer_status, 'accepted');

  // q1=B right (1) + q2=A right (1)
  assert.strictEqual(scoreOf(await leaderboardOf(d.quizId), d.dawdler.id), 2,
    'accepted answers score exactly as a submission would');
  assert.strictEqual(statusOf(await handInsOf(d.quizId, d.round1), d.dawdler.id), 'accepted',
    'still tellable apart from a real hand-in');

  // Accepting twice is harmless: there is nothing left to promote.
  const again = await api('POST', `/api/organizer/rounds/${d.round1}/accept-drafts`);
  assert.strictEqual(again.body.accepted, 0);
});

check('drafts: reopening lists who handed in; the next round does not auto-count', async (ctx) => {
  const { d } = ctx;
  const reopened = waitFor(d.dawdler.socket, 'round:started');
  d.organizer.emit('organizer:reopenRound', { roundId: d.round1 });
  const payload = await reopened;
  assert.deepStrictEqual(payload.submittedTeamIds, [d.submitter.id],
    'the submitter sees a review, the others get their questions back');

  // The idle team finally answers one question, then the organizer moves on
  // to round 2 WITHOUT closing round 1.
  await emitAck(d.idle.socket, 'team:draft', { questionId: d.q1, selectedAnswer: 'B' });
  const activated = waitFor(d.organizer, 'organizer:roundActivated');
  d.organizer.emit('organizer:activateRound', { roundId: d.round2 });
  await activated;

  assert.strictEqual(scoreOf(await leaderboardOf(d.quizId), d.idle.id), 0,
    'moving to the next round does not quietly count the last one');
  assert.strictEqual(statusOf(await handInsOf(d.quizId, d.round1), d.idle.id), 'drafting',
    'it stays on the hand-ins list waiting on a decision');
});

check('screens: links are validated, a countdown is sent as time remaining', async (ctx) => {
  const { d } = ctx;
  // A live round outranks a screen (a reloading phone gets its questions back),
  // so close round 2 first: this is the between-rounds break.
  const closed = waitFor(d.organizer, 'organizer:roundClosed');
  d.organizer.emit('organizer:closeRound', { roundId: d.round2 });
  await closed;

  const evil = await api('POST', `/api/organizer/quiz/${d.quizId}/screens`, {
    title: 'Bad', links: [{ label: 'x', url: 'javascript:alert(1)' }],
  });
  assert.strictEqual(evil.status, 400, 'javascript: URLs are rejected');

  const made = await api('POST', `/api/organizer/quiz/${d.quizId}/screens`, {
    title: 'Pauze',
    body: 'Even bijtanken',
    countdown_seconds: 600,
    links: [
      { label: 'Instagram', url: 'instagram.com/quizmastersofmelody' },
      { label: '', url: '' }, // the empty row the editor always shows
    ],
  });
  assert.strictEqual(made.status, 201, JSON.stringify(made.body));
  assert.strictEqual(made.body.screen.links.length, 1, 'blank rows are dropped');
  assert.strictEqual(made.body.screen.links[0].url, 'https://instagram.com/quizmastersofmelody',
    'a bare domain becomes https');

  const shown = waitFor(d.dawdler.socket, 'screen:show');
  d.organizer.emit('organizer:showScreen', { quizId: d.quizId, screenId: made.body.screen.id });
  const screen = await shown;
  assert.ok(screen.remainingMs > 590000 && screen.remainingMs <= 600000, `remaining ${screen.remainingMs}`);
  assert.strictEqual(screen.links[0].label, 'Instagram');

  // A phone that reloads mid-break sees the countdown already running.
  await new Promise((r) => setTimeout(r, 1100));
  const again = ioClient(BASE, { transports: ['websocket'], forceNew: true });
  await waitFor(again, 'connect');
  const replay = waitFor(again, 'screen:show');
  again.emit('team:join', { sessionToken: d.dawdler.token });
  const replayed = await replay;
  assert.ok(replayed.remainingMs < screen.remainingMs - 1000, 'the countdown kept running');
  again.disconnect();
});

check('teams: an organizer can fix a typo and delete a ghost team', async (ctx) => {
  const { d } = ctx;

  const renamed = await api('PUT', `/api/organizer/teams/${d.idle.id}`, { team_name: '  De Bierbuiken  ' });
  assert.strictEqual(renamed.status, 200, JSON.stringify(renamed.body));
  const row = await dbHelpers.get('SELECT team_name FROM teams WHERE id = ?', [d.idle.id]);
  assert.strictEqual(row.team_name, 'De Bierbuiken', 'trimmed on the way in');

  const clash = await api('PUT', `/api/organizer/teams/${d.dawdler.id}`, { team_name: 'De Bierbuiken' });
  assert.strictEqual(clash.status, 409, 'two teams in one quiz cannot share a name');

  const blank = await api('PUT', `/api/organizer/teams/${d.idle.id}`, { team_name: '   ' });
  assert.strictEqual(blank.status, 400);

  // A ghost team: registered, never played. Deleting it takes its answers too.
  const ghost = await api('POST', '/api/teams/register', { teamName: 'Ghost', quizId: d.quizId }, false);
  assert.strictEqual(ghost.status, 201);
  const removed = await api('DELETE', `/api/organizer/teams/${ghost.body.teamId}`);
  assert.strictEqual(removed.status, 200);
  assert.strictEqual(
    await dbHelpers.get('SELECT id FROM teams WHERE id = ?', [ghost.body.teamId]),
    undefined
  );
  assert.strictEqual(
    (await leaderboardOf(d.quizId)).find((t) => t.team_name === 'Ghost'),
    undefined,
    'and it leaves the leaderboard'
  );

  assert.strictEqual((await api('DELETE', '/api/organizer/teams/999999')).status, 404);
});

check('drafts: cleanup sockets', async (ctx) => {
  const { d } = ctx;
  [d.organizer, d.submitter.socket, d.dawdler.socket, d.idle.socket].forEach((s) => s.disconnect());
});

// ──────────────────────────────────────────────────────────

(async () => {
  await dbHelpers.ensureInitialized();
  await new Promise((resolve) => server.listen(0, resolve));
  BASE = `http://127.0.0.1:${server.address().port}`;

  const ctx = {};
  let failed = 0;

  for (const { name, fn } of checks) {
    try {
      await fn(ctx);
      console.log(`  ok   ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL ${name}`);
      console.error(`       ${err.message}`);
    }
  }

  if (ctx.team) ctx.team.disconnect();
  if (ctx.organizer) ctx.organizer.disconnect();
  io.close();
  server.close();

  console.log(
    failed === 0
      ? `\nAll ${checks.length} integration checks passed`
      : `\n${failed} of ${checks.length} integration checks FAILED`
  );
  process.exit(failed === 0 ? 0 : 1);
})();
