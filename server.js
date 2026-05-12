require('dotenv').config();
const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const bot     = require('./src/bot');
const { sendOrderEmail } = require('./src/utils/mailer');

const app = express();
const notifiedSessions = new Set();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/create-checkout', async (req, res) => {
  const { amountCents, email, description, reference, options, addons, promo } = req.body;

  if (!amountCents || amountCents < 100 || amountCents > 500000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe not configured — set STRIPE_SECRET_KEY in Railway environment variables' });
  }

  const port    = process.env.PORT || 3000;
  const siteUrl = process.env.SITE_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
    || `http://localhost:${port}`;

  const params = new URLSearchParams();
  params.append('payment_method_types[]',                        'card');
  params.append('line_items[0][price_data][currency]',           'gbp');
  params.append('line_items[0][price_data][unit_amount]',        String(amountCents));
  params.append('line_items[0][price_data][product_data][name]', description || 'Valorant Boost');
  params.append('line_items[0][quantity]',                       '1');
  params.append('mode',                                          'payment');
  params.append('success_url',  `${siteUrl}/success.html?ref=${encodeURIComponent(reference || '')}&session_id={CHECKOUT_SESSION_ID}`);
  params.append('cancel_url',   siteUrl);
  if (email)     params.append('customer_email',      email);
  if (reference) params.append('client_reference_id', reference);

  // Store order details in metadata so the webhook can read them after payment succeeds
  params.append('metadata[service]',      description || 'Valorant Boost');
  params.append('metadata[amount_cents]', String(amountCents));
  if (email)   params.append('metadata[email]',   email);
  if (options) params.append('metadata[options]', String(options));
  if (addons)  params.append('metadata[addons]',  typeof addons === 'string' ? addons : JSON.stringify(addons));
  if (promo)   params.append('metadata[promo]',   typeof promo  === 'string' ? promo  : JSON.stringify(promo));

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await response.json();

    if (!response.ok) {
      console.error('Stripe error:', session);
      return res.status(502).json({ error: session.error?.message || 'Stripe error' });
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/verify-payment', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  if (notifiedSessions.has(sessionId)) {
    return res.json({ ok: true, alreadyNotified: true });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Stripe not configured' });

  try {
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { 'Authorization': `Bearer ${secretKey}` },
    });
    const session = await response.json();

    if (!response.ok || session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not confirmed' });
    }

    notifiedSessions.add(sessionId);

    const meta        = session.metadata || {};
    const amountCents = session.amount_total ?? parseInt(meta.amount_cents, 10) ?? 0;

    const customerEmail = session.customer_email || meta.email;
    const order = {
      service: meta.service || 'Valorant Boost',
      total:   (amountCents / 100).toFixed(2),
      email:   customerEmail || '(not entered)',
      options: meta.options || '—',
      addons:  meta.addons  || null,
      promo:   meta.promo   || null,
    };

    bot.sendOrderNotification(order);
    if (customerEmail) sendOrderEmail(customerEmail, order).catch(err => console.error('Email error:', err.message));

    res.json({ ok: true });
  } catch (err) {
    console.error('verify-payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Stripe sends the raw body — must not use express.json() on this route
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig           = req.headers['stripe-signature'];
  const payload       = req.body.toString('utf8');

  let event;
  try {
    if (webhookSecret && sig) {
      const parts = {};
      for (const part of sig.split(',')) {
        const [k, v] = part.split('=');
        parts[k] = v;
      }
      const expected = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${parts.t}.${payload}`)
        .digest('hex');
      if (expected !== parts.v1) {
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }
    event = JSON.parse(payload);
  } catch (err) {
    console.error('Webhook parse error:', err.message);
    return res.status(400).json({ error: 'Bad request' });
  }

  if (event.type === 'checkout.session.completed') {
    const session     = event.data.object;
    const meta        = session.metadata || {};
    const amountCents = session.amount_total ?? parseInt(meta.amount_cents, 10) ?? 0;

    // Notify Discord only after payment is confirmed
    bot.sendOrderNotification({
      service: meta.service || 'Valorant Boost',
      total:   (amountCents / 100).toFixed(2),
      email:   session.customer_email || meta.email || '(not entered)',
      options: meta.options || '—',
      addons:  meta.addons  || null,
      promo:   meta.promo   || null,
    });
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`ValoBooster running on port ${PORT}`);
  await bot.login();
});
