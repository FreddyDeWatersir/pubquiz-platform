const assert = require('assert');
const {
  normalizeOptionsInput,
  validateCorrectAnswer,
  validateCorrectAnswers,
  parseOptionsFromRow,
  parseCorrectAnswersFromRow,
  scoreSelectedAnswers,
  formatQuestionsForClient,
} = require('../utils/questionOptions');

// 2 options
const two = normalizeOptionsInput(['Yes', 'No']);
assert.strictEqual(two.error, undefined);
assert.strictEqual(two.options.length, 2);
assert.strictEqual(validateCorrectAnswer('A', two.options), null);
assert.strictEqual(validateCorrectAnswer('C', two.options).error.includes('Correct answer'), true);

// 5 options
const five = normalizeOptionsInput(['1', '2', '3', '4', '5']);
assert.strictEqual(five.options.length, 5);
assert.strictEqual(five.options[4].label, 'E');
assert.strictEqual(validateCorrectAnswer('E', five.options), null);
assert.strictEqual(validateCorrectAnswers(['B', 'E'], five.options, 'single'), null);
assert.strictEqual(validateCorrectAnswers(['B', 'E'], five.options, 'multi'), null);

// Legacy fallback
const legacy = parseOptionsFromRow({
  question_type: 'multiple_choice',
  option_a: 'A1',
  option_b: 'B1',
  option_c: null,
  option_d: null,
});
assert.strictEqual(legacy.length, 2);
assert.deepStrictEqual(legacy.map((o) => o.label), ['A', 'B']);

// options_json
const fromJson = parseOptionsFromRow({
  question_type: 'multiple_choice',
  options_json: JSON.stringify(['One', 'Two', 'Three']),
});
assert.strictEqual(fromJson.length, 3);

const correctFromJson = parseCorrectAnswersFromRow({
  question_type: 'multiple_choice',
  correct_answers_json: JSON.stringify(['B', 'D']),
});
assert.deepStrictEqual(correctFromJson, ['B', 'D']);

const singleScore = scoreSelectedAnswers(['D'], ['B', 'D'], 'single');
assert.strictEqual(singleScore.score, 1);
assert.strictEqual(singleScore.isCorrect, 1);

const partialScore = scoreSelectedAnswers(['A', 'B'], ['A', 'C'], 'multi');
assert.strictEqual(partialScore.score, 0);
assert.strictEqual(partialScore.isCorrect, 0);

const halfScore = scoreSelectedAnswers(['A'], ['A', 'C'], 'multi');
assert.strictEqual(halfScore.score, 0.5);
assert.strictEqual(halfScore.isCorrect, 0);

// Team payload shape
const teamPayload = formatQuestionsForClient([
  {
    id: 1,
    question_text: 'Q?',
    question_type: 'multiple_choice',
    image_url: null,
    answer_mode: 'multi',
    options_json: JSON.stringify(['X', 'Y']),
    option_a: 'X',
    option_b: 'Y',
  },
]);
assert.strictEqual(teamPayload[0].options.length, 2);
assert.strictEqual(teamPayload[0].correct_answer, undefined);
assert.strictEqual(teamPayload[0].answer_mode, 'multi');

console.log('All questionOptions tests passed');
