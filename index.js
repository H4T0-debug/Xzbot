require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const express = require('express');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const PREFIX = ';';
const API_BASE = 'https://scriptblox.com/api/script/search';

// Keep Render awake
const app = express();
app.get('/', (req, res) => res.send('XZ Bot is online'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HTTP server on port ${PORT}`));

// ============ Helpers ============
function parseArgs(text) {
  const args = {};
  const parts = text.trim().split(/\s+/);
  for (const part of parts) {
    if (part.includes(':')) {
      const [key, ...rest] = part.split(':');
      const value = rest.join(':').trim();
      if (key && value) args[key.toLowerCase()] = value;
    }
  }
  return args;
}

function buildQueryParams(args) {
  const params = new URLSearchParams();
  const query = args.script || args.q || args.query || args.name;
  if (query) params.set('q', query);

  const boolMap = { verified: 'verified', key: 'key', patched: 'patched', universal: 'universal' };
  for (const [userKey, apiKey] of Object.entries(boolMap)) {
    if (args[userKey] !== undefined) {
      const val = args[userKey].toLowerCase();
      params.set(apiKey, (val === 'true' || val === '1' || val === 'yes') ? '1' : '0');
    }
  }

  if (args.mode) {
    const mode = args.mode.toLowerCase();
    if (mode === 'free' || mode === 'paid') params.set('mode', mode);
  }

  if (args.page) params.set('page', args.page);
  if (args.max) params.set('max', Math.min(parseInt(args.max) || 10, 20));
  if (args.sortby || args.sort) params.set('sortBy', (args.sortby || args.sort).toLowerCase());
  if (args.order) params.set('order', args.order.toLowerCase());
  if (args.strict) params.set('strict', args.strict.toLowerCase() === 'true' ? 'true' : 'false');
  if (args.owner) params.set('owner', args.owner);
  if (args.placeid || args.placeId) params.set('placeId', args.placeid || args.placeId);
  if (!params.has('max')) params.set('max', '8');

  return params;
}

async function searchScripts(args) {
  const params = buildQueryParams(args);
  if (!params.has('q')) {
    return { error: 'Missing search query. Use `script:something`' };
  }

  const url = `\( {API_BASE}? \){params.toString()}`;
  console.log('Fetching:', url);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://scriptblox.com/',
        'Origin': 'https://scriptblox.com'
      }
    });

    if (!res.ok) {
      console.error(`API returned status ${res.status}`);
      return { error: `ScriptBlox API error (${res.status})` };
    }

    const data = await res.json();

    if (data.message) return { error: data.message };
    if (!data.result?.scripts) return { error: 'No results found' };

    return { data: data.result };
  } catch (err) {
    console.error('Fetch error:', err);
    return { error: 'Failed to reach ScriptBlox API' };
  }
}

function createEmbeds(scripts) {
  const embeds = [];
  for (const script of scripts.slice(0, 8)) {
    const embed = new EmbedBuilder()
      .setColor(script.verified ? 0x57F287 : 0x5865F2)
      .setTitle(script.title || 'Untitled')
      .setURL(`https://scriptblox.com/script/${script.slug}`)
      .setDescription(
        `**Game:** ${script.game?.name || 'Unknown'}\n` +
        `**Type:** ${script.scriptType || 'N/A'} ${script.key ? '🔑' : ''} ${script.isUniversal ? '🌐' : ''}\n` +
        `**Views:** ${script.views?.toLocaleString() || 0}`
      )
      .addFields(
        { name: 'Verified', value: script.verified ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Key System', value: script.key ? 'Yes' : 'No', inline: true },
        { name: 'Patched', value: script.isPatched ? 'Yes' : 'No', inline: true }
      )
      .setFooter({ text: 'Powered by ScriptBlox.com • XZ Bot' })
      .setTimestamp(new Date(script.createdAt || Date.now()));

    if (script.image) {
      embed.setThumbnail(script.image.startsWith('http') ? script.image : `https://scriptblox.com${script.image}`);
    } else if (script.game?.imageUrl) {
      embed.setThumbnail(script.game.imageUrl.startsWith('http') ? script.game.imageUrl : `https://scriptblox.com${script.game.imageUrl}`);
    }
    embeds.push(embed);
  }
  return embeds;
}

// ============ Ready ============
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('search')
      .setDescription('Search scripts on ScriptBlox')
      .addStringOption(opt => opt.setName('query').setDescription('Script / game name').setRequired(true))
      .addBooleanOption(opt => opt.setName('verified').setDescription('Only verified scripts'))
      .addStringOption(opt => opt.setName('mode').setDescription('free or paid').addChoices(
        { name: 'Free', value: 'free' },
        { name: 'Paid', value: 'paid' }
      ))
      .addBooleanOption(opt => opt.setName('key').setDescription('Has key system'))
      .addBooleanOption(opt => opt.setName('universal').setDescription('Universal scripts'))
      .addIntegerOption(opt => opt.setName('max').setDescription('Max results (1-20)').setMinValue(1).setMaxValue(20))
      .addIntegerOption(opt => opt.setName('page').setDescription('Page number').setMinValue(1))
  ].map(cmd => cmd.toJSON());

  try {
    await client.application.commands.set(commands);
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
});

// ============ Prefix ============
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const content = message.content.slice(PREFIX.length).trim();
  const [command, ...rest] = content.split(/\s+/);
  const argsText = rest.join(' ');

  if (command.toLowerCase() === 'search') {
    const args = parseArgs(argsText);
    if (!args.script && !args.q && !args.query && argsText) args.script = argsText;

    await message.channel.sendTyping();
    const result = await searchScripts(args);

    if (result.error) return message.reply(`❌ ${result.error}`);

    const embeds = createEmbeds(result.data.scripts);
    if (embeds.length === 0) return message.reply('No scripts found.');

    const pageText = result.data.totalPages > 1 ? ` • Page 1/${result.data.totalPages}` : '';
    await message.reply({
      content: `Found **\( {result.data.scripts.length}** result(s) \){pageText}`,
      embeds: embeds.slice(0, 4)
    });
  }
});

// ============ Slash ============
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'search') {
    await interaction.deferReply();

    const args = {
      script: interaction.options.getString('query'),
      verified: interaction.options.getBoolean('verified')?.toString(),
      mode: interaction.options.getString('mode'),
      key: interaction.options.getBoolean('key')?.toString(),
      universal: interaction.options.getBoolean('universal')?.toString(),
      max: interaction.options.getInteger('max')?.toString(),
      page: interaction.options.getInteger('page')?.toString()
    };

    const result = await searchScripts(args);
    if (result.error) return interaction.editReply(`❌ ${result.error}`);

    const embeds = createEmbeds(result.data.scripts);
    if (embeds.length === 0) return interaction.editReply('No scripts found.');

    const pageText = result.data.totalPages > 1 ? ` • Page 1/${result.data.totalPages}` : '';
    await interaction.editReply({
      content: `Found **\( {result.data.scripts.length}** result(s) \){pageText}`,
      embeds: embeds.slice(0, 4)
    });
  }
});

// ============ Login ============
const token = process.env.TOKEN;
if (!token) {
  console.error('❌ TOKEN environment variable is missing!');
  process.exit(1);
}

client.login(token).catch(err => {
  console.error('❌ Failed to login:', err.message);
  process.exit(1);
});
