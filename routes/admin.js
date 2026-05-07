const express = require('express');
const { isAdmin } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// Alle Admin-Routen erfordern Admin-Rechte
router.use(isAdmin);

// GET /admin — Übersichts-Panel
router.get('/', (req, res) => {
  const pendingUsers     = db.prepare("SELECT * FROM users WHERE status = 'pending' ORDER BY created_at DESC").all();
  const allUsers         = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
  const pendingListings  = db.prepare("SELECT * FROM listings WHERE status = 'pending' ORDER BY created_at DESC").all();
  const approvedListings = db.prepare("SELECT * FROM listings WHERE status = 'approved' ORDER BY created_at DESC").all();
  const soldReported     = db.prepare("SELECT * FROM listings WHERE sold_reported = 1 AND status = 'approved' ORDER BY created_at DESC").all();

  res.render('admin/panel', { pendingUsers, allUsers, pendingListings, approvedListings, soldReported });
});

// POST /admin/users/:id/activate
router.post('/users/:id/activate', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isNaN(id)) {
    db.prepare("UPDATE users SET status = 'active' WHERE id = ? AND role != 'admin'").run(id);
  }
  res.redirect('/admin');
});

// POST /admin/users/:id/ban
router.post('/users/:id/ban', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isNaN(id)) {
    db.prepare("UPDATE users SET status = 'banned' WHERE id = ? AND role != 'admin'").run(id);
  }
  res.redirect('/admin');
});

// POST /admin/users/:id/reject (pending user ablehnen)
router.post('/users/:id/reject', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isNaN(id)) {
    db.prepare('DELETE FROM users WHERE id = ? AND status = ?').run(id, 'pending');
  }
  res.redirect('/admin');
});

// POST /admin/listings/:id/approve
router.post('/listings/:id/approve', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isNaN(id)) {
    db.prepare("UPDATE listings SET status = 'approved' WHERE id = ?").run(id);
  }
  res.redirect('/admin');
});

// POST /admin/listings/:id/reject
router.post('/listings/:id/reject', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isNaN(id)) {
    db.prepare("UPDATE listings SET status = 'rejected' WHERE id = ?").run(id);
  }
  res.redirect('/admin');
});

// POST /admin/listings/:id/delete
router.post('/listings/:id/delete', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isNaN(id)) {
    db.prepare('DELETE FROM messages WHERE listing_id = ?').run(id);
    db.prepare('DELETE FROM listings WHERE id = ?').run(id);
  }
  res.redirect('/admin');
});

// POST /admin/users/:id/delete (bestehenden Benutzer löschen)
router.post('/users/:id/delete', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!isNaN(id)) {
    // Optional: zugehörige Nachrichten etc. löschen
    db.prepare('DELETE FROM users WHERE id = ? AND role != "admin"').run(id);
  }
  res.redirect('/admin');
});

// GET /admin/chats — alle Gespräche
router.get('/chats', (req, res) => {
  const conversations = db.prepare(`
    SELECT
      m.listing_id,
      MIN(m.from_user_id, m.to_user_id) AS user1,
      MAX(m.from_user_id, m.to_user_id) AS user2,
      MAX(m.id) AS last_msg_id,
      COUNT(*) AS msg_count,
      l.title AS listing_title
    FROM messages m
    JOIN listings l ON l.id = m.listing_id
    GROUP BY m.listing_id, MIN(m.from_user_id, m.to_user_id), MAX(m.from_user_id, m.to_user_id)
    ORDER BY last_msg_id DESC
  `).all();

  const withPreview = conversations.map(conv => {
    const last = db.prepare('SELECT content, created_at FROM messages WHERE id = ?').get(conv.last_msg_id);
    return { ...conv, preview: last ? last.content : '', last_at: last ? last.created_at : null };
  });

  res.render('admin/chats', { conversations: withPreview });
});

// GET /admin/chats/:listingId/:user1/:user2 — Chat zwischen zwei Usern lesen
router.get('/chats/:listingId/:user1/:user2', (req, res) => {
  const listingId = parseInt(req.params.listingId, 10);
  const u1        = parseInt(req.params.user1, 10);
  const u2        = parseInt(req.params.user2, 10);

  if (isNaN(listingId) || isNaN(u1) || isNaN(u2)) return res.redirect('/admin/chats');

  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) return res.redirect('/admin/chats');

  const msgs = db.prepare(`
    SELECT * FROM messages
    WHERE listing_id = ?
      AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
    ORDER BY id ASC
  `).all(listingId, u1, u2, u2, u1);

  res.render('messages/thread', { listing, msgs, otherUserId: u2, error: null, adminView: true, adminBackUser1: u1 });
});

module.exports = router;
