class CommandHandler {
  constructor(bot, storageManager, owner, scanAreas = []) {
    this.bot = bot;
    this.storage = storageManager;
    this.owner = owner;
    this.scanAreas = scanAreas; // loaded from config.json
    this.busy = false;
  }

  async handle(username, message) {
    if (!message.startsWith('!')) return;

    const parts = message.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (this.busy && cmd !== '!status' && cmd !== '!stop') {
      this.bot.chat('I am currently busy with a task. Use !stop to cancel.');
      return;
    }

    try {
      switch (cmd) {
        case '!help':
          this.sendHelp();
          break;

        // !scan            → list available areas from config.json
        // !scan <name|#>   → scan that specific area
        case '!scan':
          await this.withBusy(() => this.cmdScan(args));
          break;

        // !scanall         → scan every area defined in config.json
        case '!scanall':
          await this.withBusy(() => this.cmdScanAll());
          break;

        case '!sort':
          await this.withBusy(() => this.cmdSort(args));
          break;

        case '!fetch':
          await this.withBusy(() => this.cmdFetch(args));
          break;

        case '!listchests':
        case '!list':
          this.storage.listChests();
          break;

        case '!areas':
          this.cmdListAreas();
          break;

        case '!inspect':
          this.cmdInspect(args);
          break;

        case '!find':
          this.cmdFind(args);
          break;

        case '!rescan':
          await this.withBusy(() => this.cmdRescan(args));
          break;

        case '!clear':
          this.storage.clearData();
          break;

        case '!status':
          this.bot.chat(this.busy ? 'I am currently busy with a task.' : 'I am idle and ready.');
          break;

        case '!stop':
          this.bot.pathfinder.setGoal(null);
          this.busy = false;
          this.bot.chat('Stopped current task.');
          break;

        case '!come':
          await this.withBusy(() => this.cmdCome(username));
          break;

        default:
          this.bot.chat(`Unknown command "${cmd}". Type !help for commands.`);
      }
    } catch (err) {
      console.error(`[CommandHandler] Error handling ${cmd}:`, err);
      this.bot.chat(`Error: ${err.message}`);
      this.busy = false;
    }
  }

  async withBusy(fn) {
    this.busy = true;
    try {
      await fn();
    } finally {
      this.busy = false;
    }
  }

  // ─── Resolve a scan area by index (#1, #2...) or partial name ─────────────
  resolveArea(query) {
    if (!query) return null;

    // Numeric index: "1", "2", ...
    const num = parseInt(query);
    if (!isNaN(num)) {
      const idx = num - 1;
      return this.scanAreas[idx] ?? null;
    }

    // Name match (case-insensitive, partial)
    const lower = query.toLowerCase();
    return this.scanAreas.find(a => a.name.toLowerCase().includes(lower)) ?? null;
  }

  // ─── Commands ──────────────────────────────────────────────────────────────

  async cmdScan(args) {
    if (this.scanAreas.length === 0) {
      this.bot.chat('No scan areas defined in config.json. Add some and restart.');
      return;
    }

    if (args.length === 0) {
      // Just list areas
      this.cmdListAreas();
      this.bot.chat('Use !scan <name or #number> to scan an area.');
      return;
    }

    const query = args.join(' ');
    const area = this.resolveArea(query);

    if (!area) {
      this.bot.chat(`No area matching "${query}". Use !areas to list defined areas.`);
      return;
    }

    this.bot.chat(`Starting scan of area: "${area.name}"`);
    await this.storage.scanArea(area.from, area.to);
  }

  async cmdScanAll() {
    if (this.scanAreas.length === 0) {
      this.bot.chat('No scan areas defined in config.json.');
      return;
    }

    this.bot.chat(`Scanning all ${this.scanAreas.length} area(s) from config.json...`);
    for (let i = 0; i < this.scanAreas.length; i++) {
      const area = this.scanAreas[i];
      this.bot.chat(`[${i + 1}/${this.scanAreas.length}] Scanning "${area.name}"...`);
      await this.storage.scanArea(area.from, area.to);
    }
    this.bot.chat('All areas scanned!');
  }

