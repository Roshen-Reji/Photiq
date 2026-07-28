const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'gradsync2026';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev-only-2026';

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token });
  } else {
    return res.status(401).json({ error: 'Invalid password' });
  }
});

// Simple endpoint to verify token validity on frontend load
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false });
  }

  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
    return res.json({ valid: true });
  } catch (err) {
    return res.status(401).json({ valid: false });
  }
});

module.exports = router;
