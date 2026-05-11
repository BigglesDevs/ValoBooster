const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send an announcement to the announcements channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('The announcement message')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('Optional title for the announcement')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You need the Admin role to use this.', ephemeral: true });
    }

    const message = interaction.options.getString('message');
    const title   = interaction.options.getString('title') ?? '📣 Announcement';

    const channel = interaction.guild.channels.cache.find(c => c.name.includes('announcements'));
    if (!channel) {
      return interaction.reply({ content: '❌ No announcements channel found.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(message)
      .setColor(0xff4655)
      .setFooter({ text: `Posted by ${interaction.user.username}` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Announcement posted in ${channel}.`, ephemeral: true });
  },
};
