const fs = require('fs');
const path = require('path');
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');

class CommandHandler {
  constructor(bot, storageManager, owner) {
    this.bot = bot;
    this.storage = storageManager;
    this.owner = owner;
    this.currentTask = 'Idle';
    this.configPath = path.join(__dirname, 'config.json');
  }

  updateConfig(key, value) {
    const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    config[key] = value;
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  async runTask(taskName, taskFunc) {
    if (this.currentTask !== 'Idle' && this.currentTask !== 'Following player') {
      this.bot.chat(`I am currently busy: ${this.currentTask}. Use !stop first.`);
      return;
    }
    this.currentTask = taskName;
    try {
      await taskFunc();
    } catch (err) {
      console.error(`[Task Error]`, err);
      this.bot.chat(`Error during ${taskName}: ${err.message}`);
    } finally {
      if (this.currentTask === taskName) {
        this.currentTask = 'Idle';
        await this.storage.goHome(); // Always return to home after a task
      }
    }
  }

  async handle(username, message) {
    if (!message.startsWith('!')) return;

    const parts = message.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '!help':
        this.bot.chat('Commands: !help, !sethome <x y z>, !setarea <x1 y1 z1 x2 y2 z2>, !sort <x y z>, !fetch <item> <amount> <x y z>, !status, !follow <player>, !stop');
        break;

      case '!status':
        this.bot.chat(`❤️ ${Math.round(this.bot.health)}/20 | 🍗 ${Math.round(this.bot.food)}/20 | 📋 Task: ${this.currentTask}`);
        break;

      case '!stop':
        this.bot.pathfinder.setGoal(null);
        this.bot.clearControlStates();
        this.currentTask = 'Idle';
        this.bot.chat('All tasks stopped. Returning home.');
        this.storage.goHome();
        break;

      case '!follow':
        if (!args[0]) {
          this.bot.chat('Usage: !follow <playerName>');
          return;
        }
        const targetPlayer = this.bot.players[args[0]]?.entity;
        if (!targetPlayer) {
          this.bot.chat(`I cannot see ${args[0]}.`);
          return;
        }
        this.currentTask = 'Following player';
        this.bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer, 2), true);
        this.bot.chat(`Following ${args[0]}...`);
        break;

      case '!sethome':
        if (args.length !== 3) {
          this.bot.chat('Usage: !sethome x y z');
          return;
        }
        const [hx, hy, hz] = args.map(Number);
        this.updateConfig('home', { x: hx, y: hy, z: hz });
        this.bot.chat(`Home set to ${hx}, ${hy}, ${hz}. I will stand here when idle.`);
        this.storage.goHome();
        break;

      case '!setarea':
        if (args.length !== 6) {
          this.bot.chat('Usage: !setarea x1 y1 z1 x2 y2 z2');
          return;
        }
        const[x1, y1, z1, x2, y2, z2] = args.map(Number);
        const area = { from: { x: x1, y: y1, z: z1 }, to: { x: x2, y: y2, z: z2 } };
        this.updateConfig('baseArea', area);
        this.bot.chat(`Base area set! Scanning chests in the new area automatically...`);
        this.runTask('Scanning Base Area', () => this.storage.scanArea(area.from, area.to));
        break;

      case '!sort':
        if (args.length !== 3) {
          this.bot.chat('Usage: !sort x y z (Coordinates of the chest you want me to empty and sort)');
          return;
        }
        const [sx, sy, sz] = args.map(Number);
        this.runTask('Sorting Chest', () => this.storage.sortChest(new Vec3(sx, sy, sz)));
        break;

      case '!fetch':
        if (args.length < 5) {
          this.bot.chat('Usage: !fetch <item_name> <amount> <destX> <destY> <destZ>');
          return;
        }
        const item = args[0].toLowerCase();
        const amount = parseInt(args[1]);
        const dx = Number(args[2]);
        const dy = Number(args[3]);
        const dz = Number(args[4]);
        
        if (isNaN(amount) || isNaN(dx) || isNaN(dy) || isNaN(dz)) {
          this.bot.chat('Invalid numbers provided.');
          return;
        }
        this.runTask(`Fetching ${amount} ${item}`, () => this.storage.fetchItemToChest(item, amount, new Vec3(dx, dy, dz)));
        break;

      default:
        this.bot.chat('Unknown command. Type !help.');
    }
  }
}

module.exports = CommandHandler;