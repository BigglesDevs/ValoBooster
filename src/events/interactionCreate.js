const {
  ChannelType, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { ticketOpenEmbed, TICKET_TYPES } = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');

const MAX_TICKETS = 3;

// Find or create a Discord category by name
async function getOrCreateCategory(guild, name) {
  const existing = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return existing;
  return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

async function openTicket(interaction, type) {
  const { guild, user } = interaction;
  const t = TICKET_TYPES[type];

  // Count existing open tickets for this user
  const userTickets = guild.channels.cache.filter(
    c => c.type === ChannelType.GuildText && c.topic?.includes(`uid:${user.id}`)
  );

  if (userTickets.size >= MAX_TICKETS) {
    return interaction.reply({
      content: `❌ You already have **${userTickets.size}** open tickets. Please close one before opening another.`,
      ephemeral: true,
    });
  }

  const ticketName = `${t.emoji.name ?? type}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  const category = await getOrCreateCategory(guild, `${t.emoji}│${t.label.toUpperCase()} TICKETS`);

  const staffRoleId = process.env.STAFF_ROLE_ID;
  const permOverwrites = [
    { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (staffRoleId && !staffRoleId.includes('YOUR_')) {
    permOverwrites.push({
      id: staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const ticketChannel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `uid:${user.id} | type:${type}`,
    permissionOverwrites: permOverwrites,
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close Ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Secondary)
  );

  await ticketChannel.send({ content: `${user}`, embeds: [ticketOpenEmbed(user, type)], components: [row] });
  await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
}

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    // ── Slash commands ──────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`Command error (${interaction.commandName}):`, err);
        const msg = { content: '❌ Something went wrong.', ephemeral: true };
        interaction.replied ? interaction.followUp(msg) : interaction.reply(msg);
      }
      return;
    }

    // ── Ticket category select ──────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
      const type = interaction.values[0];
      await openTicket(interaction, type);
      return;
    }

    if (!interaction.isButton()) return;

    // ── Close ticket ────────────────────────────────────────────────────────
    if (interaction.customId === 'close_ticket') {
      const topic = interaction.channel.topic ?? '';
      const ownerId = topic.match(/uid:(\d+)/)?.[1];

      if (!isStaff(interaction.member) && interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ Only staff or the ticket owner can close this.', ephemeral: true });
      }

      await interaction.reply({ content: '🔒 Ticket closing in 5 seconds...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  },
};
