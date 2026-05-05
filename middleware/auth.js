const db = require('../db');

/**
 * Aktualisiert Session-Daten bei jedem Request aus der DB.
 * Stellt sicher, dass Admin-Aktivierungen sofort wirksam werden.
 */
function syncSession(req, res, next) {
  if (req.session && req.session.userId) {
    const user = db.prepare('SELECT role, status FROM users WHERE id = ?').get(req.session.userId);
    if (user) {
      req.session.userRole = user.role;
      req.session.userStatus = user.status;
    } else {
      return req.session.destroy(() => res.redirect('/login'));
    }
  }
  next();
}

/** Nur eingeloggt + aktiv (nicht pending, nicht banned). */
function isActive(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  if (req.session.userStatus === 'pending') return res.redirect('/pending');
  if (req.session.userStatus === 'banned') return res.redirect('/login?banned=1');
  next();
}

/** Nur Admins. */
function isAdmin(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  if (req.session.userRole !== 'admin') return res.redirect('/');
  next();
}

module.exports = { syncSession, isActive, isAdmin };
