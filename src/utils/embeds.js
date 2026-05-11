const { EmbedBuilder } = require('discord.js');

const BRAND_COLOR = 0xff4655;

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
      'Click the button below and a private support channel will be created just for you.'
    )
    .setColor(BRAND_COLOR)
    .setFooter({ text: 'ValoBooster Support' });
}

function ticketOpenEmbed(user) {
  return new EmbedBuilder()
    .setTitle('🎫 Ticket Opened')
    .setDescription(
      `Hello ${user}, a staff member will be with you shortly.\n\n` +
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
    .setTitle('🎮 New Order — Checkout Started')
    .setColor(BRAND_COLOR)
    .addFields(fields)
    .setTimestamp()
    .setFooter({ text: 'ValoBooster • Customer sent to Stripe checkout' });
}

module.exports = { welcomeEmbed, ticketPanelEmbed, ticketOpenEmbed, orderEmbed };
