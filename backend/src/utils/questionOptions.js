const MAX_OPTIONS = 26;
const MIN_OPTIONS = 2;

function optionLabel(index) {
  return String.fromCharCode(65 + index); // A, B, C, ...
}

function uniqueLabels(labels) {
  return [...new Set((labels || []).map((label) => String(label).trim().toUpperCase()).filter(Boolean))];
}

/**
 * Parse options from options_json or legacy option_a..d columns.
 * Returns array of { label, text }.
 */
function parseOptionsFromRow(row) {
  if (!row || row.question_type === 'open') {
    return [];
  }

  if (row.options_json) {
    try {
      const parsed = JSON.parse(row.options_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((text, i) => ({
          label: optionLabel(i),
          text: String(text).trim(),
        })).filter((o) => o.text);
      }
    } catch {
      // fall through to legacy
    }
  }

  const legacy = ['a', 'b', 'c', 'd'].map((letter, i) => {
    const text = row[`option_${letter}`];
    if (!text || !String(text).trim()) return null;
    return { label: optionLabel(i), text: String(text).trim() };
  }).filter(Boolean);

  return legacy;
}

function parseCorrectAnswersFromRow(row) {
  if (!row || row.question_type === 'open') {
    return [];
  }

  if (row.correct_answers_json) {
    try {
      const parsed = JSON.parse(row.correct_answers_json);
      if (Array.isArray(parsed)) {
        return uniqueLabels(parsed);
      }
    } catch {
      // fall through to legacy correct_answer parsing
    }
  }

  if (!row.correct_answer) {
    return [];
  }
  return uniqueLabels(String(row.correct_answer).split(','));
}

/**
 * Normalize raw options array from API body (strings).
 */
function normalizeOptionsInput(rawOptions, legacyFields = {}) {
  let texts = [];

  if (Array.isArray(rawOptions) && rawOptions.length > 0) {
    texts = rawOptions.map((o) => String(o).trim()).filter(Boolean);
  } else {
    const { option_a, option_b, option_c, option_d } = legacyFields;
    texts = [option_a, option_b, option_c, option_d]
      .map((o) => (o ? String(o).trim() : ''))
      .filter(Boolean);
  }

  if (texts.length < MIN_OPTIONS) {
    return { error: `At least ${MIN_OPTIONS} non-empty options are required` };
  }
  if (texts.length > MAX_OPTIONS) {
    return { error: `At most ${MAX_OPTIONS} options are allowed` };
  }

  const options = texts.map((text, i) => ({
    label: optionLabel(i),
    text,
  }));

  return { options, optionsJson: JSON.stringify(texts) };
}

function mirrorLegacyColumns(options) {
  const texts = options.map((o) => o.text);
  return {
    option_a: texts[0] || null,
    option_b: texts[1] || null,
    option_c: texts[2] || null,
    option_d: texts[3] || null,
  };
}

function normalizeCorrectAnswersInput(rawCorrectAnswers, legacyCorrectAnswer) {
  if (Array.isArray(rawCorrectAnswers) && rawCorrectAnswers.length > 0) {
    return uniqueLabels(rawCorrectAnswers);
  }
  if (!legacyCorrectAnswer) {
    return [];
  }
  return uniqueLabels(String(legacyCorrectAnswer).split(','));
}

function validateCorrectAnswers(correctAnswers, options, answerMode = 'single') {
  const labels = options.map((o) => o.label);
  if (!correctAnswers.length) {
    return { error: 'At least one correct answer is required' };
  }
  const invalid = correctAnswers.filter((answer) => !labels.includes(answer));
  if (invalid.length > 0) {
    return { error: `Correct answer must be one of: ${labels.join(', ')}` };
  }
  if (answerMode === 'multi' && correctAnswers.length < 2) {
    return { error: 'Multi-select questions require at least two correct answers' };
  }
  return null;
}

function validateCorrectAnswer(correctAnswer, options) {
  return validateCorrectAnswers(normalizeCorrectAnswersInput(null, correctAnswer), options, 'single');
}

function scoreSelectedAnswers(selectedAnswers, correctAnswers, answerMode = 'single') {
  const selected = uniqueLabels(selectedAnswers);
  const correct = uniqueLabels(correctAnswers);
  if (!selected.length || !correct.length) {
    return { score: 0, isCorrect: 0 };
  }

  if (answerMode === 'single') {
    const isCorrect = correct.includes(selected[0]) ? 1 : 0;
    return { score: isCorrect, isCorrect };
  }

  const correctSelected = selected.filter((answer) => correct.includes(answer)).length;
  const incorrectSelected = selected.filter((answer) => !correct.includes(answer)).length;
  const score = Math.max(0, (correctSelected - incorrectSelected) / correct.length);
  const exact =
    selected.length === correct.length &&
    correct.every((answer) => selected.includes(answer));

  return {
    score: Number(score.toFixed(4)),
    isCorrect: exact ? 1 : 0,
  };
}

/**
 * Shape question row for API/socket (team-facing omits correct_answer).
 */
function formatQuestionForClient(row, { includeCorrectAnswer = false } = {}) {
  const options = parseOptionsFromRow(row);
  const answerMode = row.answer_mode || 'single';
  const correctAnswers = parseCorrectAnswersFromRow(row);
  const base = {
    id: row.id,
    question_text: row.question_text,
    question_type: row.question_type || 'multiple_choice',
    answer_mode: answerMode,
    image_url: row.image_url,
    option_a: row.option_a,
    option_b: row.option_b,
    option_c: row.option_c,
    option_d: row.option_d,
    options,
  };
  if (includeCorrectAnswer) {
    return { ...row, answer_mode: answerMode, correct_answers: correctAnswers, options };
  }
  return base;
}

function formatQuestionsForClient(rows, opts = {}) {
  return rows.map((row) => formatQuestionForClient(row, opts));
}

module.exports = {
  MAX_OPTIONS,
  MIN_OPTIONS,
  optionLabel,
  parseOptionsFromRow,
  parseCorrectAnswersFromRow,
  normalizeOptionsInput,
  normalizeCorrectAnswersInput,
  mirrorLegacyColumns,
  validateCorrectAnswer,
  validateCorrectAnswers,
  scoreSelectedAnswers,
  formatQuestionForClient,
  formatQuestionsForClient,
};
