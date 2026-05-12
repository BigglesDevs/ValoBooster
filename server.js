require('dotenv').config();
const express      = require('express');
const crypto       = require('crypto');
const path         = require('path');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const bot            = require('./src/bot');
const { sendOrderEmail } = require('./src/utils/mailer');
const db             = require('./src/db');
const adminRouter    = require('./src/routes/admin');
const customerRouter = require('./src/routes/customer');
const authRouter     = require('./src/routes/auth');

const app = express();

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', adminRouter);
app.use('/api/customer', customerRouter);
app.use('/auth', authRouter);

// Discord server invite redirect
app.get('/api/discord', (req, res) => {
  const invite = process.env.DISCORD_INVITE;
  if (!invite) return res.status(404).send('DISCORD_INVITE not set in environment');
  res.redirect(invite);
});

// ── Stripe helpers ────────────────────────────────────────────────────────────
async function stripePost(endpoint, params) {
  const res = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  return res.json();
}

async function capturePaymentIntent(id) {
  return stripePost(`/payment_intents/${encodeURIComponent(id)}/capture`, {});
}

async function cancelPaymentIntent(id, reason = 'requested_by_customer') {
  return stripePost(`/payment_intents/${encodeURIComponent(id)}/cancel`, { reason });
}

// ── Auto-expiry job (runs every hour) ─────────────────────────────────────────
// Releases holds on orders that no booster accepted within 24 hours
setInterval(async () => {
  const expired = db.prepare(`
    SELECT * FROM orders
    WHERE status = 'pending'
      AND payment_intent_id IS NOT NULL
      AND created_at < unixepoch() - 86400
  `).all();

  for (const order of expired) {
    try {
      await cancelPaymentIntent(order.payment_intent_id, 'abandoned');
      db.prepare("UPDATE orders SET status='expired' WHERE id=?").run(order.id);
      if (order.customer_email) {
        sendOrderEmail(order.customer_email, { ...order, _reason: 'expired' })
          .catch(e => console.error('Expiry email error:', e.message));
      }
      console.log('Auto-expired order', order.id);
    } catch (err) {
      console.error('Expiry error for', order.id, err.message);
    }
  }
}, 60 * 60 * 1000);

// ── Public config ─────────────────────────────────────────────────────────────
app.get('/api/stripe-key', (req, res) => {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) return res.status(500).json({ error: 'Stripe not configured' });
  res.json({ publishableKey: key });
});

// ── Availability (public — used by customer date picker) ──────────────────────
app.get('/api/availability', (req, res) => {
  const { n: boosterCount } = db.prepare(
    "SELECT COUNT(*) as n FROM users"
  ).get();

  if (boosterCount === 0) return res.json({ blocked: [] });

  const blocked = db.prepare(`
    SELECT date FROM blocked_dates
    GROUP BY date
    HAVING COUNT(DISTINCT booster_id) >= ?
  `).all(boosterCount).map(r => r.date);

  res.json({ blocked });
});

