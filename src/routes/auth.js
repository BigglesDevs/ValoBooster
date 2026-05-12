const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');

const router = express.Router();
const SITE   = () => process.env.SITE_URL || 'https://valboost.net';

const SESSION_DAYS = 30;
const COOKIE_OPTS  = {
  httpOnly: true, sameSite: 'strict',
  secure:   process.env.NODE_ENV !== 'development',
  maxAge:   SESSION_DAYS * 86400 * 1000,
};
const STATE_OPTS = { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 };

function claimByEmail(customerId, email) {
  if (!email) return;
  db.prepare("UPDATE orders SET customer_id=? WHERE customer_email=? AND customer_id IS NULL").run(customerId, email);
}

async function findOrCreate({ discordId, googleId, email, displayName, avatarUrl }) {
  let customer = null;
  if (discordId) customer = db.prepare('SELECT * FROM customers WHERE discord_id=?').get(discordId);
  if (!customer && googleId) customer = db.prepare('SELECT * FROM customers WHERE google_id=?').get(googleId);
  if (!customer && email)    customer = db.prepare('SELECT * FROM customers WHERE email=?').get(email.toLowerCase().trim());

  if (customer) {
    const sets = []; const vals = [];
    if (discordId && !customer.discord_id) { sets.push('discord_id=?'); vals.push(discordId); }
    if (googleId  && !customer.google_id)  { sets.push('google_id=?');  vals.push(googleId); }
    if (avatarUrl && !customer.avatar_url) { sets.push('avatar_url=?'); vals.push(avatarUrl); }
    if (sets.length) db.prepare(`UPDATE customers SET ${sets.join(',')} WHERE id=?`).run(...vals, customer.id);
    return db.prepare('SELECT * FROM customers WHERE id=?').get(customer.id);
  }

  const id            = uuidv4();
  const effectiveEmail = email?.toLowerCase().trim() || `${discordId || googleId}@oauth.placeholder`;
  const hash          = await bcrypt.hash(uuidv4(), 4); // throwaway — OAuth users don't log in with password
  db.prepare('INSERT OR IGNORE INTO customers (id,email,password_hash,display_name,discord_id,google_id,avatar_url) VALUES (?,?,?,?,?,?,?)')
    .run(id, effectiveEmail, hash, displayName || 'Customer', discordId || null, googleId || null, avatarUrl || null);
  const created = db.prepare('SELECT * FROM customers WHERE id=?').get(id);
  if (created && !effectiveEmail.endsWith('@oauth.placeholder')) claimByEmail(created.id, effectiveEmail);
  return created;
}

function startSession(customerId, res) {
  const token   = uuidv4();
  const expires = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  db.prepare('INSERT INTO customer_sessions (token,customer_id,expires_at) VALUES (?,?,?)').run(token, customerId, expires);
  res.cookie('cvsession', token, COOKIE_OPTS);
}

// ── Discord ───────────────────────────────────────────────────────────────────
router.get('/discord', (req, res) => {
  if (!process.env.DISCORD_CLIENT_ID) return res.redirect('/portal.html?error=Discord+login+not+configured');
  const state = uuidv4();
  res.cookie('oauthstate', state, STATE_OPTS);
  res.redirect('https://discord.com/api/oauth2/authorize?' + new URLSearchParams({
    client_id:     process.env.DISCORD_CLIENT_ID,
    redirect_uri:  `${SITE()}/auth/discord/callback`,
    response_type: 'code',
    scope:         'identify email',
    state,
  }));
});

router.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.cookies?.oauthstate)
    return res.redirect('/portal.html?error=Login+failed+%E2%80%94+please+try+again');
  res.clearCookie('oauthstate');
  try {
    const tok = await (await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code', code,
        redirect_uri: `${SITE()}/auth/discord/callback`,
      }),
    })).json();
    if (!tok.access_token) return res.redirect('/portal.html?error=Discord+auth+failed');

    const u = await (await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })).json();

    const customer = await findOrCreate({
      discordId:   u.id,
      email:       u.email || null,
      displayName: u.global_name || u.username,
      avatarUrl:   u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : null,
    });
    startSession(customer.id, res);
    res.redirect('/portal.html');
  } catch (err) {
    console.error('Discord OAuth error:', err);
    res.redirect('/portal.html?error=Discord+login+failed');
  }
});

// ── Google ────────────────────────────────────────────────────────────────────
router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.redirect('/portal.html?error=Google+login+not+configured');
  const state = uuidv4();
  res.cookie('oauthstate', state, STATE_OPTS);
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${SITE()}/auth/google/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    state,
  }));
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.cookies?.oauthstate)
    return res.redirect('/portal.html?error=Login+failed+%E2%80%94+please+try+again');
  res.clearCookie('oauthstate');
  try {
    const tok = await (await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: 'authorization_code', code,
        redirect_uri: `${SITE()}/auth/google/callback`,
      }),
    })).json();
    if (!tok.id_token) return res.redirect('/portal.html?error=Google+auth+failed');

    // Decode JWT payload — safe since it came directly from Google over HTTPS
    const payload = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString());
    const customer = await findOrCreate({
      googleId:    payload.sub,
      email:       payload.email,
      displayName: payload.name || payload.given_name,
      avatarUrl:   payload.picture || null,
    });
    startSession(customer.id, res);
    res.redirect('/portal.html');
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect('/portal.html?error=Google+login+failed');
  }
});

module.exports = router;
