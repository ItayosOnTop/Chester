const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const fs = require('fs');
const path = require('path');
const StorageManager = require('./storageManager');
const CommandHandler = require('./commandHandler');

// config.json is ONLY for login details now.
const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({
    server: { host: "localhost", port: 25565, username: "Chester", version: "1.20.1" },
    owner: "ItayosOnTop"
  }, null, 2));
  console.log('Created config.json. Please set your IP and restart.');
  process.exit(1);
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
  console.log(`[Bot] Spawned on ${config.server.host}:${config.server.port}`);
  bot.chat('Hierarchical Storage bot online! Type !help for commands.');

const mcData = require('minecraft-data')(bot.version);
  const movements = new Movements(bot, mcData);
  movements.canDig = false;
  movements.canPlace = false; // <--- ADD THIS to stop it from trying to build!
  bot.pathfinder.setMovements(movements);
  
  // Pass the server IP so the DB knows where we are
  const serverKey = `${config.server.host}:${config.server.port}`;
  storageManager = new StorageManager(bot, serverKey, mcData);
  commandHandler = new CommandHandler(bot, storageManager, config.owner);
});

bot.on('chat', (username, message) => {
  if (username === bot.username || username !== config.owner) return;
  if (commandHandler) commandHandler.handle(username, message);
});

bot.on('error', (err) => console.error('[Bot] Error:', err.message));
bot.on('kicked', (reason) => console.log('[Bot] Kicked:', reason));