// ── Create Payment Intent (holds card, does NOT charge) ───────────────────────
app.post('/create-payment-intent', express.json(), async (req, res) => {
  const { amountCents, email, description, reference, options, addons, promo, scheduledStart } = req.body;

  if (!amountCents || amountCents < 100 || amountCents > 500000)
    return res.status(400).json({ error: 'Invalid amount' });

  if (!process.env.STRIPE_SECRET_KEY)
    return res.status(500).json({ error: 'Stripe not configured' });

  const params = {
    amount:           String(amountCents),
    currency:         'gbp',
    capture_method:   'manual',
    'metadata[service]':       description || 'Valorant Boost',
    'metadata[amount_cents]':  String(amountCents),
    'metadata[reference]':     reference || '',
    'metadata[options]':       options   || '',
  };
  if (email)   params.receipt_email        = email;
  if (addons)  params['metadata[addons]']  = typeof addons === 'string' ? addons : JSON.stringify(addons);
  if (promo)   params['metadata[promo]']   = typeof promo  === 'string' ? promo  : JSON.stringify(promo);
  if (scheduledStart) params['metadata[scheduled_start]'] = scheduledStart;

  try {
    const pi = await stripePost('/payment_intents', params);
    if (pi.error) return res.status(502).json({ error: pi.error.message });
    res.json({ clientSecret: pi.client_secret, paymentIntentId: pi.id });
  } catch (err) {
    console.error('create-payment-intent error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Confirm payment (called after Stripe.js confirms card hold) ───────────────
app.post('/confirm-payment', express.json(), async (req, res) => {
  const { paymentIntentId, email, description, reference, options, addons, promo, scheduledStart } = req.body;
  if (!paymentIntentId) return res.status(400).json({ error: 'Missing paymentIntentId' });

  // Check it's already in DB (idempotent)
  const existing = db.prepare('SELECT id FROM orders WHERE payment_intent_id=?').get(paymentIntentId);
  if (existing) return res.json({ ok: true, orderId: existing.id });

  // Verify status with Stripe
  try {
    const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
      headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const pi = await piRes.json();
    if (pi.status !== 'requires_capture')
      return res.status(402).json({ error: 'Payment not authorised' });

    const meta        = pi.metadata || {};
    const amountCents = pi.amount;
    const customerEmail = pi.receipt_email || email;
    const schedStart  = scheduledStart
      ? Math.floor(new Date(scheduledStart).getTime() / 1000)
      : (meta.scheduled_start ? Math.floor(new Date(meta.scheduled_start).getTime() / 1000) : null);

    // Resolve logged-in customer (if any)
    let customerId = null;
    const cToken = req.cookies?.cvsession;
    if (cToken) {
      const cs = db.prepare(`
        SELECT c.id FROM customer_sessions cs JOIN customers c ON cs.customer_id=c.id
        WHERE cs.token=? AND cs.expires_at > unixepoch()
      `).get(cToken);
      if (cs) customerId = cs.id;
    }

    const orderId = uuidv4();
    db.prepare(`
      INSERT OR IGNORE INTO orders
        (id, payment_intent_id, service, amount_cents, customer_email, customer_id, options, addons, promo, scheduled_start, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      orderId, paymentIntentId,
      description || meta.service || 'Valorant Boost',
      amountCents,
      customerEmail || null,
      customerId,
      options || meta.options || null,
      addons  || meta.addons  || null,
      promo   || meta.promo   || null,
      schedStart,
    );

    const order = {
      service: description || meta.service || 'Valorant Boost',
      total:   (amountCents / 100).toFixed(2),
      email:   customerEmail || '(not entered)',
      options: options || meta.options || '—',
      addons:  addons  || meta.addons  || null,
      promo:   promo   || meta.promo   || null,
    };

    bot.sendOrderNotification(order);

    res.json({ ok: true, orderId });
  } catch (err) {
    console.error('confirm-payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Customer portal — public order lookup ─────────────────────────────────────
const PORTAL_FIELDS = 'id, service, amount_cents, status, options, addons, scheduled_start, scheduled_end, created_at';

app.get('/api/portal/by-email', (req, res) => {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Email required' });
  const orders = db.prepare(`SELECT ${PORTAL_FIELDS} FROM orders WHERE customer_email=? ORDER BY created_at DESC`).all(email);
  res.json(orders);
});

app.get('/api/portal/:orderId', (req, res) => {
  const order = db.prepare(`SELECT ${PORTAL_FIELDS} FROM orders WHERE id=?`).get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// ── Stripe webhook ────────────────────────────────────────────────────────────
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig           = req.headers['stripe-signature'];
  const payload       = req.body.toString('utf8');

  let event;
  try {
    if (webhookSecret && sig) {
      const parts = {};
      for (const part of sig.split(',')) { const [k, v] = part.split('='); parts[k] = v; }
      const expected = crypto.createHmac('sha256', webhookSecret)
        .update(`${parts.t}.${payload}`).digest('hex');
      if (expected !== parts.v1) return res.status(400).json({ error: 'Invalid signature' });
    }
    event = JSON.parse(payload);
  } catch (err) {
    console.error('Webhook parse error:', err.message);
    return res.status(400).json({ error: 'Bad request' });
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object;
    db.prepare("UPDATE orders SET status='failed' WHERE payment_intent_id=?").run(pi.id);
  }

  if (event.type === 'payment_intent.canceled') {
    const pi = event.data.object;
    db.prepare("UPDATE orders SET status='expired' WHERE payment_intent_id=? AND status='pending'").run(pi.id);
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`ValoBooster running on port ${PORT}`);
  await bot.login();
});
