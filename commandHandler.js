const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');

class CommandHandler {
  constructor(bot, storageManager, owner) {
    this.bot = bot;
    this.storage = storageManager;
    this.owner = owner;
    this.currentTask = 'Idle';
  }

  async runTask(taskName, sender, taskFunc) {
    if (this.currentTask !== 'Idle' && this.currentTask !== 'Following player') {
      this.bot.reply(sender, `❌ I am currently busy: ${this.currentTask}. Use !stop first.`);
      return;
    }
    
    this.currentTask = taskName;
    this.storage.forceStop = false; 
    
    try {
      await taskFunc();
    } catch (err) {
      console.error(`[Task Error]`, err);
      this.bot.reply(sender, `❌ Error: ${err.message}`);
    } finally {
      if (this.currentTask === taskName) {
        this.currentTask = 'Idle';
        this.bot.reply(sender, `✅ Task complete! Returning home.`);
        await this.storage.goHome();
      }
    }
  }

  async handle(sender, message) {
    if (!message.startsWith('!')) return;

    const parts = message.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case '!help':
        const helpMsg = 
          `🛠️ Bot Commands 🛠️\n` +
          `🔹 !sethome <Area> x y z\n` +
          `🔹 !setarea <Area> x1 y1 z1 x2 y2 z2\n` +
          `🔹 !scan <Area>\n` +
          `🔹 !sort <Area> [x y z]\n` +
          `🔹 !fetch <Area> <item> <amount>[x y z]\n` +
          `🔹 !follow <player>\n` +
          `🔹 !stop\n` +
          `🔹 !status`;
        this.bot.reply(sender, helpMsg);
        break;

      case '!scan':
        if (args.length !== 1) return this.bot.reply(sender, '⚠️ Usage: !scan <AreaName>');
        this.bot.reply(sender, `🔎 Scanning area [${args[0]}] for updates...`);
        this.runTask(`Scanning ${args[0]}`, sender, () => this.storage.scanArea(args[0], sender));
        break;

      case '!status':
        const statusMsg = 
          `📊 Bot Status:\n` +
          `❤️ Health: ${Math.round(this.bot.health)}/20\n` +
          `🍗 Food: ${Math.round(this.bot.food)}/20\n` +
          `📋 Task: ${this.currentTask}`;
        this.bot.reply(sender, statusMsg);
        break;

      case '!stop':
        if (this.currentTask === 'Following player') {
          this.bot.reply(sender, `🛑 Stopped following. Staying exactly where I am.`);
          this.currentTask = 'Idle';
          this.bot.pathfinder.setGoal(null);
          this.bot.clearControlStates();
        } else {
          this.bot.reply(sender, `🛑 Stopping everything and going home...`);
          this.currentTask = 'Idle';
          this.storage.forceStop = true; 
          this.bot.pathfinder.setGoal(null);
          this.bot.clearControlStates();
          if (this.bot.currentWindow) this.bot.currentWindow.close();
          
          setTimeout(() => {
            this.storage.forceStop = false;
            this.storage.goHome();
          }, 1500);
        }
        break;

      case '!follow':
        if (this.currentTask !== 'Idle') {
          return this.bot.reply(sender, `❌ I am busy doing: ${this.currentTask}. Use !stop first.`);
        }
        if (!args[0]) return this.bot.reply(sender, '⚠️ Usage: !follow <playerName>');
        
        const targetPlayer = this.bot.players[args[0]]?.entity;
        if (!targetPlayer) return this.bot.reply(sender, `❌ I cannot see ${args[0]}.`);
        
        this.currentTask = 'Following player';
        this.bot.reply(sender, `🚶 Following ${args[0]}!`);
        
        let lastTargetPos = null;

        const followTick = () => {
          if (this.currentTask !== 'Following player') {
            this.bot.removeListener('physicsTick', followTick);
            this.bot.pathfinder.setGoal(null);
            this.bot.clearControlStates();
            return;
          }

          const entity = this.bot.players[args[0]]?.entity;
          if (!entity || !entity.isValid) return;

          const pos = entity.position;
          const dist = this.bot.entity.position.distanceTo(pos);

          if (dist <= 2.5) {
            if (lastTargetPos !== null) {
              this.bot.pathfinder.setGoal(null);
              this.bot.clearControlStates();
              lastTargetPos = null;
            }
            this.bot.lookAt(pos.offset(0, 1.5, 0), true);
          } else {
            if (!lastTargetPos || lastTargetPos.distanceTo(pos) > 2) {
              lastTargetPos = pos.clone();
              this.bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
            }
          }
        };

        this.bot.on('physicsTick', followTick);
        break;

      case '!sethome':
        if (args.length !== 4) return this.bot.reply(sender, '⚠️ Usage: !sethome <AreaName> x y z');
        const hx = Number(args[1]), hy = Number(args[2]), hz = Number(args[3]);
        this.storage.setHome(args[0], new Vec3(hx, hy, hz));
        this.bot.reply(sender, `🏠 Home for area [${args[0]}] set!`);
        this.storage.goHome(args[0]);
        break;

      case '!setarea':
        if (args.length !== 7) return this.bot.reply(sender, '⚠️ Usage: !setarea <AreaName> x1 y1 z1 x2 y2 z2');
        const[x1, y1, z1, x2, y2, z2] = args.slice(1).map(Number);
        this.storage.setAreaBounds(args[0], new Vec3(x1, y1, z1), new Vec3(x2, y2, z2));
        this.bot.reply(sender, `📦 Bounds for [${args[0]}] set! Scanning chests now...`);
        this.runTask(`Scanning ${args[0]}`, sender, () => this.storage.scanArea(args[0], sender));
        break;

      case '!sort':
        if (args.length === 4) {
          const[sx, sy, sz] = args.slice(1).map(Number);
          const pos = new Vec3(sx, sy, sz);
          this.storage.setDefaultSortChest(args[0], pos);
          this.bot.reply(sender, `💾 Drop-off chest saved! Sorting...`);
          this.runTask(`Sorting in ${args[0]}`, sender, () => this.storage.sortChest(args[0], pos, sender));
        } else if (args.length === 1) {
          const posData = this.storage.getDefaultSortChest(args[0]);
          if (!posData) return this.bot.reply(sender, `❌ No drop-off chest saved! Use !sort ${args[0]} x y z first.`);
          this.bot.reply(sender, `🧹 Sorting items...`);
          this.runTask(`Sorting in ${args[0]}`, sender, () => this.storage.sortChest(args[0], new Vec3(posData.x, posData.y, posData.z), sender));
        } else {
          this.bot.reply(sender, '⚠️ Usage: !sort <AreaName> [x y z]');
        }
        break;

      case '!fetch':
        if (args.length === 6) {
          const area = args[0], item = args[1].toLowerCase(), amt = parseInt(args[2]);
          const[dx, dy, dz] = args.slice(3).map(Number);
          const pos = new Vec3(dx, dy, dz);
          this.storage.setDefaultDropChest(area, pos);
          this.bot.reply(sender, `💾 Pick-up chest saved! Fetching...`);
          this.runTask(`Fetching ${amt} ${item}`, sender, () => this.storage.fetchItemToChest(area, item, amt, pos, sender));
        } else if (args.length === 3) {
          const area = args[0], item = args[1].toLowerCase(), amt = parseInt(args[2]);
          const posData = this.storage.getDefaultDropChest(area);
          if (!posData) return this.bot.reply(sender, `❌ No pick-up chest saved! Use !fetch ${area} ${item} ${amt} x y z first.`);
          this.bot.reply(sender, `🚚 Fetching ${amt} ${item}...`);
          this.runTask(`Fetching ${amt} ${item}`, sender, () => this.storage.fetchItemToChest(area, item, amt, new Vec3(posData.x, posData.y, posData.z), sender));
        } else {
          this.bot.reply(sender, '⚠️ Usage: !fetch <AreaName> <item> <amount> [x y z]');
        }
        break;

      default:
        this.bot.reply(sender, '❌ Unknown command. Type !help.');
    }
  }
}

module.exports = CommandHandler;