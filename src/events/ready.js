const { REST, Routes } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Discord bot logged in as ${client.user.tag}`);

    const clientId = process.env.DISCORD_CLIENT_ID;
    const token    = process.env.DISCORD_BOT_TOKEN;

    if (!clientId || clientId.includes('YOUR_')) {
      console.log('DISCORD_CLIENT_ID not set — skipping slash command deploy');
      return;
    }

    try {
      const commands = [...client.commands.values()].map(c => c.data.toJSON());
      const rest = new REST().setToken(token);
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`Registered ${commands.length} slash commands.`);
    } catch (err) {
      console.error('Failed to register slash commands:', err);
    }
  },
};
