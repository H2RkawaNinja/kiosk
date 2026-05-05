const express = require('express');
const { isActive } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// Alle Nachrichten-Routen erfordern aktiven Account
router.use(isActive);

// GET /messages — Posteingang (alle Gespräche)
router.get('/', (req, res) => {
  const uid = req.session.userId;

  // Letzten Satz pro Gespräch (listing_id + Gesprächspartner)
  const conversations = db.prepare(`
    SELECT
      m.listing_id,
      CASE WHEN m.from_user_id = ? THEN m.to_user_id ELSE m.from_user_id END AS other_user_id,
      MAX(m.id) AS last_msg_id,
      SUM(CASE WHEN m.to_user_id = ? AND m.read = 0 THEN 1 ELSE 0 END) AS unread_count,
      l.title AS listing_title
    FROM messages m
    JOIN listings l ON l.id = m.listing_id
    WHERE m.from_user_id = ? OR m.to_user_id = ?
    GROUP BY m.listing_id, CASE WHEN m.from_user_id = ? THEN m.to_user_id ELSE m.from_user_id END
    ORDER BY last_msg_id DESC
  `).all(uid, uid, uid, uid, uid);

  // Letzten Nachrichten-Text für jedes Gespräch holen
  const withPreview = conversations.map(conv => {
    const last = db.prepare('SELECT content, created_at FROM messages WHERE id = ?').get(conv.last_msg_id);
    return { ...conv, preview: last ? last.content : '', last_at: last ? last.created_at : null };
  });

  res.render('messages/inbox', { conversations: withPreview });
});

// GET /messages/:listingId/:otherUserId — Gespräch
router.get('/:listingId/:otherUserId', (req, res) => {
  const uid      = req.session.userId;
  const listingId  = parseInt(req.params.listingId, 10);
  const otherUserId = parseInt(req.params.otherUserId, 10);

  if (isNaN(listingId) || isNaN(otherUserId)) return res.redirect('/messages');
  if (otherUserId === uid) return res.redirect('/messages');

  const listing = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'approved'").get(listingId);
  if (!listing) return res.redirect('/messages');

  // Nur Beteiligte dürfen lesen (Käufer <-> Verkäufer)
  const isOwner = listing.user_id === uid;
  const isOther = listing.user_id === otherUserId || otherUserId === uid;
  if (!isOwner && listing.user_id !== otherUserId) return res.redirect('/messages');

  // Nachrichten laden
  const msgs = db.prepare(`
    SELECT * FROM messages
    WHERE listing_id = ?
      AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
    ORDER BY id ASC
  `).all(listingId, uid, otherUserId, otherUserId, uid);

  // Als gelesen markieren
  db.prepare(`
    UPDATE messages SET read = 1
    WHERE listing_id = ? AND from_user_id = ? AND to_user_id = ? AND read = 0
  `).run(listingId, otherUserId, uid);

  res.render('messages/thread', { listing, msgs, otherUserId, error: null });
});

// POST /messages/:listingId/:otherUserId — Nachricht senden
router.post('/:listingId/:otherUserId', (req, res) => {
  const uid       = req.session.userId;
  const listingId  = parseInt(req.params.listingId, 10);
  const otherUserId = parseInt(req.params.otherUserId, 10);

  if (isNaN(listingId) || isNaN(otherUserId)) return res.redirect('/messages');
  if (otherUserId === uid) return res.redirect('/messages');

  const listing = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'approved'").get(listingId);
  if (!listing) return res.redirect('/messages');

  // Berechtigung: nur Inserat-Inhaber oder derjenige, der zuerst schreibt
  if (listing.user_id !== uid && listing.user_id !== otherUserId) return res.redirect('/messages');

  const content = (req.body.content || '').trim();
  const msgs = db.prepare(`
    SELECT * FROM messages
    WHERE listing_id = ?
      AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
    ORDER BY id ASC
  `).all(listingId, uid, otherUserId, otherUserId, uid);

  if (!content) {
    return res.render('messages/thread', { listing, msgs, otherUserId, error: 'Nachricht darf nicht leer sein.' });
  }
  if (content.length > 1000) {
    return res.render('messages/thread', { listing, msgs, otherUserId, error: 'Nachricht zu lang (max. 1000 Zeichen).' });
  }

  // Empfänger bestimmen: ich schreibe an otherUserId
  db.prepare(`
    INSERT INTO messages (listing_id, from_user_id, to_user_id, content)
    VALUES (?, ?, ?, ?)
  `).run(listingId, uid, otherUserId, content);

  res.redirect(`/messages/${listingId}/${otherUserId}`);
});

module.exports = router;
