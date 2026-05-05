const express = require('express');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const { isActive } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

const CATEGORIES = ['WAFFEN', 'SUBSTANZEN', 'DOKUMENTE', 'DIENSTLEISTUNGEN', 'SONSTIGES'];

// Multer: Fotos in public/uploads/ speichern
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../public/uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Nur Bilder erlaubt (jpg, png, webp, gif).'));
    }
  }
});

// GET /listings/new
router.get('/new', isActive, (req, res) => {
  res.render('listings/new', { errors: [], old: {} });
});

// POST /listings/new
router.post('/new', isActive, upload.single('photo'), (req, res) => {
  const { title, description, price, category } = req.body;
  const errors = [];

  if (!title || title.trim().length === 0) errors.push({ msg: 'Titel ist erforderlich.' });
  if (title && title.trim().length > 80) errors.push({ msg: 'Titel darf maximal 80 Zeichen haben.' });
  if (!description || description.trim().length === 0) errors.push({ msg: 'Beschreibung ist erforderlich.' });
  if (description && description.trim().length > 1000) errors.push({ msg: 'Beschreibung darf maximal 1000 Zeichen haben.' });
  if (!price || price.trim().length === 0) errors.push({ msg: 'Preis ist erforderlich.' });
  if (!category || !CATEGORIES.includes(category)) errors.push({ msg: 'Ungültige Kategorie.' });

  if (errors.length > 0) {
    return res.render('listings/new', { errors, old: req.body });
  }

  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  db.prepare(`
    INSERT INTO listings (user_id, title, description, price, category, status, image_path)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(req.session.userId, title.trim(), description.trim(), price.trim(), category, imagePath);

  res.redirect('/?submitted=1');
});

// GET /listings/:id
router.get('/:id', isActive, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/');

  const listing = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'approved'").get(id);
  if (!listing) return res.redirect('/');

  res.render('listings/show', { listing, reported: req.query.reported === '1' });
});

// POST /listings/:id/report-sold — Verkauft-Meldung an Admin
router.post('/:id/report-sold', isActive, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/');

  const listing = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'approved'").get(id);
  if (!listing) return res.redirect('/');

  // Nur der Ersteller darf melden
  if (listing.user_id !== req.session.userId) return res.redirect(`/listings/${id}`);

  db.prepare('UPDATE listings SET sold_reported = 1 WHERE id = ?').run(id);
  res.redirect(`/listings/${id}?reported=1`);
});

module.exports = router;
