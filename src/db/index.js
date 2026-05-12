const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');

const dbDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, 'valobooster.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'booster',
    display_name  TEXT,
    must_reset    INTEGER DEFAULT 1,
    created_at    INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS orders (
    id                TEXT PRIMARY KEY,
    stripe_session_id TEXT UNIQUE,
    payment_intent_id TEXT UNIQUE,
    service           TEXT NOT NULL,
    amount_cents      INTEGER NOT NULL,
    customer_email    TEXT,
    options           TEXT,
    addons            TEXT,
    promo             TEXT,
    scheduled_start   INTEGER,
    status            TEXT DEFAULT 'pending',
    booster_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
    scheduled_end     INTEGER,
    notes             TEXT,
    created_at        INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blocked_dates (
    id         TEXT PRIMARY KEY,
    booster_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    UNIQUE(booster_id, date)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT,
    discord_id    TEXT UNIQUE,
    google_id     TEXT UNIQUE,
    avatar_url    TEXT,
    created_at    INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS customer_sessions (
    token       TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  INTEGER DEFAULT (unixepoch())
  );
`);

// Migrations for existing DBs
for (const col of [
  'ALTER TABLE orders ADD COLUMN payment_intent_id TEXT',
  'ALTER TABLE orders ADD COLUMN scheduled_start INTEGER',
  'ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL',
  'ALTER TABLE customers ADD COLUMN discord_id TEXT',
  'ALTER TABLE customers ADD COLUMN google_id TEXT',
  'ALTER TABLE customers ADD COLUMN avatar_url TEXT',
]) { try { db.exec(col); } catch (_) {} }

module.exports = db;
