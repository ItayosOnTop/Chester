const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');

class CommandHandler {
  constructor(bot, storageManager, owner) {
    this.bot = bot;
    this.storage = storageManager;
    this.owner = owner;
    this.currentTask = 'Idle';
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
      this.bot.chat(`Error: ${err.message}`);
    } finally {
      if (this.currentTask === taskName) {
        this.currentTask = 'Idle';
        await this.storage.goHome(); // Always attempt to return home
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
        this.bot.chat('Commands: !sethome <Area> x y z, !setarea <Area> x1 y1 z1 x2 y2 z2, !sort <Area> [x y z], !fetch <Area> <item> <amt>[x y z], !status, !follow <player>, !stop');
        break;

      case '!status':
        this.bot.chat(`❤️ ${Math.round(this.bot.health)} | 🍗 ${Math.round(this.bot.food)} | 📋 Task: ${this.currentTask}`);
        break;

      case '!stop':
        this.bot.pathfinder.setGoal(null);
        this.bot.clearControlStates();
        this.currentTask = 'Idle';
        this.bot.chat('Stopped. Going home.');
        this.storage.goHome();
        break;

      case '!follow':
        if (this.currentTask !== 'Idle' && this.currentTask !== 'Following player') {
          return this.bot.chat(`I am busy doing: ${this.currentTask}. Use !stop first.`);
        }
        if (!args[0]) return this.bot.chat('Usage: !follow <playerName>');
        const targetPlayer = this.bot.players[args[0]]?.entity;
        if (!targetPlayer) return this.bot.chat(`I cannot see ${args[0]}.`);
        
        this.currentTask = 'Following player';
        this.bot.pathfinder.setGoal(null);
        this.bot.clearControlStates();
        this.bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer, 3), true);
        this.bot.chat(`Following ${args[0]} straight away!`);
        break;

      case '!sethome':
        if (args.length !== 4) return this.bot.chat('Usage: !sethome <AreaName> x y z');
        const hx = Number(args[1]), hy = Number(args[2]), hz = Number(args[3]);
        this.storage.setHome(args[0], new Vec3(hx, hy, hz));
        this.bot.chat(`Home for area [${args[0]}] set!`);
        this.storage.goHome(args[0]);
        break;

      case '!setarea':
        if (args.length !== 7) return this.bot.chat('Usage: !setarea <AreaName> x1 y1 z1 x2 y2 z2');
        const[x1, y1, z1, x2, y2, z2] = args.slice(1).map(Number);
        this.storage.setAreaBounds(args[0], new Vec3(x1, y1, z1), new Vec3(x2, y2, z2));
        this.bot.chat(`Bounds for [${args[0]}] set! Scanning chests now...`);
        this.runTask(`Scanning ${args[0]}`, () => this.storage.scanArea(args[0]));
        break;

      case '!sort':
        if (args.length === 4) {
          // User provided coords (One-time setup)
          const [sx, sy, sz] = args.slice(1).map(Number);
          const pos = new Vec3(sx, sy, sz);
          this.storage.setDefaultSortChest(args[0], pos);
          this.bot.chat(`Drop-off chest for [${args[0]}] saved to memory! Sorting...`);
          this.runTask(`Sorting in ${args[0]}`, () => this.storage.sortChest(args[0], pos));
        } else if (args.length === 1) {
          // User didn't provide coords, use memory
          const posData = this.storage.getDefaultSortChest(args[0]);
          if (!posData) return this.bot.chat(`No drop-off chest saved! Use !sort ${args[0]} x y z first.`);
          const pos = new Vec3(posData.x, posData.y, posData.z);
          this.runTask(`Sorting in ${args[0]}`, () => this.storage.sortChest(args[0], pos));
        } else {
          this.bot.chat('Usage: !sort <AreaName> [x y z]');
        }
        break;

      case '!fetch':
        if (args.length === 6) {
          // User provided coords (One-time setup)
          const area = args[0], item = args[1].toLowerCase(), amt = parseInt(args[2]);
          const [dx, dy, dz] = args.slice(3).map(Number);
          const pos = new Vec3(dx, dy, dz);
          this.storage.setDefaultDropChest(area, pos);
          this.bot.chat(`Pick-up chest for [${area}] saved to memory! Fetching...`);
          this.runTask(`Fetching ${amt} ${item}`, () => this.storage.fetchItemToChest(area, item, amt, pos));
        } else if (args.length === 3) {
          // User didn't provide coords, use memory
          const area = args[0], item = args[1].toLowerCase(), amt = parseInt(args[2]);
          const posData = this.storage.getDefaultDropChest(area);
          if (!posData) return this.bot.chat(`No pick-up chest saved! Use !fetch ${area} ${item} ${amt} x y z first.`);
          const pos = new Vec3(posData.x, posData.y, posData.z);
          this.runTask(`Fetching ${amt} ${item}`, () => this.storage.fetchItemToChest(area, item, amt, pos));
        } else {
          this.bot.chat('Usage: !fetch <AreaName> <item> <amount> [x y z]');
        }
        break;

      default:
        this.bot.chat('Unknown command. Type !help.');
    }
  }
}

module.exports = CommandHandler;