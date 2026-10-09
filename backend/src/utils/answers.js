// ──────────────────────────────────────────────────────────
// ANSWERS.JS — one home for how answers are stored, scored and counted
// ──────────────────────────────────────────────────────────
//
// WHY DRAFTS EXIST
// Teams used to send answers only when they pressed Submit. Anything entered
// but not submitted lived in the phone's memory and was thrown away when the
// organizer closed the round. Now every change is saved as a *draft* the
// moment it happens, so closing a round can keep what a team already had.
//
// THE THREE STATES (answers.answer_status)
//   'draft'      saved while typing/tapping; NEVER counted on any leaderboard
//   'submitted'  the team pressed Submit
//   'accepted'   was a draft, and the ORGANIZER chose to count it after the
//                round closed — still tellable apart from a real submission
//                in the grading view and the CSV
//
// NOTHING PROMOTES A DRAFT AUTOMATICALLY. Closing a round leaves drafts as
// drafts; the organizer sees which teams never handed in and decides whether
// to count what they had. That keeps a team who tapped one option by accident
// from silently collecting points, and keeps the judgement with the person
// running the room.
//
// Why drafts must be excluded from scoring: scores are computed when an answer
// is written. If drafts counted, the live leaderboard would move while teams
// are still tapping, and an organizer revealing standings mid-round would
// leak which answers are right. So every leaderboard query goes through
// getLeaderboard() below and filters drafts out in one place.
//
// Rows written before this column existed get the column default,
// 'submitted', which is exactly what they were.

const {
  parseOptionsFromRow,
  parseCorrectAnswersFromRow,
  scoreSelectedAnswers,
} = require('./questionOptions');

const STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  ACCEPTED: 'accepted',
});

// Open answers are free text; this is far beyond any real answer and stops a
// client from writing megabytes into the database through the draft channel.
const MAX_TEXT_LENGTH = 2000;

// SQL fragment for "this answer counts". NULL is treated as counting so a row
// that somehow predates the column default can never silently drop out.
const COUNTS_SQL = `(a.answer_status IS NULL OR a.answer_status <> 'draft')`;

/**
 * Normalise what a client sent for one question into the columns we store.
 *
 * Multiple-choice selections are filtered against the question's real option
 * labels, so a malformed or hostile payload can't store labels that don't
 * exist. Returns { isEmpty, ...columns }: an empty answer (nothing selected,
 * blank text) is how a team "un-answers" a question, and is deleted rather
 * than stored.
 */
function buildAnswerRow(question, answer = {}) {
  if (question.question_type === 'open') {
    const text = answer.answerText == null ? '' : String(answer.answerText).slice(0, MAX_TEXT_LENGTH);
    return {
      isEmpty: !text.trim(),
      selected_answer: null,
      selected_answers_json: null,
      answer_text: text,
      is_correct: null, // pending manual grading
      score: 0,
    };
  }

  const validLabels = new Set(parseOptionsFromRow(question).map((o) => o.label));
  const mode = question.answer_mode === 'multi' ? 'multi' : 'single';
  const raw = mode === 'multi'
    ? (Array.isArray(answer.selectedAnswers) ? answer.selectedAnswers : [])
    : [answer.selectedAnswer];
  const selected = [...new Set(
    raw.filter((v) => v != null).map((v) => String(v).trim().toUpperCase())
  )].filter((label) => validLabels.has(label));

  const { score, isCorrect } = scoreSelectedAnswers(
    selected,
    parseCorrectAnswersFromRow(question),
    mode
  );

  return {
    isEmpty: selected.length === 0,
    selected_answer: selected[0] || null,
    selected_answers_json: JSON.stringify(selected),
    answer_text: null,
    is_correct: selected.length ? isCorrect : 0,
    score: selected.length ? score : 0,
  };
}

