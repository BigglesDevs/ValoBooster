const nodemailer = require('nodemailer');

function createTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth:   { user, pass },
  });
}

function row(label, value) {
  return `<tr>
    <td style="padding:8px 0;color:#a0a0b0;font-size:14px;">${label}</td>
    <td style="padding:8px 0;font-size:14px;text-align:right;font-weight:600;">${value}</td>
  </tr>`;
}

function baseTemplate({ headerBg = '#ff4655', headerTitle, headerSub, bodyHtml }) {
  const portalUrl = `${process.env.SITE_URL || 'https://valboost.net'}/portal.html`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f0f13;font-family:'Segoe UI',Arial,sans-serif;color:#fff;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f13;padding:40px 0;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#1a1a24;border-radius:16px;overflow:hidden;border:1px solid #2a2a3a;">
  <tr><td style="background:${headerBg};padding:32px 40px;text-align:center;">
    <h1 style="margin:0;font-size:26px;font-weight:900;color:#fff;">ValoBooster</h1>
    <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">${headerTitle}</p>
  </td></tr>
  <tr><td style="padding:36px 40px;">
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;">${headerSub}</h2>
    ${bodyHtml}
  </td></tr>
  <tr><td style="background:#13131d;padding:20px 40px;text-align:center;border-top:1px solid #2a2a3a;">
    <p style="margin:0;font-size:12px;color:#505060;">ValoBooster &bull; Fast. Safe. Guaranteed.</p>
    <p style="margin:6px 0 0;font-size:12px;color:#505060;">
      Track your order: <a href="${portalUrl}" style="color:#ff4655;">${portalUrl}</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table></body></html>`;
}

function summaryTable(order, charged = false) {
  const total = order.total || ((order.amount_cents || 0) / 100).toFixed(2);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2a2a3a;border-radius:10px;overflow:hidden;margin-bottom:24px;">
    <tr><td style="background:#13131d;padding:14px 20px;">
      <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a0a0b0;">Order Summary</span>
    </td></tr>
    <tr><td style="padding:4px 20px 16px;"><table width="100%" cellpadding="0" cellspacing="0">
      ${row('Service', order.service || '—')}
      ${order.options ? row('Options', order.options) : ''}
      ${order.addons  ? row('Add-ons', order.addons)  : ''}
      ${order.promo   ? row('Promo',   order.promo)   : ''}
      <tr><td colspan="2" style="border-top:1px solid #2a2a3a;padding-top:12px;"></td></tr>
      ${row(`<strong>${charged ? 'Total Charged' : 'Amount Reserved'}</strong>`,
            `<span style="color:#ff4655;font-weight:900;">£${total}</span>`)}
    </table></td></tr>
  </table>`;
}

async function sendOrderEmail(to, order) {
  const transport = createTransport();
  if (!transport) {
    console.warn('Email not configured — set SMTP_USER and SMTP_PASS in Railway');
    return;
  }

  const status = order._status || 'pending';
  let subject, html;

  if (status === 'accepted') {
    subject = 'Your Boost Has Been Confirmed — ValoBooster';
    html = baseTemplate({
      headerBg: '#2ecc71', headerTitle: 'Boost Confirmed',
      headerSub: 'A booster has accepted your order!',
      bodyHtml: `
        <p style="margin:0 0 20px;color:#a0a0b0;font-size:14px;line-height:1.7;">
          A booster has confirmed your order. Your payment has been processed and your boost will start at the scheduled time.
        </p>
        ${summaryTable(order, true)}
        <p style="margin:0;font-size:14px;color:#a0a0b0;">Track your order in your <a href="${process.env.SITE_URL || 'https://valboost.net'}/portal.html" style="color:#ff4655;">customer portal</a>.</p>`,
    });

  } else if (status === 'declined') {
    subject = 'Your Order Was Declined — ValoBooster';
    html = baseTemplate({
      headerBg: '#e74c3c', headerTitle: 'Order Declined',
      headerSub: 'Your card hold has been released',
      bodyHtml: `
        <p style="margin:0 0 20px;color:#a0a0b0;font-size:14px;line-height:1.7;">
          No booster was available for your order. <strong>Your card has not been charged</strong> — the hold has been fully released. Please try again at another time.
        </p>
        ${summaryTable(order)}`,
    });

  } else if (status === 'expired') {
    subject = 'Your Order Expired — ValoBooster';
    html = baseTemplate({
      headerBg: '#e67e22', headerTitle: 'Order Expired',
      headerSub: 'No booster accepted in time',
      bodyHtml: `
        <p style="margin:0 0 20px;color:#a0a0b0;font-size:14px;line-height:1.7;">
          Your order wasn't accepted within 24 hours and has expired. <strong>Your card has not been charged.</strong> Please try placing a new order.
        </p>
        ${summaryTable(order)}`,
    });

  } else if (status === 'completed') {
    subject = 'Your Boost Is Complete — ValoBooster';
    html = baseTemplate({
      headerBg: '#9b59b6', headerTitle: 'Boost Complete',
      headerSub: 'Your order has been completed!',
      bodyHtml: `
        <p style="margin:0 0 20px;color:#a0a0b0;font-size:14px;line-height:1.7;">
          Your boost has been completed. Enjoy your new rank!
        </p>
        ${summaryTable(order, true)}`,
    });

  } else {
    // pending — card held, not charged
    subject = 'Order Received — ValoBooster';
    html = baseTemplate({
      headerTitle: 'Order Received',
      headerSub: 'Your order is pending a booster',
      bodyHtml: `
        <p style="margin:0 0 20px;color:#a0a0b0;font-size:14px;line-height:1.7;">
          Thanks for your order! Your card has been <strong>reserved but not charged yet</strong>. A booster will review your order shortly — you'll receive another email when confirmed.
        </p>
        ${summaryTable(order)}
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2a2a3a;border-radius:10px;overflow:hidden;margin-bottom:24px;">
          <tr><td style="background:#13131d;padding:14px 20px;">
            <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a0a0b0;">What Happens Next</span>
          </td></tr>
          <tr><td style="padding:12px 20px 16px;">
            <p style="margin:6px 0;font-size:14px;color:#d0d0e0;"><span style="color:#ff4655;font-weight:800;">1.</span> A booster accepts your order</p>
            <p style="margin:6px 0;font-size:14px;color:#d0d0e0;"><span style="color:#ff4655;font-weight:800;">2.</span> Your card is charged only at that point</p>
            <p style="margin:6px 0;font-size:14px;color:#d0d0e0;"><span style="color:#ff4655;font-weight:800;">3.</span> Boost starts at your scheduled time</p>
          </td></tr>
        </table>`,
    });
  }

  await transport.sendMail({
    from:    process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
  });
}

module.exports = { sendOrderEmail };
