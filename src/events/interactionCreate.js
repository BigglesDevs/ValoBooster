const {
  ChannelType, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { ticketOpenEmbed } = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');

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

    if (!interaction.isButton()) return;

    // ── Open ticket ─────────────────────────────────────────────────────────
    if (interaction.customId === 'open_ticket') {
      const { guild, user } = interaction;
      const ticketName = `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      const existing = guild.channels.cache.find(c => c.name === ticketName);
      if (existing) {
        return interaction.reply({ content: `You already have an open ticket: ${existing}`, ephemeral: true });
      }

      const category = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('support')
      );

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
        parent: category?.id,
        permissionOverwrites: permOverwrites,
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Secondary)
      );

      await ticketChannel.send({ content: `${user}`, embeds: [ticketOpenEmbed(user)], components: [row] });
      await interaction.reply({ content: `Ticket created: ${ticketChannel}`, ephemeral: true });
      return;
    }

    // ── Close ticket ────────────────────────────────────────────────────────
    if (interaction.customId === 'close_ticket') {
      if (!isStaff(interaction.member) && !interaction.channel.name.startsWith(`ticket-${interaction.user.username.toLowerCase()}`)) {
        return interaction.reply({ content: '❌ Only staff or the ticket owner can close this.', ephemeral: true });
      }

      await interaction.reply({ content: '🔒 Ticket closing in 5 seconds...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  },
};
