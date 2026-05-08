const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
});

async function sendOrderNotification(order) {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);

    const embed = new EmbedBuilder()
      .setTitle('🎮 New Order — Checkout Started')
      .setColor(0xff4655)
      .addFields(
        { name: '📦 Service', value: order.service,          inline: true  },
        { name: '💰 Total',   value: `$${order.total}`,      inline: true  },
        { name: '📧 Email',   value: order.email || '—',     inline: false },
        { name: '⚙️ Options', value: order.options,          inline: false },
      )
      .setTimestamp()
      .setFooter({ text: 'ValoBooster • Customer sent to Stripe checkout' });

    if (order.addons) embed.addFields({ name: '➕ Add-ons', value: order.addons, inline: false });
    if (order.promo)  embed.addFields({ name: '🏷️ Promo',  value: order.promo,  inline: true  });

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Discord bot error:', err.message);
  }
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
