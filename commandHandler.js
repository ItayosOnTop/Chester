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
        this.bot.chat('Commands: !sethome <Area> x y z, !setarea <Area> x1 y1 z1 x2 y2 z2, !sort <Area> x y z, !fetch <Area> <item> <amt> <x y z>, !status, !follow <player>, !stop');
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
        if (!args[0]) return this.bot.chat('Usage: !follow <playerName>');
        const targetPlayer = this.bot.players[args[0]]?.entity;
        if (!targetPlayer) return this.bot.chat(`I cannot see ${args[0]}.`);
        this.currentTask = 'Following player';
        this.bot.pathfinder.setGoal(new goals.GoalFollow(targetPlayer, 2), true);
        this.bot.chat(`Following ${args[0]}...`);
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
        if (args.length !== 4) return this.bot.chat('Usage: !sort <AreaName> x y z');
        const [sx, sy, sz] = args.slice(1).map(Number);
        this.runTask(`Sorting in ${args[0]}`, () => this.storage.sortChest(args[0], new Vec3(sx, sy, sz)));
        break;

      case '!fetch':
        if (args.length !== 6) return this.bot.chat('Usage: !fetch <AreaName> <item> <amount> <destX> <destY> <destZ>');
        const area = args[0], item = args[1].toLowerCase(), amt = parseInt(args[2]);
        const dx = Number(args[3]), dy = Number(args[4]), dz = Number(args[5]);
        this.runTask(`Fetching ${amt} ${item}`, () => this.storage.fetchItemToChest(area, item, amt, new Vec3(dx, dy, dz)));
        break;

      default:
        this.bot.chat('Unknown command. Type !help.');
    }
  }
}

module.exports = CommandHandler;