import React, { useState } from 'react';
import { colors, commonStyles } from '../theme';

function QuestionDisplay({ questions, onSubmit, teamName }) {
  const [answers, setAnswers] = useState({});
  const [textAnswers, setTextAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleAnswerChange = (questionId, answer) => {
    setAnswers({ ...answers, [questionId]: answer });
  };

  const handleTextChange = (questionId, text) => {
    setTextAnswers({ ...textAnswers, [questionId]: text });
  };

  const handleSubmit = () => {
    const allAnswered = questions.every(q => {
      if (q.question_type === 'open') {
        return textAnswers[q.id] && textAnswers[q.id].trim();
      }
      return answers[q.id];
    });

    if (!allAnswered) {
      alert('Please answer all questions before submitting!');
      return;
    }

    setSubmitting(true);
    const answersArray = questions.map(q => {
      if (q.question_type === 'open') {
        return { questionId: q.id, answerText: textAnswers[q.id] };
      }
      return { questionId: q.id, selectedAnswer: answers[q.id] };
    });
    onSubmit(answersArray);
  };

  // Count answered questions for progress indicator
  const answeredCount = questions.filter(q => {
    if (q.question_type === 'open') return textAnswers[q.id] && textAnswers[q.id].trim();
    return answers[q.id];
  }).length;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <span style={styles.teamBadge}>⚡ {teamName}</span>
          <span style={styles.progress}>
            {answeredCount}/{questions.length} answered
          </span>
        </div>
        {/* Progress bar */}
        <div style={styles.progressBar}>
          <div style={{
            ...styles.progressFill,
            width: `${(answeredCount / questions.length) * 100}%`,
          }} />
        </div>
      </div>

      <div style={styles.questionsContainer}>
        {questions.map((question, index) => (
          <div key={question.id} style={styles.questionCard}>
            <div style={styles.questionHeader}>
              <span style={styles.questionNumber}>Q{index + 1}</span>
              <span style={question.question_type === 'open' ? styles.typeBadgeOpen : styles.typeBadgeMC}>
                {question.question_type === 'open' ? 'OPEN' : 'CHOICE'}
              </span>
            </div>

            {question.image_url && (
              <div style={styles.imageContainer}>
                <img
                  src={question.image_url}
                  alt={`Question ${index + 1}`}
                  style={styles.questionImage}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}

            <p style={styles.questionText}>{question.question_text}</p>

            {question.question_type === 'open' ? (
              <textarea
                placeholder="Type your answer here..."
                value={textAnswers[question.id] || ''}
                onChange={(e) => handleTextChange(question.id, e.target.value)}
                style={styles.openInput}
                rows="3"
                disabled={submitting}
              />
            ) : (
              <div style={styles.optionsContainer}>
                {['A', 'B', 'C', 'D'].map((option) => {
                  const optionText = question[`option_${option.toLowerCase()}`];
                  if (!optionText) return null;
                  const isSelected = answers[question.id] === option;
                  return (
                    <label
                      key={option}
                      style={{
                        ...styles.optionLabel,
                        ...(isSelected ? styles.optionSelected : {}),
                      }}
                    >
                      <span style={{
                        ...styles.optionLetter,
                        ...(isSelected ? styles.optionLetterSelected : {}),
                      }}>
                        {option}
                      </span>
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option}
                        checked={isSelected}
                        onChange={() => handleAnswerChange(question.id, option)}
                        style={{ display: 'none' }}
                        disabled={submitting}
                      />
                      <span style={styles.optionText}>{optionText}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={styles.submitContainer}>
        <button
          onClick={handleSubmit}
          style={{
            ...styles.submitButton,
            ...(answeredCount < questions.length ? styles.submitDisabled : {}),
          }}
          disabled={submitting}
        >
          {submitting ? 'Submitting...' : 'Submit Answers'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: colors.bg,
    color: colors.text,
    padding: '20px',
    fontFamily: "'Outfit', 'Segoe UI', sans-serif",
  },
  header: {
    maxWidth: '800px',
    margin: '0 auto 24px',
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  teamBadge: {
    ...commonStyles.badgeOrange,
    fontSize: '14px',
    padding: '6px 14px',
  },
  progress: {
    color: colors.textMuted,
    fontSize: '14px',
    fontWeight: '600',
  },
  progressBar: {
    width: '100%',
    height: '4px',
    backgroundColor: colors.border,
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  questionsContainer: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  questionCard: {
    backgroundColor: colors.bgCard,
    padding: '28px',
    borderRadius: '16px',
    marginBottom: '16px',
    border: `1px solid ${colors.border}`,
    animation: 'slideUp 0.4s ease',
  },
  questionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  questionNumber: {
    fontSize: '14px',
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: '1px',
  },
  typeBadgeMC: {
    ...commonStyles.badgeOrange,
  },
  typeBadgeOpen: {
    ...commonStyles.badgePurple,
  },
  imageContainer: {
    marginBottom: '16px',
    textAlign: 'center',
  },
  questionImage: {
    maxWidth: '100%',
    maxHeight: '350px',
    borderRadius: '12px',
    objectFit: 'contain',
  },
  questionText: {
    fontSize: '18px',
    marginBottom: '20px',
    lineHeight: '1.6',
    fontWeight: '500',
  },
  optionsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  optionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 16px',
    backgroundColor: colors.bgInput,
    borderRadius: '12px',
    cursor: 'pointer',
    border: `1px solid ${colors.border}`,
    transition: 'all 0.2s ease',
  },
  optionSelected: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  optionLetter: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '700',
    backgroundColor: colors.border,
    color: colors.textMuted,
    flexShrink: 0,
  },
  optionLetterSelected: {
    backgroundColor: colors.primary,
    color: '#fff',
  },
  optionText: {
    fontSize: '16px',
  },
  openInput: {
    width: '100%',
    padding: '14px 16px',
    fontSize: '16px',
    backgroundColor: colors.bgInput,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    borderRadius: '12px',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
    outline: 'none',
  },
  submitContainer: {
    maxWidth: '800px',
    margin: '24px auto 40px',
    textAlign: 'center',
  },
  submitButton: {
    padding: '16px 60px',
    fontSize: '18px',
    backgroundColor: colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: '700',
    letterSpacing: '0.5px',
    transition: 'all 0.2s ease',
  },
  submitDisabled: {
    opacity: 0.6,
  },
};

export default QuestionDisplay;
