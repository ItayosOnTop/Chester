const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
// Removed the .plugin from the end of these requires to prevent the crash!
const autoeat = require('mineflayer-auto-eat'); 
const armorManager = require('mineflayer-armor-manager');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
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

// Load all plugins robustly (Automatically handles any version format!)
bot.loadPlugin(pathfinder);
bot.loadPlugin(autoeat.loader);
bot.loadPlugin(armorManager);

let commandHandler;
let storageManager;

// The universal reply function (handles both Console and in-game Whispers)
bot.reply = (username, msg) => {
  if (username === 'Console') {
    console.log(`\x1b[36m[Bot Reply]\x1b[0m\n${msg}`);
    return;
  }
  const lines = msg.split('\n');
  lines.forEach((line, i) => {
    if (line.trim()) {
      // Small timeout to prevent anti-spam kicks for multiline messages
      setTimeout(() => bot.chat(`/msg ${username} ${line.trim()}`), i * 150);
    }
  });
};

bot.once('spawn', () => {
  console.log(`[Bot] Spawned on ${config.server.host}:${config.server.port}`);
  
  // Safely Configure & Enable Auto-Eat (Depends on version installed)
  if (bot.autoEat) {
    if (bot.autoEat.options) bot.autoEat.options = { priority: 'foodPoints', startAt: 14, bannedFood:[] };
    if (bot.autoEat.enableAuto) bot.autoEat.enableAuto();
  }
  
  const mcData = require('minecraft-data')(bot.version);
  const movements = new Movements(bot, mcData);
  
  movements.canDig = false;
  movements.canPlace = false;
  movements.allowSprinting = false; 
  movements.allow1by1towers = false;
  bot.pathfinder.setMovements(movements);

  // Gen's Physics Fix for straight-line walking
  bot.physics.yawSpeed = 6000;
  bot.physics.pitchSpeed = 6000;

  const serverKey = `${config.server.host}:${config.server.port}`;
  storageManager = new StorageManager(bot, serverKey, mcData);
  commandHandler = new CommandHandler(bot, storageManager, config.owner);

  // Auto-Equip best armor and totems periodically
  setInterval(() => { 
    if (bot.armorManager) bot.armorManager.equipAll(); 
  }, 5000);
});

// Handle regular chat
bot.on('chat', (username, message) => {
  if (username === bot.username || username !== config.owner) return;
  if (commandHandler) commandHandler.handle(username, message);
});

// Handle whispers
bot.on('whisper', (username, message) => {
  if (username === bot.username || username !== config.owner) return;
  if (commandHandler) commandHandler.handle(username, message);
});

// Terminal Control System
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (line) => {
  if (line.trim() && commandHandler) commandHandler.handle('Console', line.trim());
});

bot.on('error', (err) => console.error('[Bot] Error:', err.message));
bot.on('kicked', (reason) => console.log('[Bot] Kicked:', reason));