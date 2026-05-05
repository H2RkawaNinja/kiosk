const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'schwarzmarkt.db'));

// WAL-Modus für bessere Performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code_hmac  TEXT    NOT NULL UNIQUE,
    role       TEXT    NOT NULL DEFAULT 'user',
    status     TEXT    NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS listings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL,
    price       TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'pending',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Neue Spalten ergänzen (falls noch nicht vorhanden)
['image_path TEXT', 'sold_reported INTEGER NOT NULL DEFAULT 0'].forEach(col => {
  try { db.exec(`ALTER TABLE listings ADD COLUMN ${col}`); } catch (_) { /* existiert bereits */ }
});

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id   INTEGER NOT NULL,
    from_user_id INTEGER NOT NULL,
    to_user_id   INTEGER NOT NULL,
    content      TEXT    NOT NULL,
    read         INTEGER NOT NULL DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (listing_id)   REFERENCES listings(id),
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id)   REFERENCES users(id)
  );
`);

module.exports = db;
