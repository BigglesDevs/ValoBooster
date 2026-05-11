require('dotenv').config();
const express = require('express');
const path    = require('path');
const bot     = require('./src/bot');

const app = express();

// Stripe webhooks must receive the raw body — register before express.json()
app.use('/webhook', express.raw({ type: 'application/json' }));
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
  const siteUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : (process.env.SITE_URL || `http://localhost:${port}`);

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

  // Store order details in metadata so the webhook can access them
  if (options) params.append('metadata[options]', options);
  if (addons)  params.append('metadata[addons]',  addons);
  if (promo)   params.append('metadata[promo]',   promo);

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

// Stripe webhook — fires only after successful payment
app.post('/webhook', async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature     = req.headers['stripe-signature'];

  let event;

  if (webhookSecret && signature) {
    // Verify the webhook came from Stripe
    try {
      const crypto = require('crypto');
      const parts  = signature.split(',').reduce((acc, part) => {
        const [k, v] = part.split('=');
        acc[k] = v;
        return acc;
      }, {});

      const payload   = `${parts.t}.${req.body.toString()}`;
      const expected  = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
      if (expected !== parts.v1) {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      event = JSON.parse(req.body.toString());
    } catch (err) {
      return res.status(400).json({ error: 'Webhook error' });
    }
  } else {
    // No secret configured — accept but log a warning
    console.warn('STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
    event = JSON.parse(req.body.toString());
  }

  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object;
    const meta     = session.metadata ?? {};
    const amount   = ((session.amount_total ?? 0) / 100).toFixed(2);
    const email    = session.customer_details?.email ?? session.customer_email ?? '(not entered)';
    const service  = session.line_items?.data?.[0]?.description ?? 'Valorant Boost';

    bot.sendOrderNotification({
      service: service,
      total:   amount,
      email:   email,
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
