const {
  Client, GatewayIntentBits, EmbedBuilder,
  ChannelType, PermissionFlagsBits, ActionRowBuilder,
  ButtonBuilder, ButtonStyle,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
});

// ─── WELCOME ────────────────────────────────────────────────────────────────

client.on('guildMemberAdd', async (member) => {
  const channel = member.guild.channels.cache.find(c => c.name.includes('welcome'));
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`👋 Welcome to ValoBooster, ${member.user.username}!`)
    .setDescription(
      `We're the **#1 Valorant rank boosting service**.\n\n` +
      `• Check <#${getChannel(member.guild, 'rules')}> to get started\n` +
      `• Head to <#${getChannel(member.guild, 'how-to-order')}> to place an order\n` +
      `• Use <#${getChannel(member.guild, 'open-a-ticket')}> if you need support`
    )
    .setColor(0xff4655)
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: 'ValoBooster • Fast. Safe. Guaranteed.' })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
});

// ─── TICKET SYSTEM ──────────────────────────────────────────────────────────

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Post the ticket panel when staff types !ticketpanel in any channel
  if (message.content === '!ticketpanel' && message.member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await message.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle('🎫 Open a Support Ticket')
      .setDescription(
        'Need help with your order or have a question?\n\n' +
        'Click the button below and a private channel will be created for you.'
      )
      .setColor(0xff4655)
      .setFooter({ text: 'ValoBooster Support' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_ticket')
        .setLabel('Open Ticket')
        .setEmoji('🎫')
        .setStyle(ButtonStyle.Danger)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  }
});

client.on('interactionCreate', async (interaction) => {
  // ── Open ticket ──
  if (interaction.isButton() && interaction.customId === 'open_ticket') {
    const guild = interaction.guild;
    const user  = interaction.user;
    const ticketName = `ticket-${user.username.toLowerCase().replace(/\s+/g, '-')}`;

    const existing = guild.channels.cache.find(c => c.name === ticketName);
    if (existing) {
      return interaction.reply({ content: `You already have an open ticket: ${existing}`, ephemeral: true });
    }

    // Find SUPPORT category
    const category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('support')
    );

    const ticketChannel = await guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      parent: category?.id,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ],
    });

    const embed = new EmbedBuilder()
      .setTitle('🎫 Ticket Opened')
      .setDescription(`Hello ${user}, a staff member will be with you shortly.\n\nDescribe your issue below.`)
      .setColor(0xff4655)
      .setFooter({ text: 'Click Close Ticket when your issue is resolved.' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Secondary)
    );

    await ticketChannel.send({ content: `${user}`, embeds: [embed], components: [row] });
    await interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });
  }

  // ── Close ticket ──
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    const channel = interaction.channel;

    const embed = new EmbedBuilder()
      .setTitle('🔒 Ticket Closing')
      .setDescription('This ticket will be deleted in 5 seconds.')
      .setColor(0xff4655);

    await interaction.reply({ embeds: [embed] });
    setTimeout(() => channel.delete().catch(() => {}), 5000);
  }
});

// ─── ORDER NOTIFICATIONS ─────────────────────────────────────────────────────

function getChannel(guild, name) {
  return guild?.channels.cache.find(c => c.name.includes(name))?.id ?? name;
}

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
