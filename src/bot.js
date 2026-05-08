const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
});

function buildEmbedPayload(order) {
  const fields = [
    { name: '📦 Service', value: order.service,       inline: true  },
    { name: '💰 Total',   value: `£${order.total}`,   inline: true  },
    { name: '📧 Email',   value: order.email || '—',  inline: false },
    { name: '⚙️ Options', value: order.options,       inline: false },
  ];
  if (order.addons) fields.push({ name: '➕ Add-ons', value: order.addons, inline: false });
  if (order.promo)  fields.push({ name: '🏷️ Promo',  value: order.promo,  inline: true  });
  return fields;
}

async function sendViaBot(order) {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId || !client.isReady()) return;

  const channel = await client.channels.fetch(channelId);
  const embed = new EmbedBuilder()
    .setTitle('🎮 New Order — Checkout Started')
    .setColor(0xff4655)
    .addFields(buildEmbedPayload(order))
    .setTimestamp()
    .setFooter({ text: 'ValoBooster • Customer sent to Stripe checkout' });

  await channel.send({ embeds: [embed] });
}

async function sendViaWebhook(order) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.includes('YOUR_')) return;

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'ValoBooster Orders',
      embeds: [{
        title: '🎮 New Order — Checkout Started',
        color: 0xff4655,
        fields: buildEmbedPayload(order),
        footer: { text: 'ValoBooster • Customer sent to Stripe checkout' },
        timestamp: new Date().toISOString(),
      }],
    }),
  });
}

async function sendOrderNotification(order) {
  await Promise.allSettled([
    sendViaBot(order).catch(err => console.error('Bot notify error:', err.message)),
    sendViaWebhook(order).catch(err => console.error('Webhook notify error:', err.message)),
  ]);
}

async function login() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token.includes('YOUR_')) {
    console.log('Discord bot not configured — skipping');
    return;
  }
  await client.login(token);
}

module.exports = { login, sendOrderNotification };
