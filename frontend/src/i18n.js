// ──────────────────────────────────────────────────────────
// I18N.JS — Dutch/English strings for everything teams see
// ──────────────────────────────────────────────────────────
//
// SCOPE: team-facing only. The organizer dashboard and question manager stay
// in English — they're a surface only you and your co-hosts touch, and
// translating them roughly triples the number of strings to keep in sync.
//
// The language is a property of the quiz, not of the browser, so a Dutch
// quiz reads Dutch on an English phone. It arrives from three places:
//   1. POST /api/teams/verify-code    (as soon as the code is accepted)
//   2. POST /api/teams/register       (on join)
//   3. the 'team:joined' socket event (on every reconnect — the source of
//      truth, so changing the quiz language mid-evening reaches everyone)
//
// ADDING A STRING: add the key to BOTH dictionaries. A key missing from `nl`
// falls back to `en` rather than rendering blank, so a forgotten translation
// degrades to English instead of an empty screen.

const strings = {
  en: {
    // Join flow
    enterCodePrompt: 'Enter the quiz code to join',
    quizCodePlaceholder: 'QUIZ CODE',
    enter: 'Enter',
    checking: 'Checking...',
    enterCodeError: 'Please enter a quiz code',
    invalidCode: 'Invalid code',
    connectionError: 'Could not connect to server',
    chooseTeamName: 'Choose your team name',
    teamNamePlaceholder: 'Team Name',
    joinQuiz: 'Join Quiz',
    joining: 'Joining...',
    differentCode: '← Different code',
    enterTeamNameError: 'Please enter a team name',
    joinFailed: 'Failed to join quiz',

    // Waiting room
    welcome: 'Welcome, {name}!',
    waitingForQuizmaster: 'Waiting for the quizmaster...',
    connected: 'Connected',
    reconnecting: 'Reconnecting...',
    disconnected: 'Disconnected',
    leaveTeam: 'Leave Team',
    leaveTeamConfirm:
      'Leave the team "{name}"?\n\nYou will go back to the code screen and have to join again. Answers you have already submitted are kept.',

    // Question view
    round: 'Round {number}',
    answeredCount: '{answered}/{total} answered',
    openAnswerPlaceholder: 'Type your answer here...',
    submitAnswers: 'Submit Answers',
    submitting: 'Submitting...',
    reconnectingShort: 'Reconnecting…',
    answerAllFirst: 'Please answer all questions before submitting!',
    answersSubmitted: 'Answers submitted! ✓',
    notConnected: 'Not connected — reconnecting, please try Submit again in a moment.',
    submitUnreachable: "Couldn't reach the server — please tap Submit again.",
    submitFailed: "Couldn't submit — please tap Submit again.",
    connectionLost: 'Connection lost. Try refreshing.',
    errorPrefix: 'Error: {message}',

    // Leaderboard
    leaderboard: 'Leaderboard',
  },

  nl: {
    // Join flow
    enterCodePrompt: 'Vul de quizcode in om mee te doen',
    quizCodePlaceholder: 'QUIZCODE',
    enter: 'Verder',
    checking: 'Even kijken...',
    enterCodeError: 'Vul een quizcode in',
    invalidCode: 'Ongeldige code',
    connectionError: 'Kan geen verbinding maken met de server',
    chooseTeamName: 'Kies jullie teamnaam',
    teamNamePlaceholder: 'Teamnaam',
    joinQuiz: 'Meedoen',
    joining: 'Bezig met meedoen...',
    differentCode: '← Andere code',
    enterTeamNameError: 'Vul een teamnaam in',
    joinFailed: 'Meedoen aan de quiz is niet gelukt',

    // Waiting room
    welcome: 'Welkom, {name}!',
    waitingForQuizmaster: 'Wachten op de quizmaster...',
    connected: 'Verbonden',
    reconnecting: 'Opnieuw verbinden...',
    disconnected: 'Geen verbinding',
    leaveTeam: 'Team verlaten',
    leaveTeamConfirm:
      'Team "{name}" verlaten?\n\nJe gaat terug naar het codescherm en moet opnieuw meedoen. Al ingeleverde antwoorden blijven bewaard.',

    // Question view
    round: 'Ronde {number}',
    answeredCount: '{answered}/{total} beantwoord',
    openAnswerPlaceholder: 'Typ hier jullie antwoord...',
    submitAnswers: 'Antwoorden inleveren',
    submitting: 'Bezig met inleveren...',
    reconnectingShort: 'Opnieuw verbinden…',
    answerAllFirst: 'Beantwoord eerst alle vragen voordat je inlevert!',
    answersSubmitted: 'Antwoorden ingeleverd! ✓',
    notConnected: 'Geen verbinding — we proberen het opnieuw, probeer zo nog een keer in te leveren.',
    submitUnreachable: 'De server is niet bereikbaar — tik nog een keer op inleveren.',
    submitFailed: 'Inleveren is niet gelukt — tik nog een keer op inleveren.',
    connectionLost: 'Verbinding verbroken. Probeer de pagina te verversen.',
    errorPrefix: 'Fout: {message}',

    // Leaderboard
    leaderboard: 'Scorebord',
  },
};

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'nl', label: 'Nederlands' },
];

export function normalizeLanguage(language) {
  return language === 'nl' ? 'nl' : 'en';
}

/**
 * t('nl', 'welcome', { name: 'De Bierbuiken' }) -> 'Welkom, De Bierbuiken!'
 *
 * Falls back to English for an untranslated key, and to the key itself if it
 * exists in neither dictionary — a visible but harmless placeholder rather
 * than a blank space that's easy to miss in testing.
 */
export function t(language, key, vars = {}) {
  const lang = normalizeLanguage(language);
  const template = strings[lang][key] ?? strings.en[key] ?? key;

  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/** Bind the language once so components can call tt('key') instead. */
export function translator(language) {
  return (key, vars) => t(language, key, vars);
}
