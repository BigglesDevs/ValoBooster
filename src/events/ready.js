module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`Discord bot logged in as ${client.user.tag}`);
  },
};
