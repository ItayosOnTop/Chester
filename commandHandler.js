const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder'); // <--- ADD THIS

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
        await this.storage.goHome();
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
        this.bot.chat('Commands: !sethome <Area> x y z\n!setarea <Area> x1 y1 z1 x2 y2 z2\n!scan <Area>\n!sort <Area>[x y z]\n!fetch <Area> <item> <amt> [x y z]\n!status\n!follow <player>\n!stop');
        break;

      // === NEW SCAN COMMAND ===
      case '!scan':
        if (args.length !== 1) return this.bot.chat('Usage: !scan <AreaName>');
        // The storage manager checks if the area exists and has bounds automatically!
        this.bot.chat(`Scanning area[${args[0]}] for updates...`);
        this.runTask(`Scanning ${args[0]}`, () => this.storage.scanArea(args[0]));
        break;
      // ========================

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
        // Prevents spamming the command and creating multiple background loops
        if (this.currentTask !== 'Idle') {
          return this.bot.chat(`I am busy doing: ${this.currentTask}. Use !stop first.`);
        }
        if (!args[0]) return this.bot.chat('Usage: !follow <playerName>');
        
        const targetPlayer = this.bot.players[args[0]]?.entity;
        if (!targetPlayer) return this.bot.chat(`I cannot see ${args[0]}.`);
        
        this.currentTask = 'Following player';
        this.bot.chat(`Following ${args[0]}!`);
        
        let lastTargetPos = null;

        const followTick = () => {
          // If stopped or doing something else, cleanup and exit loop
          if (this.currentTask !== 'Following player') {
            this.bot.removeListener('physicsTick', followTick);
            this.bot.pathfinder.setGoal(null);
            this.bot.clearControlStates();
            return;
          }

          // Re-fetch entity in case the player respawned or reloaded chunks
          const entity = this.bot.players[args[0]]?.entity;
          if (!entity || !entity.isValid) return;

          const pos = entity.position;
          const dist = this.bot.entity.position.distanceTo(pos);

          if (dist <= 2.5) {
            // Close enough: stop the pathfinder and smoothly look at player
            if (lastTargetPos !== null) {
              this.bot.pathfinder.setGoal(null);
              this.bot.clearControlStates();
              lastTargetPos = null;
            }
            this.bot.lookAt(pos.offset(0, 1.5, 0), true);
          } else {
            // Far away: Only update pathfinder goal if the player moved significantly
            // This completely stops the bot from twitching/recalculating every tick!
            if (!lastTargetPos || lastTargetPos.distanceTo(pos) > 2) {
              lastTargetPos = pos.clone();
              this.bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
            }
          }
        };

        this.bot.on('physicsTick', followTick);
        break;

      case '!sethome':
        if (args.length !== 4) return this.bot.chat('Usage: !sethome <AreaName> x y z');
        const hx = Number(args[1]), hy = Number(args[2]), hz = Number(args[3]);
        this.storage.setHome(args[0], new Vec3(hx, hy, hz));
        this.bot.chat(`Home for area[${args[0]}] set!`);
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
          const[sx, sy, sz] = args.slice(1).map(Number);
          const pos = new Vec3(sx, sy, sz);
          this.storage.setDefaultSortChest(args[0], pos);
          this.bot.chat(`Drop-off chest saved! Sorting...`);
          this.runTask(`Sorting in ${args[0]}`, () => this.storage.sortChest(args[0], pos));
        } else if (args.length === 1) {
          const posData = this.storage.getDefaultSortChest(args[0]);
          if (!posData) return this.bot.chat(`No drop-off chest saved! Use !sort ${args[0]} x y z first.`);
          this.runTask(`Sorting in ${args[0]}`, () => this.storage.sortChest(args[0], new Vec3(posData.x, posData.y, posData.z)));
        } else {
          this.bot.chat('Usage: !sort <AreaName> [x y z]');
        }
        break;

      case '!fetch':
        if (args.length === 6) {
          const area = args[0], item = args[1].toLowerCase(), amt = parseInt(args[2]);
          const[dx, dy, dz] = args.slice(3).map(Number);
          const pos = new Vec3(dx, dy, dz);
          this.storage.setDefaultDropChest(area, pos);
          this.bot.chat(`Pick-up chest saved! Fetching...`);
          this.runTask(`Fetching ${amt} ${item}`, () => this.storage.fetchItemToChest(area, item, amt, pos));
        } else if (args.length === 3) {
          const area = args[0], item = args[1].toLowerCase(), amt = parseInt(args[2]);
          const posData = this.storage.getDefaultDropChest(area);
          if (!posData) return this.bot.chat(`No pick-up chest saved! Use !fetch ${area} ${item} ${amt} x y z first.`);
          this.runTask(`Fetching ${amt} ${item}`, () => this.storage.fetchItemToChest(area, item, amt, new Vec3(posData.x, posData.y, posData.z)));
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