const { welcomeEmbed } = require('../utils/embeds');

module.exports = {
  name: 'guildMemberAdd',
  once: false,
  execute(member) {
    const { guild } = member;
    const find = name => guild.channels.cache.find(c => c.name.includes(name));

    const welcomeChannel = find('welcome');
    if (!welcomeChannel) return;

    const channels = {
      rules:      find('rules')        ? `<#${find('rules').id}>`         : '`#rules`',
      howToOrder: find('how-to-order') ? `<#${find('how-to-order').id}>` : '`#how-to-order`',
      tickets:    find('open-a-ticket')? `<#${find('open-a-ticket').id}>`: '`#open-a-ticket`',
    };

    welcomeChannel.send({ embeds: [welcomeEmbed(member, channels)] }).catch(console.error);
  },
};
