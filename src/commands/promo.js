const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promo')
    .setDescription('Post a promo code to the promo-codes channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('code')
        .setDescription('The promo code (e.g. SAVE20)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('discount')
        .setDescription('The discount amount (e.g. 20% off)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('description')
        .setDescription('Any extra details about this promo')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ You need the Admin role to use this.', ephemeral: true });
    }

    const code        = interaction.options.getString('code').toUpperCase();
    const discount    = interaction.options.getString('discount');
    const description = interaction.options.getString('description') ?? 'Limited time offer!';

    const channel = interaction.guild.channels.cache.find(c => c.name.includes('promo'));
    if (!channel) {
      return interaction.reply({ content: '❌ No promo-codes channel found.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎟️ New Promo Code!')
      .setDescription(`Use code **\`${code}\`** for **${discount}**\n\n${description}`)
      .setColor(0xff4655)
      .setFooter({ text: 'ValoBooster • Use at checkout' })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Promo posted in ${channel}.`, ephemeral: true });
  },
};
