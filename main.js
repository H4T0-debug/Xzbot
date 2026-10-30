// main.js
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType,
  SlashCommandBuilder,
} = require("discord.js");

// ================== CONFIG ==================
const TOKEN = process.env.TOKEN; // Set this in your host environment variables
const PREFIX = ";";
const BOT_NAME = "XZ";
const API_BASE = "https://scriptblox.com/api/script/search";
// ============================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ---------- Helpers ----------
function isTruthy(value) {
  return ["true", "1", "yes", "y"].includes(value.toLowerCase());
}

function toIntStrict(value) {
  // Mirrors Python's int() for plain integer strings; returns null on failure
  if (!/^[+-]?\d+$/.test(value)) return null;
  return parseInt(value, 10);
}

// ---------- Argument Parser ----------
function parseArgs(text) {
  /**
   * Parses: script:name verified:true mode:free sortBy:views ...
   */
  const args = {};
  const pattern = /(\w+):([^\s]+(?:\s+[^\s:]+)*)/g;

  for (const match of text.matchAll(pattern)) {
    const key = match[1].toLowerCase().trim();
    const value = match[2].trim();

    if (["script", "q", "query", "name"].includes(key)) {
      args.q = value;
    } else if (key === "verified") {
      args.verified = isTruthy(value) ? 1 : 0;
    } else if (key === "key") {
      args.key = isTruthy(value) ? 1 : 0;
    } else if (key === "universal") {
      args.universal = isTruthy(value) ? 1 : 0;
    } else if (key === "patched") {
      args.patched = isTruthy(value) ? 1 : 0;
    } else if (key === "mode") {
      if (["free", "paid"].includes(value.toLowerCase())) {
        args.mode = value.toLowerCase();
      }
    } else if (key === "sortby" || key === "sort") {
      const valid = [
        "views",
        "likecount",
        "createdat",
        "updatedat",
        "dislikecount",
        "accuracy",
      ];
      if (valid.includes(value.toLowerCase())) {
        const mapping = {
          views: "views",
          likecount: "likeCount",
          createdat: "createdAt",
          updatedat: "updatedAt",
          dislikecount: "dislikeCount",
          accuracy: "accuracy",
        };
        args.sortBy = mapping[value.toLowerCase()];
      }
    } else if (key === "order") {
      if (["asc", "desc"].includes(value.toLowerCase())) {
        args.order = value.toLowerCase();
      }
    } else if (key === "page") {
      const n = toIntStrict(value);
      if (n !== null) args.page = Math.max(1, n);
    } else if (key === "max") {
      const n = toIntStrict(value);
      if (n !== null) args.max = Math.min(20, Math.max(1, n));
    } else if (key === "owner") {
      args.owner = value;
    } else if (key === "placeid" || key === "place") {
      const n = toIntStrict(value);
      if (n !== null) args.placeId = n;
    } else if (key === "strict") {
      args.strict = isTruthy(value) ? "true" : "false";
    }
  }

  return args;
}

