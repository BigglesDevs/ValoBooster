require('dotenv').config();
const express = require('express');
const path    = require('path');
const bot     = require('./src/bot');

const app  = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory rate limiter: max 10 checkout requests per IP per minute
const _rateMap = new Map();
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, entry] of _rateMap) {
    if (entry.start < cutoff) _rateMap.delete(ip);
  }
}, 5 * 60_000);

function rateLimit(req, res, next) {
  const ip    = req.ip || req.socket.remoteAddress;
  const now   = Date.now();
  const entry = _rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > 60_000) { entry.count = 0; entry.start = now; }
  entry.count++;
  _rateMap.set(ip, entry);
  if (entry.count > 10) {
    return res.status(429).json({ error: 'Too many requests — please try again later' });
  }
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/create-checkout', rateLimit, async (req, res) => {
  const { amountCents, email, description, reference, options, addons, promo } = req.body;

  if (!amountCents || amountCents < 100 || amountCents > 500000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (email && !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (description && description.length > 300) {
    return res.status(400).json({ error: 'Description too long' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe not configured — set STRIPE_SECRET_KEY in Railway environment variables' });
  }

  const siteUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : (process.env.SITE_URL || `http://localhost:${PORT}`);

  const params = new URLSearchParams();
  params.append('payment_method_types[]',                        'card');
  params.append('line_items[0][price_data][currency]',           'gbp');
  params.append('line_items[0][price_data][unit_amount]',        String(amountCents));
  params.append('line_items[0][price_data][product_data][name]', description || 'Valorant Boost');
  params.append('line_items[0][quantity]',                       '1');
  params.append('mode',                                          'payment');
  params.append('success_url',  `${siteUrl}/success.html?ref=${encodeURIComponent(reference || '')}`);
  params.append('cancel_url',   siteUrl);
  if (email)     params.append('customer_email',      email);
  if (reference) params.append('client_reference_id', reference);

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body:   params.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const session = await response.json();

    if (!response.ok) {
      console.error('Stripe error:', session);
      return res.status(502).json({ error: session.error?.message || 'Stripe error' });
    }

    // Notify Discord (non-blocking)
    bot.sendOrderNotification({
      service: description || 'Valorant Boost',
      total:   (amountCents / 100).toFixed(2),
      email:   email || '(not entered)',
      options: options || '—',
      addons:  addons || null,
      promo:   promo  || null,
    });

    res.json({ url: session.url });
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('Stripe request timed out');
      return res.status(504).json({ error: 'Payment gateway timed out — please try again' });
    }
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, async () => {
  console.log(`ValoBooster running on port ${PORT}`);
  await bot.login();
});
