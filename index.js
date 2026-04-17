const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const fs = require('fs');
const path = require('path');
const StorageManager = require('./storageManager');
const CommandHandler = require('./commandHandler');

const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({
    server: { host: "localhost", port: 25565, username: "Chester", version: "1.20.6" },
    owner: "ItayosOnTop",
    scanAreas:[
      {
        "name": "Main Storage",
        "from": { "x": 7, "y": -60, "z": 15 },
        "to":   { "x": 12,  "y": -59, "z": 10  }
      }
    ]
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
  bot.chat('Storage bot online! Type !help for commands.');

  const mcData = require('minecraft-data')(bot.version);
  const movements = new Movements(bot, mcData);
  
  // Disable actions that cause the bot to spin or get stuck
  movements.canDig = false;
  movements.canPlace = false;
  movements.allowSprinting = false; 
  movements.allow1by1towers = false;
  movements.scafoldingBlocks = [] 
  movements.allow1by1towers = false
  
  bot.pathfinder.setMovements(movements);

  // === GEN'S FIX: INSTANT TURNING ===
  // This completely stops the sweeping curves and forces straight lines
  bot.physics.yawSpeed = 6000;
  bot.physics.pitchSpeed = 6000;
  // ===================================

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