// ---------- API Call ----------
async function searchScripts(params) {
  if (!("q" in params)) {
    return { error: "Missing required argument: script: (or q:)" };
  }

  const query = new URLSearchParams(params).toString();
  const url = `${API_BASE}?${query}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    const data = await resp.json();
    if (data && "message" in data) {
      return { error: data.message };
    }
    return data;
  } catch (e) {
    return { error: `API request failed: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Embed Builder ----------
function buildResultsEmbed(data, query, page = 1) {
  const result = data.result || {};
  const scripts = result.scripts || [];
  const totalPages = result.totalPages ?? 1;

  const embed = new EmbedBuilder()
    .setTitle(`🔍 ScriptBlox Search — \`${query}\``)
    .setDescription(
      `Page **${page}** / **${totalPages}** • Found **${scripts.length}** scripts`
    )
    .setColor(0x9b59b6)
    .setFooter({ text: "Powered by ScriptBlox.com • XZ Bot" });

  if (scripts.length === 0) {
    embed.setDescription("No scripts found with those filters.");
    return embed;
  }

  const limited = scripts.slice(0, 10);
  for (let i = 0; i < limited.length; i++) {
    const s = limited[i];
    const title = s.title || "Unknown";
    const game = (s.game && s.game.name) || "Unknown Game";
    const views = s.views ?? 0;
    const verified = s.verified ? "✅" : "❌";
    const key = s.key ? "🔑" : "🔓";
    const universal = s.isUniversal ? "🌐" : "";
    const patched = s.isPatched ? "🩹" : "";
    const scriptType = s.scriptType || "?";
    const slug = s.slug || "";
    const link = slug ? `https://scriptblox.com/script/${slug}` : "N/A";

    const value =
      `**Game:** ${game}\n` +
      `**Views:** ${views.toLocaleString("en-US")} | **Type:** ${scriptType}\n` +
      `${verified} Verified | ${key} Key | ${universal} ${patched}\n` +
      `[View on ScriptBlox](${link})`;

    embed.addFields({ name: `${i + 1}. ${title}`, value, inline: false });
  }

  return embed;
}

// ---------- Prefix Command ----------
async function searchPrefix(message, argsText) {
  if (!argsText) {
    await message.reply({
      content:
        `**Usage:**\n` +
        `\`${PREFIX}search script:arsenal verified:true mode:free sortBy:views order:desc max:10\`\n\n` +
        `**Supported keys:**\n` +
        `\`script:\` / \`q:\` (required)\n` +
        `\`verified:\` \`key:\` \`universal:\` \`patched:\` (true/false)\n` +
        `\`mode:\` free/paid\n` +
        `\`sortBy:\` views/likeCount/createdAt/updatedAt/dislikeCount/accuracy\n` +
        `\`order:\` asc/desc\n` +
        `\`page:\` \`max:\` \`owner:\` \`placeId:\` \`strict:\``,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const params = parseArgs(argsText);
  if (!("q" in params)) {
    await message.reply({
      content: "❌ Missing `script:` (or `q:`) argument.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const msg = await message.reply({
    content: "🔍 Searching ScriptBlox...",
    allowedMentions: { repliedUser: false },
  });

  const data = await searchScripts(params);
  if (data.error) {
    await msg.edit({ content: `❌ Error: ${data.error}` });
    return;
  }

  const embed = buildResultsEmbed(data, params.q, params.page ?? 1);
  await msg.edit({ content: null, embeds: [embed] });
}

// ---------- Slash Command ----------
const searchCommand = new SlashCommandBuilder()
  .setName("search")
  .setDescription("Search scripts on ScriptBlox")
  .addStringOption((o) =>
    o.setName("script").setDescription("Search query (required)").setRequired(true)
  )
  .addBooleanOption((o) =>
    o.setName("verified").setDescription("Only verified scripts")
  )
  .addBooleanOption((o) =>
    o.setName("key").setDescription("Has key system")
  )
  .addBooleanOption((o) =>
    o.setName("universal").setDescription("Universal scripts only")
  )
  .addBooleanOption((o) =>
    o.setName("patched").setDescription("Patched scripts")
  )
  .addStringOption((o) =>
    o
      .setName("mode")
      .setDescription("free or paid")
      .addChoices(
        { name: "Free", value: "free" },
        { name: "Paid", value: "paid" }
      )
  )
  .addStringOption((o) =>
    o
      .setName("sort_by")
      .setDescription("Sort by")
      .addChoices(
        { name: "Views", value: "views" },
        { name: "Like Count", value: "likeCount" },
        { name: "Created At", value: "createdAt" },
        { name: "Updated At", value: "updatedAt" },
        { name: "Dislike Count", value: "dislikeCount" },
        { name: "Accuracy", value: "accuracy" }
      )
  )
  .addStringOption((o) =>
    o
      .setName("order")
      .setDescription("asc or desc")
      .addChoices(
        { name: "Descending", value: "desc" },
        { name: "Ascending", value: "asc" }
      )
  )
  .addIntegerOption((o) =>
    o.setName("page").setDescription("Page number")
  )
  .addIntegerOption((o) =>
    o.setName("max").setDescription("Max results (1-20)")
  )
  .addStringOption((o) =>
    o.setName("owner").setDescription("Filter by owner username")
  )
  .addIntegerOption((o) =>
    o.setName("place_id").setDescription("Filter by Roblox place ID")
  );

async function searchSlash(interaction) {
  await interaction.deferReply();

  const script = interaction.options.getString("script", true);
  const verified = interaction.options.getBoolean("verified");
  const key = interaction.options.getBoolean("key");
  const universal = interaction.options.getBoolean("universal");
  const patched = interaction.options.getBoolean("patched");
  const mode = interaction.options.getString("mode");
  const sortBy = interaction.options.getString("sort_by");
  const order = interaction.options.getString("order");
  const page = interaction.options.getInteger("page");
  const max = interaction.options.getInteger("max");
  const owner = interaction.options.getString("owner");
  const placeId = interaction.options.getInteger("place_id");

  const params = {
    q: script,
    page: page || 1,
    max: Math.min(20, max || 10),
  };

  if (verified !== null) params.verified = verified ? 1 : 0;
  if (key !== null) params.key = key ? 1 : 0;
  if (universal !== null) params.universal = universal ? 1 : 0;
  if (patched !== null) params.patched = patched ? 1 : 0;
  if (mode) params.mode = mode;
  if (sortBy) params.sortBy = sortBy;
  if (order) params.order = order;
  if (owner) params.owner = owner;
  if (placeId) params.placeId = placeId;

  const data = await searchScripts(params);
  if (data.error) {
    await interaction.followup.send({ content: `❌ Error: ${data.error}` });
    return;
  }

  const embed = buildResultsEmbed(data, script, params.page);
  await interaction.followup.send({ embeds: [embed] });
}

// ---------- Help ----------
async function helpCmd(message) {
  const embed = new EmbedBuilder()
    .setTitle(`${BOT_NAME} — Help`)
    .setDescription(`Prefix: \`${PREFIX}\`\nAlso supports slash commands.`)
    .setColor(0x9b59b6)
    .addFields(
      {
        name: "Search",
        value:
          `\`${PREFIX}search script:arsenal verified:true mode:free\`\n` +
          `/search script:arsenal verified:True mode:free`,
        inline: false,
      },
      {
        name: "All filters",
        value:
          "`script:` / `q:` (required)\n" +
          "`verified:` `key:` `universal:` `patched:` true/false\n" +
          "`mode:` free / paid\n" +
          "`sortBy:` views / likeCount / createdAt / updatedAt / dislikeCount / accuracy\n" +
          "`order:` asc / desc\n" +
          "`page:` `max:` (1-20) `owner:` `placeId:` `strict:`",
        inline: false,
      }
    );

  await message.reply({
    embeds: [embed],
    allowedMentions: { repliedUser: false },
  });
}

// ---------- Message Handler ----------
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const withoutPrefix = message.content.slice(PREFIX.length).trim();
  const spaceIdx = withoutPrefix.indexOf(" ");
  const commandName = (
    spaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, spaceIdx)
  ).toLowerCase();
  const argsText =
    spaceIdx === -1 ? "" : withoutPrefix.slice(spaceIdx + 1).trim();

  try {
    if (commandName === "search") {
      await searchPrefix(message, argsText);
    } else if (commandName === "help") {
      await helpCmd(message);
    }
  } catch (e) {
    console.error(`Command error (${commandName}):`, e);
  }
});

// ---------- Interaction Handler ----------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "search") return;

  try {
    await searchSlash(interaction);
  } catch (e) {
    console.error("Slash command error:", e);
  }
});

// ---------- Ready + Sync ----------
client.once("ready", async () => {
  console.log(`✅ ${BOT_NAME} is online as ${client.user.tag}`);
  try {
    const synced = await client.application.commands.set([searchCommand]);
    console.log(`Synced ${synced.size} slash command(s)`);
  } catch (e) {
    console.log(`Slash sync failed: ${e}`);
  }

  client.user.setActivity(";search | /search", { type: ActivityType.Watching });
});

// Run
if (!TOKEN) {
  console.log("❌ ERROR: TOKEN environment variable is not set!");
} else {
  client.login(TOKEN);
}