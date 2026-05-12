const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'valobooster.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    email        TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'booster',
    display_name TEXT,
    must_reset   INTEGER DEFAULT 1,
    created_at   INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS orders (
    id                TEXT PRIMARY KEY,
    stripe_session_id TEXT UNIQUE,
    service           TEXT NOT NULL,
    amount_cents      INTEGER NOT NULL,
    customer_email    TEXT,
    options           TEXT,
    addons            TEXT,
    promo             TEXT,
    status            TEXT DEFAULT 'pending',
    booster_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
    scheduled_start   INTEGER,
    scheduled_end     INTEGER,
    notes             TEXT,
    created_at        INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
`);

module.exports = db;