async function saveAnswer(db, teamId, questionId, row, status) {
  await db.run(
    `REPLACE INTO answers
       (team_id, question_id, selected_answer, selected_answers_json, answer_text, is_correct, score, answer_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      teamId,
      questionId,
      row.selected_answer,
      row.selected_answers_json,
      row.answer_text,
      row.is_correct,
      row.score,
      status,
    ]
  );
}

/** A question joined with its round, for checking where an answer may go. */
async function getQuestionWithRound(db, questionId) {
  return db.get(
    `SELECT q.*, r.quiz_id, r.is_active AS round_is_active, r.is_closed AS round_is_closed
     FROM questions q JOIN rounds r ON q.round_id = r.id
     WHERE q.id = ?`,
    [questionId]
  );
}

/**
 * Count every remaining draft in a round, because the organizer said so.
 * Only ever called from the explicit "Accept unsubmitted answers" action —
 * never on close, never on activating another round.
 * Returns how many answers started counting.
 */
async function acceptRoundDrafts(db, roundId) {
  const result = await db.run(
    `UPDATE answers SET answer_status = ?
     WHERE answer_status = ?
       AND question_id IN (SELECT id FROM questions WHERE round_id = ?)`,
    [STATUS.ACCEPTED, STATUS.DRAFT, roundId]
  );
  return result.changes || 0;
}

/** How many drafts are still waiting on a decision in this round. */
async function countRoundDrafts(db, roundId) {
  const row = await db.get(
    `SELECT COUNT(*) AS n FROM answers
     WHERE answer_status = ?
       AND question_id IN (SELECT id FROM questions WHERE round_id = ?)`,
    [STATUS.DRAFT, roundId]
  );
  return Number(row?.n) || 0;
}

/** Team ids that pressed Submit for this round. */
async function getSubmittedTeamIds(db, roundId) {
  const rows = await db.all(
    `SELECT DISTINCT a.team_id
     FROM answers a JOIN questions q ON a.question_id = q.id
     WHERE q.round_id = ? AND a.answer_status = ?`,
    [roundId, STATUS.SUBMITTED]
  );
  return rows.map((r) => Number(r.team_id));
}

/**
 * One team's stored answers for a round, in the same shape the team client
 * keeps them in, keyed by question id. Used to restore a phone after a
 * refresh, and to show a team what it handed in.
 */
async function getTeamRoundAnswers(db, teamId, roundId) {
  const rows = await db.all(
    `SELECT a.question_id, a.selected_answer, a.selected_answers_json, a.answer_text,
            a.answer_status, q.question_type, q.answer_mode
     FROM answers a JOIN questions q ON a.question_id = q.id
     WHERE a.team_id = ? AND q.round_id = ?`,
    [teamId, roundId]
  );

  const answers = {};
  for (const row of rows) {
    let value;
    if (row.question_type === 'open') {
      value = { answerText: row.answer_text || '' };
    } else if (row.answer_mode === 'multi') {
      let selected = [];
      try { selected = JSON.parse(row.selected_answers_json || '[]'); } catch { selected = []; }
      value = { selectedAnswers: Array.isArray(selected) ? selected : [] };
    } else {
      value = { selectedAnswer: row.selected_answer || null };
    }
    answers[row.question_id] = { ...value, status: row.answer_status || STATUS.SUBMITTED };
  }
  return answers;
}

/**
 * Standings for a quiz. The ONLY leaderboard query: drafts are filtered in
 * the JOIN (not the WHERE) so a team with no counted answers still appears
 * with 0 instead of vanishing.
 */
async function getLeaderboard(db, quizId) {
  const rows = await db.all(
    `SELECT
       t.id,
       t.team_name,
       COALESCE(SUM(a.score), 0) AS score,
       COUNT(a.id) AS total_answered
     FROM teams t
     LEFT JOIN answers a ON t.id = a.team_id AND ${COUNTS_SQL}
     WHERE t.quiz_id = ?
     GROUP BY t.id, t.team_name
     ORDER BY score DESC, total_answered DESC`,
    [quizId]
  );
  // mysql2 returns SUM() of integers as a DECIMAL string; normalise.
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    score: Number(r.score) || 0,
    total_answered: Number(r.total_answered) || 0,
  }));
}

/**
 * Per-team hand-in state for one round, for the organizer:
 *   'submitted'  pressed Submit
 *   'accepted'   never submitted, but the organizer accepted their drafts
 *   'drafting'   has answers entered that nobody has counted yet. While the
 *                round is open this just means "still working"; once it is
 *                closed it means "never handed in, and here is what they had"
 *   'none'       nothing at all
 *
 * `draft_count` is what the Accept action would turn into points, so the
 * dashboard can say how much is at stake before the organizer commits.
 */
async function getRoundHandIns(db, quizId, roundId) {
  const questionCountRow = await db.get(
    'SELECT COUNT(*) AS n FROM questions WHERE round_id = ?',
    [roundId]
  );
  const questionCount = Number(questionCountRow?.n) || 0;

  const rows = await db.all(
    `SELECT
       t.id AS team_id,
       t.team_name,
       SUM(CASE WHEN a.answer_status = 'submitted' THEN 1 ELSE 0 END) AS submitted_count,
       SUM(CASE WHEN a.answer_status = 'accepted'  THEN 1 ELSE 0 END) AS accepted_count,
       SUM(CASE WHEN a.answer_status = 'draft'     THEN 1 ELSE 0 END) AS draft_count
     FROM teams t
     LEFT JOIN answers a
       ON a.team_id = t.id
      AND a.question_id IN (SELECT id FROM questions WHERE round_id = ?)
     WHERE t.quiz_id = ?
     GROUP BY t.id, t.team_name
     ORDER BY t.team_name`,
    [roundId, quizId]
  );

  return rows.map((r) => {
    const submitted = Number(r.submitted_count) || 0;
    const accepted = Number(r.accepted_count) || 0;
    const draft = Number(r.draft_count) || 0;
    const status = submitted > 0 ? 'submitted'
      : accepted > 0 ? 'accepted'
      : draft > 0 ? 'drafting'
      : 'none';
    return {
      team_id: Number(r.team_id),
      team_name: r.team_name,
      status,
      answered: submitted + accepted + draft,
      draft_count: draft,
      question_count: questionCount,
    };
  });
}

module.exports = {
  STATUS,
  COUNTS_SQL,
  MAX_TEXT_LENGTH,
  buildAnswerRow,
  saveAnswer,
  getQuestionWithRound,
  acceptRoundDrafts,
  countRoundDrafts,
  getSubmittedTeamIds,
  getTeamRoundAnswers,
  getLeaderboard,
  getRoundHandIns,
};