  cmdListAreas() {
    if (this.scanAreas.length === 0) {
      this.bot.chat('No scan areas in config.json.');
      return;
    }
    this.bot.chat(`=== ${this.scanAreas.length} Scan Area(s) in config.json ===`);
    this.scanAreas.forEach((a, i) => {
      const f = a.from, t = a.to;
      this.bot.chat(`  #${i + 1} "${a.name}"  [${f.x},${f.y},${f.z}] → [${t.x},${t.y},${t.z}]`);
    });
  }

  async cmdSort(args) {
    if (args.length === 0) {
      await this.storage.sortInventory();
    } else if (args.length === 3) {
      const [x, y, z] = args.map(Number);
      if ([x, y, z].some(isNaN)) {
        this.bot.chat('Coordinates must be numbers. Usage: !sort x y z');
        return;
      }
      await this.storage.sortChest({ x, y, z });
    } else {
      this.bot.chat('Usage: !sort  OR  !sort x y z');
    }
  }

  async cmdFetch(args) {
    if (args.length < 1) {
      this.bot.chat('Usage: !fetch <item_name> [count]');
      return;
    }
    const itemName = args[0].toLowerCase();
    const count = args[1] ? parseInt(args[1]) : 1;

    if (isNaN(count) || count < 1) {
      this.bot.chat('Count must be a positive number.');
      return;
    }

    await this.storage.fetchItem(itemName, count);
  }

  cmdInspect(args) {
    if (args.length < 3) {
      this.bot.chat('Usage: !inspect x y z');
      return;
    }
    const [x, y, z] = args.map(Number);
    if ([x, y, z].some(isNaN)) {
      this.bot.chat('Coordinates must be numbers.');
      return;
    }
    this.storage.inspectChest({ x, y, z });
  }

  cmdFind(args) {
    if (args.length < 1) {
      this.bot.chat('Usage: !find <item_name>');
      return;
    }
    this.storage.findItem(args[0].toLowerCase());
  }

  async cmdRescan(args) {
    if (args.length < 3) {
      this.bot.chat('Usage: !rescan x y z');
      return;
    }
    const [x, y, z] = args.map(Number);
    if ([x, y, z].some(isNaN)) {
      this.bot.chat('Coordinates must be numbers.');
      return;
    }
    this.bot.chat(`Rescanning chest at ${x},${y},${z}...`);
    await this.storage.scanChest({ x, y, z });
    this.storage.saveData();
    this.bot.chat('Rescan complete.');
  }

  async cmdCome(username) {
    const player = this.bot.players[username];
    if (!player?.entity) {
      this.bot.chat(`I can't see ${username}.`);
      return;
    }
    this.bot.chat('Coming!');
    await this.storage.goTo(player.entity.position);
    this.bot.chat('Here!');
  }

  // ─── Help ──────────────────────────────────────────────────────────────────

  sendHelp() {
    const lines = [
      '=== Storage Bot Commands ===',
      '--- Scanning (areas set in config.json) ---',
      '!areas                    - List scan areas from config.json',
      '!scan                     - List available areas',
      '!scan <name or #number>   - Scan a specific area',
      '!scanall                  - Scan ALL areas in config.json',
      '!rescan x y z             - Re-scan a single chest block',
      '--- Sorting & Fetching ---',
      '!sort                     - Sort bot\'s inventory into chests',
      '!sort x y z               - Pull items from a chest & sort them',
      '!fetch <item> [count]     - Retrieve item(s) from storage',
      '--- Info ---',
      '!find <item>              - Find which chest(s) hold an item',
      '!list                     - List all catalogued chests',
      '!inspect x y z            - Show contents of a specific chest',
      '--- Misc ---',
      '!clear                    - Clear chest database',
      '!come                     - Bot comes to you',
      '!status                   - Check if bot is busy',
      '!stop                     - Cancel current task',
      '!help                     - Show this help',
    ];
    for (const line of lines) {
      this.bot.chat(line);
    }
  }
}

module.exports = CommandHandler;
