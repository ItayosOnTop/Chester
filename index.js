const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const fs = require('fs');
const path = require('path');
const StorageManager = require('./storageManager');
const CommandHandler = require('./commandHandler');

// Default config if none exists
const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({
    server: { host: "localhost", port: 25565, username: "Chester", version: "1.20.1" },
    owner: "ItayosOnTop",
    home: null,
    baseArea: null
  }, null, 2));
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const bot = mineflayer.createBot({
  host: config.server.host,
  port: config.server.port,
  username: config.server.username,
  version: config.server.version,
});

bot.loadPlugin(pathfinder);

let commandHandler;
let storageManager;

bot.once('spawn', () => {
  console.log(`[Bot] Spawned as ${bot.username}`);
  bot.chat('Storage bot online! Type !help for commands.');

  const mcData = require('minecraft-data')(bot.version);
  const movements = new Movements(bot, mcData);
  movements.canDig = false;
  bot.pathfinder.setMovements(movements);

  storageManager = new StorageManager(bot);
  commandHandler = new CommandHandler(bot, storageManager, config.owner);

  // If a home is set, go to it on startup
  if (config.home) {
    setTimeout(() => storageManager.goHome(), 2000);
  }
});

bot.on('chat', (username, message) => {
  if (username === bot.username || username !== config.owner) return;
  if (commandHandler) commandHandler.handle(username, message);
});

bot.on('error', (err) => console.error('[Bot] Error:', err.message));
bot.on('kicked', (reason) => console.log('[Bot] Kicked:', reason));