const express = require('express');
const router = express.Router();
const { createToken, checkPassword, verifyToken } = require('../auth');

// POST /api/auth/login  { password }  ->  { token }
router.post('/login', (req, res) => {
  const { password } = req.body || {};

  if (!checkPassword(password)) {
    return setTimeout(() => res.status(401).json({ error: 'Incorrect password' }), 400);
  }

  res.json({ token: createToken() });
});

// GET /api/auth/check -> 200 if the caller's token is still valid
router.get('/check', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true });
});

module.exports = router;