require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');
const { generateCode, hashCode } = require('./utils/crypto');
const { syncSession, isActive } = require('./middleware/auth');

const app = express();

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Statische Dateien
app.use(express.static(path.join(__dirname, 'public')));

// Body-Parser
app.use(express.urlencoded({ extended: false }));

// Session
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  console.warn('[WARNUNG] SESSION_SECRET nicht gesetzt — verwende unsicheren Standard.');
  return 'dev-session-secret-change-me-2024';
})();

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 Stunden
  }
}));

// Session-Daten bei jedem Request aus DB aktualisieren
app.use(syncSession);

// Session + Unread-Count global in Templates verfügbar machen
app.use((req, res, next) => {
  res.locals.session = req.session;
  if (req.session && req.session.userId && req.session.userStatus === 'active') {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE to_user_id = ? AND read = 0').get(req.session.userId);
    res.locals.unreadCount = row ? row.cnt : 0;
  } else {
    res.locals.unreadCount = 0;
  }
  next();
});

// Routen einbinden
app.use('/', require('./routes/auth'));
app.use('/listings', require('./routes/listings'));
app.use('/messages', require('./routes/messages'));
app.use('/admin', require('./routes/admin'));

// Startseite
app.get('/', isActive, (req, res) => {
  const search   = (req.query.search   || '').trim();
  const category = (req.query.category || '').trim();

  let query = "SELECT * FROM listings WHERE status = 'approved'";
  const params = [];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  if (search) {
    query += ' AND (title LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY created_at DESC';

  const listings = db.prepare(query).all(...params);
  const submitted = req.query.submitted === '1';

  res.render('index', { listings, search, filterCategory: category, submitted });
});

// Warte-Seite für nicht freigeschaltete User
app.get('/pending', (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  if (req.session.userStatus !== 'pending') return res.redirect('/');
  res.render('pending');
});

// Ersten Admin automatisch erstellen, falls noch keiner existiert
const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
if (!adminExists) {
  const code = generateCode();
  const hmac = hashCode(code);
  db.prepare("INSERT INTO users (code_hmac, role, status) VALUES (?, 'admin', 'active')").run(hmac);
  console.log('\n' + '='.repeat(52));
  console.log('  ERSTER START — ADMIN ZUGANGSCODE:');
  console.log('  >>> ' + code + ' <<<');
  console.log('  (Dieser Code wird nur EINMAL angezeigt!)');
  console.log('='.repeat(52) + '\n');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Schwarzmarkt] Server läuft auf http://localhost:${PORT}`);
});
