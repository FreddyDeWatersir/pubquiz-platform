import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import { colors, commonStyles } from '../theme';

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
    if (!isAuthenticated) navigate('/admin');
  }, [navigate]);

  const fetchQuizzes = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/organizer/quizzes`);
      const data = await response.json();
      setQuizzes(data);
      if (data.length > 0) setSelectedQuizId(prev => prev || data[0].id);
      setLoading(false);
    } catch (error) { console.error('Error fetching quizzes:', error); setLoading(false); }
  }, []);

  const fetchQuestions = useCallback(async () => {
    if (!selectedQuizId) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/questions?quiz_id=${selectedQuizId}`);
      setQuestions(await response.json());
    } catch (error) { console.error('Error fetching questions:', error); }
  }, [selectedQuizId]);

  const fetchRounds = useCallback(async () => {
    if (!selectedQuizId) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/rounds?quiz_id=${selectedQuizId}`);
      setRounds(await response.json());
    } catch (error) { console.error('Error fetching rounds:', error); }
  }, [selectedQuizId]);

  useEffect(() => { fetchQuizzes(); }, [fetchQuizzes]);
  useEffect(() => {
    if (selectedQuizId) { fetchQuestions(); fetchRounds(); }
  }, [selectedQuizId, fetchQuestions, fetchRounds]);

  const handleDelete = async (questionId) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/questions/${questionId}`, { method: 'DELETE' });
      if (res.ok) fetchQuestions();
    } catch (error) { console.error('Error deleting question:', error); }
  };

  const handleEdit = (q) => { setEditingQuestion(q); setShowForm(true); };
  const handleAdd = () => { setEditingQuestion(null); setShowForm(true); };
  const handleCloseForm = () => { setShowForm(false); setEditingQuestion(null); fetchQuestions(); };
  const handleLogout = () => { localStorage.removeItem('adminAuth'); navigate('/admin'); };

  if (loading) {
    return <div style={st.page}><p style={st.loadingText}>Loading questions...</p></div>;
  }

  return (
    <div style={st.page}>
      <div style={st.header}>
        <div style={st.headerLeft}>
          <img src="/logo.png" alt="Logo" style={st.headerLogo} />
          <h1 style={st.title}>Question Manager</h1>
        </div>
        <button onClick={handleLogout} style={commonStyles.buttonDanger}>Logout</button>
      </div>

      <div style={st.quizSelector}>
        <label style={st.quizLabel}>Quiz:</label>
        <select value={selectedQuizId || ''} onChange={(e) => setSelectedQuizId(parseInt(e.target.value))} style={st.selectInput}>
          {quizzes.map((quiz) => (
            <option key={quiz.id} value={quiz.id}>{quiz.name} (Code: {quiz.access_code})</option>
          ))}
        </select>
      </div>

      {quizzes.length === 0 ? (
        <div style={st.emptyState}><p style={st.emptyText}>No quizzes found. Create one in the Organizer Dashboard first!</p></div>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <button onClick={handleAdd} style={commonStyles.buttonSecondary}>+ Add New Question</button>
          </div>

          <div style={st.tableWrap}>
            <table style={st.table}>
              <thead>
                <tr style={st.tableHeader}>
                  <th style={st.th}>Round</th><th style={st.th}>Type</th><th style={st.th}>Question</th><th style={st.th}>Answer</th><th style={st.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {questions.length === 0 ? (
                  <tr><td colSpan="5" style={st.emptyText}>No questions yet. Add your first!</td></tr>
                ) : questions.map((q) => (
                  <tr key={q.id} style={st.tableRow}>
                    <td style={st.td}>Round {q.round_number}</td>
                    <td style={st.td}>
                      <span style={q.question_type === 'open' ? commonStyles.badgePurple : commonStyles.badgeOrange}>
                        {q.question_type === 'open' ? 'Open' : 'MC'}
                      </span>
                      {q.image_url && <span style={{ marginLeft: '6px' }}>📷</span>}
                    </td>
                    <td style={st.td}>{q.question_text}</td>
                    <td style={st.td}>{q.correct_answer}</td>
                    <td style={st.td}>
                      <button onClick={() => handleEdit(q)} style={st.editBtn}>Edit</button>
                      <button onClick={() => handleDelete(q.id)} style={st.deleteBtn}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showForm && <QuestionForm question={editingQuestion} rounds={rounds} onClose={handleCloseForm} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// QUESTION FORM with drag & drop image upload
// ──────────────────────────────────────────────────────────
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
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleChange = (field, value) => setFormData({ ...formData, [field]: value });
  const isOpen = formData.question_type === 'open';

  const uploadImage = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }

    setUploading(true);
    const fd = new FormData();
    fd.append('image', file);

    try {
      const response = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: fd });
      const data = await response.json();
      if (response.ok) handleChange('image_url', data.imageUrl);
      else alert(data.error || 'Upload failed');
    } catch (error) { console.error('Upload error:', error); alert('Failed to upload image'); }
    finally { setUploading(false); }
  };

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) uploadImage(e.dataTransfer.files[0]); };
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleFileSelect = (e) => { if (e.target.files[0]) uploadImage(e.target.files[0]); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.question_text.trim()) { alert('Please enter a question'); return; }
    if (isOpen && !formData.correct_answer.trim()) { alert('Please enter the correct answer'); return; }

    try {
      const url = question ? `${API_URL}/api/admin/questions/${question.id}` : `${API_URL}/api/admin/questions`;
      const response = await fetch(url, {
        method: question ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) onClose();
      else { const data = await response.json(); alert('Error: ' + (data.error || 'Failed to save')); }
    } catch (error) { console.error('Error saving question:', error); alert('Failed to save question'); }
  };

  return (
    <div style={st.modalOverlay} onClick={onClose}>
      <div style={st.modalCard} onClick={(e) => e.stopPropagation()}>
        <h2 style={st.modalTitle}>{question ? 'Edit Question' : 'Add New Question'}</h2>

        <form onSubmit={handleSubmit}>
          <label style={st.label}>Question Type:</label>
          <select value={formData.question_type} onChange={(e) => handleChange('question_type', e.target.value)} style={st.selectInput}>
            <option value="multiple_choice">Multiple Choice (A/B/C/D)</option>
            <option value="open">Open Question (text answer)</option>
          </select>

          <label style={st.label}>Round:</label>
          <select value={formData.round_id} onChange={(e) => handleChange('round_id', parseInt(e.target.value))} style={st.selectInput}>
            {rounds.map((r) => <option key={r.id} value={r.id}>Round {r.round_number}</option>)}
          </select>

          {/* Drag & Drop Image Upload */}
          <label style={st.label}>Image (optional):</label>
          <div
            style={{
              ...st.dropZone,
              borderColor: dragOver ? colors.primary : colors.border,
              backgroundColor: dragOver ? colors.primaryMuted : colors.bgInput,
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <p style={st.dropText}>Uploading...</p>
            ) : formData.image_url ? (
              <div style={st.previewWrap}>
                <img src={formData.image_url} alt="Preview" style={st.previewImg} onError={(e) => { e.target.style.display = 'none'; }} />
                <button type="button" onClick={(e) => { e.stopPropagation(); handleChange('image_url', ''); }} style={st.removeImgBtn}>✕ Remove</button>
              </div>
            ) : (
              <div style={st.dropContent}>
                <span style={{ fontSize: '32px' }}>📷</span>
                <p style={st.dropText}>Drag & drop an image here, or click to browse</p>
                <p style={st.dropHint}>JPG, PNG, GIF, WebP — max 5MB</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
          </div>

          <label style={st.label}>Question:</label>
          <textarea value={formData.question_text} onChange={(e) => handleChange('question_text', e.target.value)} style={st.textarea} rows="3" placeholder="Enter your question..." required />

          {isOpen ? (
            <>
              <label style={st.label}>Correct Answer (reference for grading):</label>
              <input type="text" value={formData.correct_answer} onChange={(e) => handleChange('correct_answer', e.target.value)} style={st.inputField} placeholder="e.g. Amsterdam" required />
              <p style={st.hint}>Shown to the organizer when grading. Teams type their own answer.</p>
            </>
          ) : (
            <>
              {['a', 'b', 'c', 'd'].map((opt) => (
                <React.Fragment key={opt}>
                  <label style={st.label}>Option {opt.toUpperCase()}:</label>
                  <input type="text" value={formData[`option_${opt}`]} onChange={(e) => handleChange(`option_${opt}`, e.target.value)} style={st.inputField} required />
                </React.Fragment>
              ))}
              <label style={st.label}>Correct Answer:</label>
              <select value={formData.correct_answer} onChange={(e) => handleChange('correct_answer', e.target.value)} style={st.selectInput}>
                <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
              </select>
            </>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
            <button type="button" onClick={onClose} style={{ ...commonStyles.buttonGhost, flex: 1 }}>Cancel</button>
            <button type="submit" style={{ ...commonStyles.buttonPrimary, flex: 1 }}>{question ? 'Update' : 'Create'} Question</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const st = {
  page: { ...commonStyles.pageContainer },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  headerLogo: { height: '48px', width: 'auto' },
  title: { fontSize: '28px', margin: 0, fontWeight: '700' },
  loadingText: { textAlign: 'center', fontSize: '18px', marginTop: '50px', color: colors.textMuted },
  quizSelector: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '25px', ...commonStyles.card, padding: '15px 20px' },
  quizLabel: { color: colors.textMuted, fontWeight: '700', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  tableWrap: { ...commonStyles.card, overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  tableHeader: { borderBottom: `2px solid ${colors.border}` },
  th: { padding: '12px', textAlign: 'left', color: colors.textMuted, fontWeight: '700', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  tableRow: { borderBottom: `1px solid ${colors.border}` },
  td: { padding: '14px 12px', fontSize: '14px' },
  editBtn: { padding: '6px 14px', backgroundColor: colors.primaryMuted, color: colors.primary, border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', marginRight: '8px' },
  deleteBtn: { padding: '6px 14px', backgroundColor: colors.errorMuted, color: colors.error, border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' },
  emptyState: { textAlign: 'center', padding: '60px 20px' },
  emptyText: { textAlign: 'center', padding: '40px', color: colors.textMuted, fontStyle: 'italic' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalCard: { ...commonStyles.card, maxWidth: '600px', width: '92%', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { marginTop: 0, marginBottom: '20px', fontSize: '22px', fontWeight: '700' },
  label: { display: 'block', marginBottom: '6px', marginTop: '16px', color: colors.textMuted, fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' },
  inputField: { ...commonStyles.input },
  textarea: { ...commonStyles.input, resize: 'vertical', minHeight: '80px' },
  selectInput: { ...commonStyles.input, cursor: 'pointer' },
  hint: { color: colors.textDim, fontSize: '13px', marginTop: '6px', fontStyle: 'italic' },
  dropZone: { border: `2px dashed ${colors.border}`, borderRadius: '12px', padding: '24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s ease', minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dropContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' },
  dropText: { color: colors.textMuted, fontSize: '14px', margin: 0 },
  dropHint: { color: colors.textDim, fontSize: '12px', margin: 0 },
  previewWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' },
  previewImg: { maxWidth: '100%', maxHeight: '180px', borderRadius: '8px', objectFit: 'contain' },
  removeImgBtn: { padding: '6px 16px', backgroundColor: colors.errorMuted, color: colors.error, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
};

export default QuestionManager;
