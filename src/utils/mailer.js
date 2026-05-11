const nodemailer = require('nodemailer');

function createTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth:   { user, pass },
  });
}

async function sendOrderEmail(to, order) {
  const transport = createTransport();
  if (!transport) {
    console.warn('Email not configured — set SMTP_USER and SMTP_PASS');
    return;
  }

  const addonsRow = order.addons
    ? `<tr><td style="padding:8px 0;color:#a0a0b0;font-size:14px;">Add-ons</td><td style="padding:8px 0;font-size:14px;text-align:right;">${order.addons}</td></tr>`
    : '';
  const promoRow = order.promo
    ? `<tr><td style="padding:8px 0;color:#a0a0b0;font-size:14px;">Promo</td><td style="padding:8px 0;font-size:14px;text-align:right;">${order.promo}</td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f0f13;font-family:'Segoe UI',Arial,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f13;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#1a1a24;border-radius:16px;overflow:hidden;border:1px solid #2a2a3a;">

        <!-- Header -->
        <tr><td style="background:#ff4655;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;">🎮 ValoBooster</h1>
          <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">Order Confirmed</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          <h2 style="margin:0 0 8px;font-size:20px;font-weight:800;">Payment Successful!</h2>
          <p style="margin:0 0 28px;color:#a0a0b0;font-size:14px;line-height:1.7;">
            Thanks for your order. A booster will be assigned shortly and you'll be contacted via this email with further details.
          </p>

          <!-- Order summary -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2a2a3a;border-radius:10px;overflow:hidden;margin-bottom:28px;">
            <tr><td style="background:#13131d;padding:14px 20px;">
              <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a0a0b0;">Order Summary</span>
            </td></tr>
            <tr><td style="padding:4px 20px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:8px 0;color:#a0a0b0;font-size:14px;">Service</td>
                  <td style="padding:8px 0;font-size:14px;text-align:right;font-weight:600;">${order.service}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#a0a0b0;font-size:14px;">Options</td>
                  <td style="padding:8px 0;font-size:14px;text-align:right;">${order.options}</td>
                </tr>
                ${addonsRow}
                ${promoRow}
                <tr><td colspan="2" style="border-top:1px solid #2a2a3a;padding-top:12px;"></td></tr>
                <tr>
                  <td style="font-size:15px;font-weight:700;">Total Paid</td>
                  <td style="font-size:15px;font-weight:900;text-align:right;color:#ff4655;">£${order.total}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- What happens next -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2a2a3a;border-radius:10px;overflow:hidden;margin-bottom:28px;">
            <tr><td style="background:#13131d;padding:14px 20px;">
              <span style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a0a0b0;">What Happens Next</span>
            </td></tr>
            <tr><td style="padding:8px 20px 16px;">
              <p style="margin:10px 0;font-size:14px;color:#d0d0e0;line-height:1.7;"><span style="color:#ff4655;font-weight:800;">1.</span> We review your order and assign a booster (usually within 1–2 hours during business hours)</p>
              <p style="margin:10px 0;font-size:14px;color:#d0d0e0;line-height:1.7;"><span style="color:#ff4655;font-weight:800;">2.</span> You'll be contacted via this email with login details or a lobby invite</p>
              <p style="margin:10px 0;font-size:14px;color:#d0d0e0;line-height:1.7;"><span style="color:#ff4655;font-weight:800;">3.</span> Your rank goal will be reached — fast, safe, and guaranteed</p>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#606070;line-height:1.7;">
            Questions? Reply to this email or open a ticket in our Discord server.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#13131d;padding:20px 40px;text-align:center;border-top:1px solid #2a2a3a;">
          <p style="margin:0;font-size:12px;color:#505060;">ValoBooster &bull; Fast. Safe. Guaranteed.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transport.sendMail({
    from,
    to,
    subject: `Order Confirmed — ValoBooster`,
    html,
  });
}

module.exports = { sendOrderEmail };
