require('dotenv').config();
const express = require('express');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/create-checkout', async (req, res) => {
  const { amountCents, email, description, reference } = req.body;

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
  params.append('line_items[0][price_data][currency]',           'usd');
  params.append('line_items[0][price_data][unit_amount]',        String(amountCents));
  params.append('line_items[0][price_data][product_data][name]', description || 'Valorant Boost');
  params.append('line_items[0][quantity]',                       '1');
  params.append('mode',                                          'payment');
  params.append('success_url',  `${siteUrl}/success.html?ref=${encodeURIComponent(reference || '')}`);
  params.append('cancel_url',   siteUrl);
  if (email)     params.append('customer_email',       email);
  if (reference) params.append('client_reference_id',  reference);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ValoBooster running on port ${PORT}`));
