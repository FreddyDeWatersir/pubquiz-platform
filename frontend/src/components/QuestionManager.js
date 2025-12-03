import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

function QuestionManager() {
  // State for storing data
  const [questions, setQuestions] = useState([]);      // All questions from database
  const [rounds, setRounds] = useState([]);            // All rounds from database
  const [loading, setLoading] = useState(true);        // Show loading spinner?
  const [showForm, setShowForm] = useState(false);     // Show add/edit form?
  const [editingQuestion, setEditingQuestion] = useState(null); // Which question are we editing?
  
  const navigate = useNavigate();

  // Check if user is authenticated
  useEffect(() => {
    const isAuthenticated = localStorage.getItem('adminAuth') === 'true';
    if (!isAuthenticated) {
      // Not logged in, redirect to login page
      navigate('/admin');
    }
  }, [navigate]);

  // Fetch questions and rounds when component loads
  useEffect(() => {
    fetchQuestions();
    fetchRounds();
  }, []);

  // Function to get all questions from backend
  const fetchQuestions = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/questions`);
      const data = await response.json();
      setQuestions(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching questions:', error);
      setLoading(false);
    }
  };

  // Function to get all rounds from backend
  const fetchRounds = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/rounds`);
      const data = await response.json();
      setRounds(data);
    } catch (error) {
      console.error('Error fetching rounds:', error);
    }
  };

  // Function to delete a question
  const handleDelete = async (questionId) => {
    // Confirm before deleting
    if (!window.confirm('Are you sure you want to delete this question?')) {
      return; // User clicked "Cancel"
    }

    try {
      const response = await fetch(`${API_URL}/api/admin/questions/${questionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('Question deleted successfully!');
        fetchQuestions(); // Reload the list
      } else {
        alert('Failed to delete question');
      }
    } catch (error) {
      console.error('Error deleting question:', error);
      alert('Failed to delete question');
    }
  };

  // Function to start editing a question
  const handleEdit = (question) => {
    setEditingQuestion(question);
    setShowForm(true);
  };

  // Function to start adding a new question
  const handleAdd = () => {
    setEditingQuestion(null); // Not editing, so clear this
    setShowForm(true);
  };

  // Function to close the form
  const handleCloseForm = () => {
    setShowForm(false);
    setEditingQuestion(null);
    fetchQuestions(); // Reload questions in case one was added/edited
  };

  // Function to logout
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
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>📝 Question Manager</h1>
        <button onClick={handleLogout} style={styles.logoutButton}>
          Logout
        </button>
      </div>

      {/* Action Buttons */}
      <div style={styles.actions}>
        <button onClick={handleAdd} style={styles.addButton}>
          ➕ Add New Question
        </button>
      </div>

      {/* Questions Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.tableHeader}>
              <th style={styles.th}>Question</th>
              <th style={styles.th}>Round</th>
              <th style={styles.th}>Correct</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {questions.length === 0 ? (
              <tr>
                <td colSpan="4" style={styles.emptyText}>
                  No questions yet. Add your first question!
                </td>
              </tr>
            ) : (
              questions.map((question) => (
                <tr key={question.id} style={styles.tableRow}>
                  <td style={styles.td}>{question.question_text}</td>
                  <td style={styles.td}>Round {question.round_number}</td>
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

      {/* Question Form Modal */}
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

// QuestionForm Component (nested inside same file for simplicity)
function QuestionForm({ question, rounds, onClose }) {
  // Form state - initialize with existing question data if editing
  const [formData, setFormData] = useState({
    round_id: question?.round_id || (rounds[0]?.id || 1),
    question_text: question?.question_text || '',
    option_a: question?.option_a || '',
    option_b: question?.option_b || '',
    option_c: question?.option_c || '',
    option_d: question?.option_d || '',
    correct_answer: question?.correct_answer || 'A',
  });

  // Update form field
  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  // Submit form (create or update)
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.question_text.trim()) {
      alert('Please enter a question');
      return;
    }

    try {
      const url = question
        ? `${API_URL}/api/admin/questions/${question.id}` // Updating
        : `${API_URL}/api/admin/questions`;                // Creating

      const method = question ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        alert(question ? 'Question updated!' : 'Question created!');
        onClose(); // Close form and reload list
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
    // Modal overlay (darkens background)
    <div style={styles.modalOverlay} onClick={onClose}>
      {/* Form card (clicking it doesn't close modal) */}
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>
          {question ? '✏️ Edit Question' : '➕ Add New Question'}
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Round Selection */}
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

          {/* Options */}
          <label style={styles.label}>Option A:</label>
          <input
            type="text"
            value={formData.option_a}
            onChange={(e) => handleChange('option_a', e.target.value)}
            style={styles.input}
            required
          />

          <label style={styles.label}>Option B:</label>
          <input
            type="text"
            value={formData.option_b}
            onChange={(e) => handleChange('option_b', e.target.value)}
            style={styles.input}
            required
          />

          <label style={styles.label}>Option C:</label>
          <input
            type="text"
            value={formData.option_c}
            onChange={(e) => handleChange('option_c', e.target.value)}
            style={styles.input}
            required
          />

          <label style={styles.label}>Option D:</label>
          <input
            type="text"
            value={formData.option_d}
            onChange={(e) => handleChange('option_d', e.target.value)}
            style={styles.input}
            required
          />

          {/* Correct Answer */}
          <label style={styles.label}>Correct Answer:</label>
          <select
            value={formData.correct_answer}
            onChange={(e) => handleChange('correct_answer', e.target.value)}
            style={styles.select}
          >
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>

          {/* Buttons */}
          <div style={styles.formButtons}>
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Cancel
            </button>
            <button type="submit" style={styles.saveButton}>
              {question ? 'Update' : 'Create'} Question
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Styles
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#1a1a2e',
    color: '#fff',
    padding: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
  },
  title: {
    fontSize: '32px',
    margin: 0,
  },
  logoutButton: {
    padding: '10px 20px',
    backgroundColor: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  actions: {
    marginBottom: '20px',
  },
  addButton: {
    padding: '12px 24px',
    backgroundColor: '#2ecc71',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  tableContainer: {
    backgroundColor: '#16213e',
    borderRadius: '8px',
    padding: '20px',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    borderBottom: '2px solid #0f3460',
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    color: '#a0a0a0',
    fontWeight: 'bold',
  },
  tableRow: {
    borderBottom: '1px solid #0f3460',
  },
  td: {
    padding: '15px 12px',
  },
  editButton: {
    padding: '8px 16px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    marginRight: '10px',
  },
  deleteButton: {
    padding: '8px 16px',
    backgroundColor: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  emptyText: {
    textAlign: 'center',
    padding: '40px',
    color: '#a0a0a0',
    fontStyle: 'italic',
  },
  loadingText: {
    textAlign: 'center',
    fontSize: '18px',
    marginTop: '50px',
  },
  // Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalCard: {
    backgroundColor: '#16213e',
    padding: '30px',
    borderRadius: '10px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    marginTop: 0,
    marginBottom: '20px',
    fontSize: '24px',
  },
  label: {
    display: 'block',
    marginBottom: '5px',
    marginTop: '15px',
    color: '#a0a0a0',
  },
  input: {
    width: '100%',
    padding: '10px',
    fontSize: '16px',
    border: 'none',
    borderRadius: '5px',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px',
    fontSize: '16px',
    border: 'none',
    borderRadius: '5px',
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  select: {
    width: '100%',
    padding: '10px',
    fontSize: '16px',
    border: 'none',
    borderRadius: '5px',
    boxSizing: 'border-box',
  },
  formButtons: {
    display: 'flex',
    gap: '10px',
    marginTop: '25px',
  },
  cancelButton: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#555',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
  },
  saveButton: {
    flex: 1,
    padding: '12px',
    backgroundColor: '#2ecc71',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
  },
};

export default QuestionManager;