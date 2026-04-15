const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const fs = require('fs');
const path = require('path');
const StorageManager = require('./storageManager');
const CommandHandler = require('./commandHandler');

// ── Load config.json ──────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('[Config] config.json not found! Please create it (see README).');
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error('[Config] Failed to parse config.json:', err.message);
    process.exit(1);
  }
}

function validateConfig(cfg) {
  if (!cfg.server?.host)    throw new Error('config.json missing server.host');
  if (!cfg.server?.username) throw new Error('config.json missing server.username');
  if (!cfg.owner)           throw new Error('config.json missing owner');
  if (!Array.isArray(cfg.scanAreas)) throw new Error('config.json missing scanAreas array');

  for (let i = 0; i < cfg.scanAreas.length; i++) {
    const area = cfg.scanAreas[i];
    if (!area.name) throw new Error(`scanAreas[${i}] missing "name"`);
    for (const corner of ['from', 'to']) {
      if (area[corner] == null) throw new Error(`scanAreas[${i}] missing "${corner}"`);
      for (const axis of ['x', 'y', 'z']) {
        if (typeof area[corner][axis] !== 'number')
          throw new Error(`scanAreas[${i}].${corner}.${axis} must be a number`);
      }
    }
  }
}

// ── Bot lifecycle ─────────────────────────────────────────────────────────────
let bot;

function createBot() {
  let cfg;
  try {
    cfg = loadConfig();
    validateConfig(cfg);
  } catch (err) {
    console.error('[Config] Invalid config.json:', err.message);
    process.exit(1);
  }

  const { server, owner, scanAreas } = cfg;

  console.log(`[Config] Loaded. Server: ${server.host}:${server.port ?? 25565}`);
  console.log(`[Config] Owner: ${owner}`);
  console.log(`[Config] Scan areas defined: ${scanAreas.length}`);
  scanAreas.forEach((a, i) =>
    console.log(`  [${i + 1}] "${a.name}"  ${a.from.x},${a.from.y},${a.from.z}  →  ${a.to.x},${a.to.y},${a.to.z}`)
  );

  bot = mineflayer.createBot({
    host: server.host,
    port: server.port ?? 25565,
    username: server.username,
    version: server.version ?? '1.20.1',
  });

  bot.loadPlugin(pathfinder);

  const storageManager = new StorageManager(bot);
  const commandHandler = new CommandHandler(bot, storageManager, owner, scanAreas);

  bot.once('spawn', () => {
    console.log(`[Bot] Spawned as ${bot.username}`);
    bot.chat('Storage bot online! Type !help for commands.');

    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    movements.canDig = false;
    bot.pathfinder.setMovements(movements);
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    if (username !== owner) return;

    console.log(`[Chat] <${username}> ${message}`);
    commandHandler.handle(username, message);
  });

  bot.on('error', (err) => {
    console.error('[Bot] Error:', err.message);
  });

  bot.on('end', (reason) => {
    console.log(`[Bot] Disconnected: ${reason}. Reconnecting in 5s...`);
    setTimeout(createBot, 5000);
  });

  bot.on('kicked', (reason) => {
    console.log('[Bot] Kicked:', reason);
  });
}

createBot();
