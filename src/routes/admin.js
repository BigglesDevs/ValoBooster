const express  = require('express');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db       = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const SESSION_DAYS = 7;
const COOKIE_OPTS  = {
  httpOnly: true,
  sameSite: 'strict',
  secure:   process.env.NODE_ENV !== 'development',
  maxAge:   SESSION_DAYS * 86400 * 1000,
};

// ── First-run setup ────────────────────────────────────────────────────────────
router.get('/setup', (req, res) => {
  const exists = db.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get();
  if (exists) return res.redirect('/admin/login');
  res.sendFile('setup.html', { root: 'public/admin' });
});

router.post('/api/setup', express.json(), async (req, res) => {
  const exists = db.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get();
  if (exists) return res.status(403).json({ error: 'Admin already exists' });
  const { email, password, display_name } = req.body;
  if (!email || !password || password.length < 8)
    return res.status(400).json({ error: 'Email and password (min 8 chars) required' });
  const hash = await bcrypt.hash(password, 12);
  db.prepare('INSERT INTO users (id,email,password_hash,role,display_name,must_reset) VALUES (?,?,?,?,?,0)')
    .run(uuidv4(), email.toLowerCase().trim(), hash, 'admin', display_name || 'Admin');
  res.json({ ok: true });
});

// ── Auth ──────────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.sendFile('login.html', { root: 'public/admin' }));

router.post('/api/login', express.json(), async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase().trim());
  if (!user || !(await bcrypt.compare(password || '', user.password_hash)))
    return res.status(401).json({ error: 'Invalid email or password' });

  const token   = uuidv4();
  const expires = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, user.id, expires);
  res.cookie('vsession', token, COOKIE_OPTS);
  res.json({ ok: true, must_reset: user.must_reset === 1, role: user.role });
});

router.post('/api/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(req.cookies?.vsession);
  res.clearCookie('vsession');
  res.json({ ok: true });
});

router.get('/reset-password', requireAuth, (req, res) =>
  res.sendFile('reset-password.html', { root: 'public/admin' }));

router.post('/api/reset-password', requireAuth, express.json(), async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const hash = await bcrypt.hash(password, 12);
  db.prepare('UPDATE users SET password_hash=?, must_reset=0 WHERE id=?').run(hash, req.user.id);
  res.json({ ok: true });
});

// ── Current user ──────────────────────────────────────────────────────────────
router.get('/api/me', requireAuth, (req, res) => res.json(req.user));

// ── Orders ────────────────────────────────────────────────────────────────────
router.get('/api/orders', requireAuth, (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(`SELECT o.*, u.display_name booster_name FROM orders o
                  LEFT JOIN users u ON o.booster_id=u.id ORDER BY o.created_at DESC`).all()
    : db.prepare(`SELECT o.*, u.display_name booster_name FROM orders o
                  LEFT JOIN users u ON o.booster_id=u.id
                  WHERE o.status='pending' OR o.booster_id=?
                  ORDER BY o.created_at DESC`).all(req.user.id);
  res.json(rows);
});

router.post('/api/orders/:id/accept', requireAuth, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id=? AND status='pending'").get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found or already accepted' });
  db.prepare("UPDATE orders SET status='accepted', booster_id=? WHERE id=?").run(req.user.id, order.id);
  res.json({ ok: true });
});

router.post('/api/orders/:id/schedule', requireAuth, express.json(), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (req.user.role !== 'admin' && order.booster_id !== req.user.id)
    return res.status(403).json({ error: 'Forbidden' });
  const { start, end, notes } = req.body || {};
  db.prepare('UPDATE orders SET scheduled_start=?, scheduled_end=?, notes=COALESCE(?,notes) WHERE id=?')
    .run(
      start ? Math.floor(new Date(start).getTime() / 1000) : null,
      end   ? Math.floor(new Date(end).getTime()   / 1000) : null,
      notes || null,
      order.id
    );
  res.json({ ok: true });
});

router.post('/api/orders/:id/complete', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (req.user.role !== 'admin' && order.booster_id !== req.user.id)
    return res.status(403).json({ error: 'Forbidden' });
  db.prepare("UPDATE orders SET status='completed' WHERE id=?").run(order.id);
  res.json({ ok: true });
});

// ── Boosters (admin only) ─────────────────────────────────────────────────────
router.get('/api/boosters', requireAuth, requireAdmin, (req, res) => {
  res.json(db.prepare(
    'SELECT id,email,display_name,role,must_reset,created_at FROM users ORDER BY created_at DESC'
  ).all());
});

router.post('/api/boosters', requireAuth, requireAdmin, express.json(), async (req, res) => {
  const { email, password, display_name, role } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase().trim()))
    return res.status(400).json({ error: 'Email already in use' });
  const hash = await bcrypt.hash(password, 12);
  const id   = uuidv4();
  db.prepare('INSERT INTO users (id,email,password_hash,role,display_name,must_reset) VALUES (?,?,?,?,?,1)')
    .run(id, email.toLowerCase().trim(), hash, role === 'admin' ? 'admin' : 'booster', display_name || email);
  res.json({ ok: true, id });
});

router.delete('/api/boosters/:id', requireAuth, requireAdmin, (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Calendar ──────────────────────────────────────────────────────────────────
router.get('/api/calendar', requireAuth, (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(`SELECT o.id, o.service, o.scheduled_start, o.scheduled_end, o.status,
                         o.customer_email, u.display_name booster_name, u.id booster_id
                  FROM orders o LEFT JOIN users u ON o.booster_id=u.id
                  WHERE o.scheduled_start IS NOT NULL ORDER BY o.scheduled_start`).all()
    : db.prepare(`SELECT o.id, o.service, o.scheduled_start, o.scheduled_end, o.status,
                         o.customer_email, u.display_name booster_name, u.id booster_id
                  FROM orders o LEFT JOIN users u ON o.booster_id=u.id
                  WHERE o.booster_id=? AND o.scheduled_start IS NOT NULL ORDER BY o.scheduled_start`).all(req.user.id);
  res.json(rows);
});

// ── Dashboard pages ───────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  if (req.user.must_reset) return res.redirect('/admin/reset-password');
  res.sendFile('index.html', { root: 'public/admin' });
});

router.get('/calendar', requireAuth, (req, res) => {
  if (req.user.must_reset) return res.redirect('/admin/reset-password');
  res.sendFile('index.html', { root: 'public/admin' });
});

router.get('/boosters', requireAuth, requireAdmin, (req, res) => {
  if (req.user.must_reset) return res.redirect('/admin/reset-password');
  res.sendFile('index.html', { root: 'public/admin' });
});

module.exports = router;
