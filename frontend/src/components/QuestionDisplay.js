import React, { useState } from 'react';

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
    // Check all questions are answered
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
        return {
          questionId: q.id,
          answerText: textAnswers[q.id]
        };
      }
      return {
        questionId: q.id,
        selectedAnswer: answers[q.id]
      };
    });

    onSubmit(answersArray);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Team: {teamName}</h2>
        <p style={styles.subtitle}>Answer all questions and submit</p>
      </div>

      <div style={styles.questionsContainer}>
        {questions.map((question, index) => (
          <div key={question.id} style={styles.questionCard}>
            <h3 style={styles.questionNumber}>Question {index + 1}</h3>

            {/* Question image */}
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

            {/* Open question */}
            {question.question_type === 'open' ? (
              <div style={styles.openAnswerContainer}>
                <textarea
                  placeholder="Type your answer here..."
                  value={textAnswers[question.id] || ''}
                  onChange={(e) => handleTextChange(question.id, e.target.value)}
                  style={styles.openInput}
                  rows="3"
                  disabled={submitting}
                />
              </div>
            ) : (
              /* Multiple choice */
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
                        ...(isSelected ? styles.optionSelected : {})
                      }}
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option}
                        checked={isSelected}
                        onChange={() => handleAnswerChange(question.id, option)}
                        style={styles.radio}
                        disabled={submitting}
                      />
                      <span style={styles.optionText}>
                        <strong>{option}:</strong> {optionText}
                      </span>
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
          style={styles.submitButton}
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
    backgroundColor: '#1a1a2e',
    color: '#fff',
    padding: '20px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px',
  },
  title: {
    fontSize: '28px',
    marginBottom: '5px',
  },
  subtitle: {
    color: '#a0a0a0',
    fontSize: '14px',
  },
  questionsContainer: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  questionCard: {
    backgroundColor: '#16213e',
    padding: '25px',
    borderRadius: '10px',
    marginBottom: '20px',
  },
  questionNumber: {
    fontSize: '16px',
    color: '#0f3460',
    marginBottom: '10px',
  },
  imageContainer: {
    marginBottom: '15px',
    textAlign: 'center',
  },
  questionImage: {
    maxWidth: '100%',
    maxHeight: '350px',
    borderRadius: '8px',
    objectFit: 'contain',
  },
  questionText: {
    fontSize: '20px',
    marginBottom: '20px',
    lineHeight: '1.5',
  },
  optionsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  optionLabel: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#0f3460',
    borderRadius: '5px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    border: '2px solid transparent',
  },
  optionSelected: {
    backgroundColor: '#1a5276',
    borderColor: '#2ecc71',
  },
  radio: {
    marginRight: '12px',
    cursor: 'pointer',
    width: '18px',
    height: '18px',
  },
  optionText: {
    fontSize: '16px',
  },
  openAnswerContainer: {
    marginTop: '10px',
  },
  openInput: {
    width: '100%',
    padding: '14px',
    fontSize: '16px',
    border: 'none',
    borderRadius: '5px',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  submitContainer: {
    maxWidth: '800px',
    margin: '30px auto',
    textAlign: 'center',
  },
  submitButton: {
    padding: '15px 50px',
    fontSize: '18px',
    backgroundColor: '#2ecc71',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};

export default QuestionDisplay;