const { EmbedBuilder } = require('discord.js');

const BRAND_COLOR = 0xff4655;

const TICKET_TYPES = {
  payment: { label: 'Payment',  emoji: '💳', description: 'Billing, orders, refunds & transactions' },
  support: { label: 'Support',  emoji: '🔧', description: 'Technical help & troubleshooting' },
};

function welcomeEmbed(member, channels) {
  return new EmbedBuilder()
    .setTitle(`👋 Welcome to ValoBooster, ${member.user.username}!`)
    .setDescription(
      `We're the **#1 Valorant rank boosting service**.\n\n` +
      `• 📌 Read the rules in ${channels.rules ?? '`#rules`'}\n` +
      `• 📋 Learn how to order in ${channels.howToOrder ?? '`#how-to-order`'}\n` +
      `• 🎫 Need help? Open a ticket in ${channels.tickets ?? '`#open-a-ticket`'}`
    )
    .setColor(BRAND_COLOR)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: 'ValoBooster • Fast. Safe. Guaranteed.' })
    .setTimestamp();
}

function ticketPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('🎫 Open a Support Ticket')
    .setDescription(
      'Need help with your order or have a question?\n\n' +
      '**💳 Payment** — Billing, orders, refunds & transactions\n' +
      '**🔧 Support** — Technical help & troubleshooting\n\n' +
      'Select a category below to open a ticket.'
    )
    .setColor(BRAND_COLOR)
    .setFooter({ text: 'ValoBooster Support • Max 3 open tickets per user' });
}

function ticketOpenEmbed(user, type) {
  const t = TICKET_TYPES[type] ?? TICKET_TYPES.support;
  return new EmbedBuilder()
    .setTitle(`${t.emoji} ${t.label} Ticket`)
    .setDescription(
      `Hello ${user}, a staff member will be with you shortly.\n\n` +
      `**Category:** ${t.description}\n\n` +
      `Please describe your issue below.`
    )
    .setColor(BRAND_COLOR)
    .setFooter({ text: 'Click Close Ticket when your issue is resolved.' })
    .setTimestamp();
}

function orderEmbed(order) {
  const fields = [
    { name: '📦 Service', value: order.service,      inline: true  },
    { name: '💰 Total',   value: `£${order.total}`,  inline: true  },
    { name: '📧 Email',   value: order.email || '—', inline: false },
    { name: '⚙️ Options', value: order.options,      inline: false },
  ];
  if (order.addons) fields.push({ name: '➕ Add-ons', value: order.addons, inline: false });
  if (order.promo)  fields.push({ name: '🏷️ Promo',  value: order.promo,  inline: true  });

  return new EmbedBuilder()
    .setTitle('🎮 New Order — Payment Confirmed')
    .setColor(BRAND_COLOR)
    .addFields(fields)
    .setTimestamp()
    .setFooter({ text: 'ValoBooster • Payment successfully received' });
}

module.exports = { welcomeEmbed, ticketPanelEmbed, ticketOpenEmbed, orderEmbed, TICKET_TYPES };
