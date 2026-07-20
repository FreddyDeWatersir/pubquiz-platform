const MAX_OPTIONS = 26;
const MIN_OPTIONS = 2;

export function optionLabel(index) {
  return String.fromCharCode(65 + index);
}

/** Build initial options array from API question or legacy fields */
export function getOptionsFromQuestion(question) {
  if (!question) {
    return ['', '', '', ''];
  }

  if (question.options && question.options.length > 0) {
    return question.options.map((o) =>
      typeof o === 'string' ? o : o.text
    );
  }

  const legacy = ['a', 'b', 'c', 'd']
    .map((l) => question[`option_${l}`] || '')
    .filter((t) => t.trim());

  return legacy.length >= MIN_OPTIONS ? legacy : ['', '', '', ''];
}

export function getOptionLabels(count) {
  return Array.from({ length: count }, (_, i) => optionLabel(i));
}

export function getCorrectAnswersFromQuestion(question) {
  if (question?.correct_answers && question.correct_answers.length > 0) {
    return question.correct_answers;
  }
  if (question?.correct_answer) {
    return String(question.correct_answer)
      .split(',')
      .map((answer) => answer.trim().toUpperCase())
      .filter(Boolean);
  }
  return ['A'];
}

export { MAX_OPTIONS, MIN_OPTIONS };
