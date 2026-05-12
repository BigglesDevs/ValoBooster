const db = require('../db');

function requireAuth(req, res, next) {
  const token = req.cookies?.vsession;
  if (!token) return _unauth(req, res);

  const session = db.prepare(`
    SELECT s.token, u.id, u.email, u.role, u.display_name, u.must_reset
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > unixepoch()
  `).get(token);

  if (!session) return _unauth(req, res);

  req.user = {
    id:           session.id,
    email:        session.email,
    role:         session.role,
    display_name: session.display_name,
    must_reset:   session.must_reset === 1,
  };
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

function _unauth(req, res) {
  if (req.path.includes('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  return res.redirect('/admin/login');
}

module.exports = { requireAuth, requireAdmin };
