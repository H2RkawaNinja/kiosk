const express = require('express');
const { generateCode, hashCode } = require('../utils/crypto');
const db = require('../db');

const router = express.Router();

// GET /register
router.get('/register', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/');
  res.render('register', { generatedCode: null });
});

// POST /register — generiert neuen Code
router.post('/register', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/');

  let code, hmac, attempts = 0;
  do {
    code = generateCode();
    hmac = hashCode(code);
    const existing = db.prepare('SELECT id FROM users WHERE code_hmac = ?').get(hmac);
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  db.prepare("INSERT INTO users (code_hmac, role, status) VALUES (?, 'user', 'pending')").run(hmac);
  res.render('register', { generatedCode: code });
});

// GET /login
router.get('/login', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/');
  res.render('login', { error: null, banned: req.query.banned === '1' });
});

// POST /login
router.post('/login', (req, res) => {
  const code = (req.body.code || '').trim();

  if (!/^\d{8}$/.test(code)) {
    return res.render('login', { error: 'Ungültiger Code. Genau 8 Ziffern erforderlich.', banned: false });
  }

  const hmac = hashCode(code);
  const user = db.prepare('SELECT * FROM users WHERE code_hmac = ?').get(hmac);

  if (!user) {
    return res.render('login', { error: 'Unbekannter Zugangscode.', banned: false });
  }

  if (user.status === 'banned') {
    return res.render('login', { error: 'Zugang verweigert.', banned: true });
  }

  req.session.regenerate((err) => {
    if (err) return res.render('login', { error: 'Session-Fehler.', banned: false });
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userStatus = user.status;

    if (user.status === 'pending') return res.redirect('/pending');
    res.redirect('/');
  });
});

// POST /logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
