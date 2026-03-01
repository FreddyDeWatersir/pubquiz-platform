import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

function QuestionManager() {
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    const isAuthenticated = localStorage.getItem('adminAuth') === 'true';
    if (!isAuthenticated) {
      navigate('/admin');
    }
  }, [navigate]);

  const fetchQuizzes = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/organizer/quizzes`);
      const data = await response.json();
      setQuizzes(data);
      if (data.length > 0) {
        setSelectedQuizId(prev => prev || data[0].id);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching quizzes:', error);
      setLoading(false);
    }
  }, []);

  const fetchQuestions = useCallback(async () => {
    if (!selectedQuizId) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/questions?quiz_id=${selectedQuizId}`);
      const data = await response.json();
      setQuestions(data);
    } catch (error) {
      console.error('Error fetching questions:', error);
    }
  }, [selectedQuizId]);

  const fetchRounds = useCallback(async () => {
    if (!selectedQuizId) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/rounds?quiz_id=${selectedQuizId}`);
      const data = await response.json();
      setRounds(data);
    } catch (error) {
      console.error('Error fetching rounds:', error);
    }
  }, [selectedQuizId]);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  useEffect(() => {
    if (selectedQuizId) {
      fetchQuestions();
      fetchRounds();
    }
  }, [selectedQuizId, fetchQuestions, fetchRounds]);

  const handleDelete = async (questionId) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;

    try {
      const response = await fetch(`${API_URL}/api/admin/questions/${questionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchQuestions();
      } else {
        alert('Failed to delete question');
      }
    } catch (error) {
      console.error('Error deleting question:', error);
      alert('Failed to delete question');
    }
  };

  const handleEdit = (question) => {
    setEditingQuestion(question);
    setShowForm(true);
  };

  const handleAdd = () => {
    setEditingQuestion(null);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingQuestion(null);
    fetchQuestions();
  };

  const handleLogout = () => {
    localStorage.removeItem('adminAuth');
    navigate('/admin');
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={styles.loadingText}>Loading questions...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>📝 Question Manager</h1>
        <button onClick={handleLogout} style={styles.logoutButton}>
          Logout
        </button>
      </div>

      {/* Quiz Selector */}
      <div style={styles.quizSelector}>
        <label style={styles.quizLabel}>Quiz:</label>
        <select
          value={selectedQuizId || ''}
          onChange={(e) => setSelectedQuizId(parseInt(e.target.value))}
          style={styles.quizSelect}
        >
          {quizzes.map((quiz) => (
            <option key={quiz.id} value={quiz.id}>
              {quiz.name} (Code: {quiz.access_code})
            </option>
          ))}
        </select>
      </div>

      {quizzes.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No quizzes found. Create one in the Organizer Dashboard first!</p>
        </div>
      ) : (
        <>
          <div style={styles.actions}>
            <button onClick={handleAdd} style={styles.addButton}>
              ➕ Add New Question
            </button>
          </div>

          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Round</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Question</th>
                  <th style={styles.th}>Answer</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {questions.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={styles.emptyText}>
                      No questions yet for this quiz. Add your first question!
                    </td>
                  </tr>
                ) : (
                  questions.map((question) => (
                    <tr key={question.id} style={styles.tableRow}>
                      <td style={styles.td}>Round {question.round_number}</td>
                      <td style={styles.td}>
                        <span style={question.question_type === 'open' ? styles.typeBadgeOpen : styles.typeBadgeMC}>
                          {question.question_type === 'open' ? 'Open' : 'MC'}
                        </span>
                        {question.image_url && <span style={styles.imageBadge}>📷</span>}
                      </td>
                      <td style={styles.td}>{question.question_text}</td>
                      <td style={styles.td}>{question.correct_answer}</td>
                      <td style={styles.td}>
                        <button
                          onClick={() => handleEdit(question)}
                          style={styles.editButton}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(question.id)}
                          style={styles.deleteButton}
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showForm && (
        <QuestionForm
          question={editingQuestion}
          rounds={rounds}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}

function QuestionForm({ question, rounds, onClose }) {
  const [formData, setFormData] = useState({
    round_id: question?.round_id || (rounds[0]?.id || 1),
    question_type: question?.question_type || 'multiple_choice',
    question_text: question?.question_text || '',
    image_url: question?.image_url || '',
    option_a: question?.option_a || '',
    option_b: question?.option_b || '',
    option_c: question?.option_c || '',
    option_d: question?.option_d || '',
    correct_answer: question?.correct_answer || 'A',
  });

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const isOpen = formData.question_type === 'open';

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.question_text.trim()) {
      alert('Please enter a question');
      return;
    }

    if (isOpen && !formData.correct_answer.trim()) {
      alert('Please enter the correct answer for this open question');
      return;
    }

    try {
      const url = question
        ? `${API_URL}/api/admin/questions/${question.id}`
        : `${API_URL}/api/admin/questions`;

      const method = question ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        alert(question ? 'Question updated!' : 'Question created!');
        onClose();
      } else {
        const data = await response.json();
        alert('Error: ' + (data.error || 'Failed to save question'));
      }
    } catch (error) {
      console.error('Error saving question:', error);
      alert('Failed to save question');
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>
          {question ? '✏️ Edit Question' : '➕ Add New Question'}
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Question Type */}
          <label style={styles.label}>Question Type:</label>
          <select
            value={formData.question_type}
            onChange={(e) => handleChange('question_type', e.target.value)}
            style={styles.select}
          >
            <option value="multiple_choice">Multiple Choice (A/B/C/D)</option>
            <option value="open">Open Question (text answer)</option>
          </select>

          {/* Round */}
          <label style={styles.label}>Round:</label>
          <select
            value={formData.round_id}
            onChange={(e) => handleChange('round_id', parseInt(e.target.value))}
            style={styles.select}
          >
            {rounds.map((round) => (
              <option key={round.id} value={round.id}>
                Round {round.round_number}
              </option>
            ))}
          </select>

          {/* Image URL (optional) */}
          <label style={styles.label}>Image URL (optional):</label>
          <input
            type="text"
            value={formData.image_url}
            onChange={(e) => handleChange('image_url', e.target.value)}
            style={styles.input}
            placeholder="https://example.com/image.jpg"
          />
          {formData.image_url && (
            <div style={styles.imagePreview}>
              <img
                src={formData.image_url}
                alt="Preview"
                style={styles.previewImg}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
          )}

          {/* Question Text */}
          <label style={styles.label}>Question:</label>
          <textarea
            value={formData.question_text}
            onChange={(e) => handleChange('question_text', e.target.value)}
            style={styles.textarea}
            rows="3"
            placeholder="Enter your question..."
            required
          />

          {isOpen ? (
            <>
              {/* Open question: just needs the correct answer text */}
              <label style={styles.label}>Correct Answer (for grading reference):</label>
              <input
                type="text"
                value={formData.correct_answer}
                onChange={(e) => handleChange('correct_answer', e.target.value)}
                style={styles.input}
                placeholder="e.g. Amsterdam"
                required
              />
              <p style={styles.hint}>
                This is shown to the organizer when grading. Teams type their own answer.
              </p>
            </>
          ) : (
            <>
              {/* Multiple choice options */}
              <label style={styles.label}>Option A:</label>
              <input type="text" value={formData.option_a} onChange={(e) => handleChange('option_a', e.target.value)} style={styles.input} required />

              <label style={styles.label}>Option B:</label>
              <input type="text" value={formData.option_b} onChange={(e) => handleChange('option_b', e.target.value)} style={styles.input} required />

              <label style={styles.label}>Option C:</label>
              <input type="text" value={formData.option_c} onChange={(e) => handleChange('option_c', e.target.value)} style={styles.input} required />

              <label style={styles.label}>Option D:</label>
              <input type="text" value={formData.option_d} onChange={(e) => handleChange('option_d', e.target.value)} style={styles.input} required />

              <label style={styles.label}>Correct Answer:</label>
              <select value={formData.correct_answer} onChange={(e) => handleChange('correct_answer', e.target.value)} style={styles.select}>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </>
          )}

          <div style={styles.formButtons}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" style={styles.saveBtn}>
              {question ? 'Update' : 'Create'} Question
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', backgroundColor: '#1a1a2e', color: '#fff', padding: '20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' },
  title: { fontSize: '32px', margin: 0 },
  logoutButton: { padding: '10px 20px', backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' },
  quizSelector: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '25px', backgroundColor: '#16213e', padding: '15px 20px', borderRadius: '8px' },
  quizLabel: { color: '#a0a0a0', fontWeight: 'bold', fontSize: '16px' },
  quizSelect: { flex: 1, padding: '10px', fontSize: '16px', border: 'none', borderRadius: '5px', boxSizing: 'border-box' },
  actions: { marginBottom: '20px' },
  addButton: { padding: '12px 24px', backgroundColor: '#2ecc71', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' },
  tableContainer: { backgroundColor: '#16213e', borderRadius: '8px', padding: '20px', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHeader: { borderBottom: '2px solid #0f3460' },
  th: { padding: '12px', textAlign: 'left', color: '#a0a0a0', fontWeight: 'bold' },
  tableRow: { borderBottom: '1px solid #0f3460' },
  td: { padding: '15px 12px' },
  editButton: { padding: '8px 16px', backgroundColor: '#3498db', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', marginRight: '10px' },
  deleteButton: { padding: '8px 16px', backgroundColor: '#e74c3c', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' },
  emptyState: { textAlign: 'center', padding: '60px 20px' },
  emptyText: { textAlign: 'center', padding: '40px', color: '#a0a0a0', fontStyle: 'italic' },
  loadingText: { textAlign: 'center', fontSize: '18px', marginTop: '50px' },
  typeBadgeMC: { backgroundColor: '#0f3460', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  typeBadgeOpen: { backgroundColor: '#8e44ad', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' },
  imageBadge: { marginLeft: '6px', fontSize: '14px' },
  imagePreview: { marginTop: '8px', marginBottom: '5px' },
  previewImg: { maxWidth: '100%', maxHeight: '150px', borderRadius: '5px', objectFit: 'contain' },
  hint: { color: '#a0a0a0', fontSize: '13px', marginTop: '5px', fontStyle: 'italic' },
  // Modal
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalCard: { backgroundColor: '#16213e', padding: '30px', borderRadius: '10px', maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { marginTop: 0, marginBottom: '20px', fontSize: '24px' },
  label: { display: 'block', marginBottom: '5px', marginTop: '15px', color: '#a0a0a0' },
  input: { width: '100%', padding: '10px', fontSize: '16px', border: 'none', borderRadius: '5px', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '10px', fontSize: '16px', border: 'none', borderRadius: '5px', boxSizing: 'border-box', resize: 'vertical' },
  select: { width: '100%', padding: '10px', fontSize: '16px', border: 'none', borderRadius: '5px', boxSizing: 'border-box' },
  formButtons: { display: 'flex', gap: '10px', marginTop: '25px' },
  cancelBtn: { flex: 1, padding: '12px', backgroundColor: '#555', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' },
  saveBtn: { flex: 1, padding: '12px', backgroundColor: '#2ecc71', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' },
};

export default QuestionManager;