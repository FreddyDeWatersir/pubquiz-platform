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
