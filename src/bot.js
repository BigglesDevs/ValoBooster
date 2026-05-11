require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const client = require('./client');

// Load commands
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// Load events
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  const handler = (...args) => event.execute(...args, client);
  event.once ? client.once(event.name, handler) : client.on(event.name, handler);
}

async function login() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token.includes('YOUR_')) {
    console.log('Discord bot not configured — skipping');
    return;
  }
  await client.login(token);
}

const { sendOrderNotification } = require('./utils/notify');

module.exports = { login, sendOrderNotification };
