const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { ticketPanelEmbed } = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Post the support ticket panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ You need the Staff role to use this.', ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_select')
        .setPlaceholder('🎫 Select a category!')
        .addOptions([
          {
            label: 'Payment',
            description: 'Billing, orders, refunds & transactions',
            value: 'payment',
            emoji: '💳',
          },
          {
            label: 'Support',
            description: 'Technical help & troubleshooting',
            value: 'support',
            emoji: '🔧',
          },
        ])
    );

    await interaction.channel.send({ embeds: [ticketPanelEmbed()], components: [row] });
    await interaction.reply({ content: '✅ Ticket panel posted.', ephemeral: true });
  },
};
