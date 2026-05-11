const client = require('../client');
const { orderEmbed } = require('./embeds');

async function sendViaBot(order) {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId || !client.isReady()) return;
  const channel = await client.channels.fetch(channelId);
  await channel.send({ embeds: [orderEmbed(order)] });
}

async function sendViaWebhook(order) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl || webhookUrl.includes('YOUR_')) return;

  const embed = orderEmbed(order).toJSON();
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'ValoBooster Orders',
      embeds: [embed],
    }),
  });
}

async function sendOrderNotification(order) {
  await Promise.allSettled([
    sendViaBot(order).catch(err => console.error('Bot notify error:', err.message)),
    sendViaWebhook(order).catch(err => console.error('Webhook notify error:', err.message)),
  ]);
}

module.exports = { sendOrderNotification };
