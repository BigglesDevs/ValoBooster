const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Conversation history per channel (keeps context across messages)
const conversations = new Map();

const OWNER_ID = process.env.CLAUDE_BOT_OWNER_ID;

const SYSTEM_PROMPT = `You are Claude, an AI assistant with full admin control over the ValoBooster Discord server — a professional Valorant rank boosting business. You can create/delete/rename channels, send messages to any channel, and help the owner manage the server. Be concise. Confirm what you've done after taking actions.`;

const tools = [
  {
    name: 'create_channel',
    description: 'Create a new text, voice, or category channel in the server',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Channel name (lowercase, no spaces — use hyphens)' },
        type: { type: 'string', enum: ['text', 'voice', 'category'], description: 'Channel type' },
        category: { type: 'string', description: 'Name of the category to place this channel in (optional)' },
        topic: { type: 'string', description: 'Channel topic shown in the header (optional, text channels only)' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'delete_channel',
    description: 'Delete a channel from the server by name',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the channel to delete' },
      },
      required: ['name'],
    },
  },
  {
    name: 'rename_channel',
    description: 'Rename an existing channel',
    input_schema: {
      type: 'object',
      properties: {
        current_name: { type: 'string', description: 'Current channel name' },
        new_name: { type: 'string', description: 'New channel name' },
      },
      required: ['current_name', 'new_name'],
    },
  },
  {
    name: 'list_channels',
    description: 'List all channels in the server',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'send_message',
    description: 'Send a message to a specific channel',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name to send to' },
        message: { type: 'string', description: 'Message content' },
      },
      required: ['channel', 'message'],
    },
  },
  {
    name: 'set_channel_topic',
    description: 'Set or update the topic of a text channel',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name' },
        topic: { type: 'string', description: 'New topic text' },
      },
      required: ['channel', 'topic'],
    },
  },
];

async function executeTool(guild, name, input) {
  try {
    switch (name) {
      case 'create_channel': {
        const channelType =
          input.type === 'voice' ? ChannelType.GuildVoice :
          input.type === 'category' ? ChannelType.GuildCategory :
          ChannelType.GuildText;

        let parentId;
        if (input.category && input.type !== 'category') {
          const cat = guild.channels.cache.find(
            c => c.name.toLowerCase() === input.category.toLowerCase() && c.type === ChannelType.GuildCategory
          );
          if (cat) parentId = cat.id;
        }

        const ch = await guild.channels.create({
          name: input.name,
          type: channelType,
          topic: input.topic,
          parent: parentId,
        });
        return `Created ${input.type} channel #${ch.name}.`;
      }

      case 'delete_channel': {
        const ch = guild.channels.cache.find(c => c.name.toLowerCase() === input.name.toLowerCase());
        if (!ch) return `No channel named "${input.name}" found.`;
        await ch.delete();
        return `Deleted #${input.name}.`;
      }

      case 'rename_channel': {
        const ch = guild.channels.cache.find(c => c.name.toLowerCase() === input.current_name.toLowerCase());
        if (!ch) return `No channel named "${input.current_name}" found.`;
        await ch.setName(input.new_name);
        return `Renamed #${input.current_name} to #${input.new_name}.`;
      }

      case 'list_channels': {
        const lines = guild.channels.cache
          .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))
          .map(c => {
            const icon = c.type === ChannelType.GuildCategory ? '📁' :
                         c.type === ChannelType.GuildVoice ? '🔊' : '#';
            return `${icon} ${c.name}`;
          });
        return lines.join('\n');
      }

      case 'send_message': {
        const ch = guild.channels.cache.find(c => c.name.toLowerCase() === input.channel.toLowerCase());
        if (!ch) return `No channel named "${input.channel}" found.`;
        await ch.send(input.message);
        return `Message sent to #${input.channel}.`;
      }

      case 'set_channel_topic': {
        const ch = guild.channels.cache.find(c => c.name.toLowerCase() === input.channel.toLowerCase());
        if (!ch) return `No channel named "${input.channel}" found.`;
        await ch.setTopic(input.topic);
        return `Topic updated for #${input.channel}.`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

async function askClaude(guild, channelId, userMessage) {
  if (!conversations.has(channelId)) conversations.set(channelId, []);
  const history = conversations.get(channelId);

  history.push({ role: 'user', content: userMessage });
  if (history.length > 40) history.splice(0, history.length - 40);

  let response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: history,
    tools,
  });

  // Agentic tool-use loop
  while (response.stop_reason === 'tool_use') {
    const toolUses = response.content.filter(b => b.type === 'tool_use');
    const results = [];

    for (const t of toolUses) {
      const result = await executeTool(guild, t.name, t.input);
      results.push({ type: 'tool_result', tool_use_id: t.id, content: result });
    }

    history.push({ role: 'assistant', content: response.content });
    history.push({ role: 'user', content: results });

    response = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: history,
      tools,
    });
  }

  const text = response.content.find(b => b.type === 'text')?.text ?? 'Done.';
  history.push({ role: 'assistant', content: response.content });
  return text;
}

client.once('ready', () => {
  console.log(`Claude bot ready: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Only respond if mentioned or in DMs
  const isDM = !message.guild;
  const isMentioned = message.mentions.has(client.user);
  if (!isDM && !isMentioned) return;

  // Restrict to owner if CLAUDE_BOT_OWNER_ID is set
  if (OWNER_ID && message.author.id !== OWNER_ID) {
    return message.reply('Sorry, only the server owner can use this bot.');
  }

  // !clear resets conversation history for this channel
  const content = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (content.toLowerCase() === '!clear') {
    conversations.delete(message.channel.id);
    return message.reply('Conversation history cleared.');
  }

  if (!content) return;

  await message.channel.sendTyping();

  try {
    const guild = message.guild ?? client.guilds.cache.first();
    const reply = await askClaude(guild, message.channel.id, content);

    // Split replies that exceed Discord's 2000 char limit
    if (reply.length <= 2000) {
      await message.reply(reply);
    } else {
      const chunks = reply.match(/[\s\S]{1,2000}/g) ?? [];
      for (const chunk of chunks) await message.channel.send(chunk);
    }
  } catch (err) {
    console.error('Claude bot error:', err);
    await message.reply('Something went wrong. Please try again.');
  }
});

module.exports = { login: () => client.login(process.env.CLAUDE_BOT_TOKEN) };
