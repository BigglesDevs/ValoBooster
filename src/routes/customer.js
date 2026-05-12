const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');

const router = express.Router();
const SESSION_DAYS = 30;
const COOKIE_OPTS  = {
  httpOnly: true,
  sameSite: 'strict',
  secure:   process.env.NODE_ENV !== 'development',
  maxAge:   SESSION_DAYS * 86400 * 1000,
};

function requireCustomer(req, res, next) {
  const token = req.cookies?.cvsession;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  const row = db.prepare(`
    SELECT c.id, c.email, c.display_name
    FROM customer_sessions cs
    JOIN customers c ON cs.customer_id = c.id
    WHERE cs.token = ? AND cs.expires_at > unixepoch()
  `).get(token);
  if (!row) { res.clearCookie('cvsession'); return res.status(401).json({ error: 'Session expired' }); }
  req.customer = row;
  next();
}

// Claim any existing email-matched orders for this customer
function claimOrders(customerId, email) {
  db.prepare("UPDATE orders SET customer_id=? WHERE customer_email=? AND customer_id IS NULL")
    .run(customerId, email);
}

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', express.json(), async (req, res) => {
  const { email, password, display_name } = req.body || {};
  if (!email || !password || password.length < 8)
    return res.status(400).json({ error: 'Email and password (min 8 chars) required' });

  const existing = db.prepare('SELECT id FROM customers WHERE email=?').get(email.toLowerCase().trim());
  if (existing) return res.status(400).json({ error: 'An account with that email already exists' });

  const hash = await bcrypt.hash(password, 12);
  const id   = uuidv4();
  db.prepare('INSERT INTO customers (id,email,password_hash,display_name) VALUES (?,?,?,?)')
    .run(id, email.toLowerCase().trim(), hash, display_name?.trim() || null);

  claimOrders(id, email.toLowerCase().trim());

  const token   = uuidv4();
  const expires = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  db.prepare('INSERT INTO customer_sessions (token,customer_id,expires_at) VALUES (?,?,?)').run(token, id, expires);
  res.cookie('cvsession', token, COOKIE_OPTS);
  res.json({ ok: true });
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', express.json(), async (req, res) => {
  const { email, password } = req.body || {};
  const customer = db.prepare('SELECT * FROM customers WHERE email=?').get((email || '').toLowerCase().trim());
  if (!customer || !(await bcrypt.compare(password || '', customer.password_hash)))
    return res.status(401).json({ error: 'Invalid email or password' });

  claimOrders(customer.id, customer.email);

  const token   = uuidv4();
  const expires = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  db.prepare('INSERT INTO customer_sessions (token,customer_id,expires_at) VALUES (?,?,?)').run(token, customer.id, expires);
  res.cookie('cvsession', token, COOKIE_OPTS);
  res.json({ ok: true, display_name: customer.display_name, email: customer.email });
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  db.prepare('DELETE FROM customer_sessions WHERE token=?').run(req.cookies?.cvsession);
  res.clearCookie('cvsession');
  res.json({ ok: true });
});

// ── Me ────────────────────────────────────────────────────────────────────────
router.get('/me', requireCustomer, (req, res) => res.json(req.customer));

// ── Orders ────────────────────────────────────────────────────────────────────
router.get('/orders', requireCustomer, (req, res) => {
  const orders = db.prepare(`
    SELECT id, service, amount_cents, status, options, addons,
           scheduled_start, scheduled_end, created_at
    FROM orders
    WHERE customer_id=? OR customer_email=?
    ORDER BY created_at DESC
  `).all(req.customer.id, req.customer.email);
  res.json(orders);
});

module.exports = router;
