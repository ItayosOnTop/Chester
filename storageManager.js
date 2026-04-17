const fs = require('fs');
const path = require('path');
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');

const DATA_FILE = path.join(__dirname, 'database.json');

class StorageManager {
  constructor(bot, serverKey, mcData) {
    this.bot = bot;
    this.serverKey = serverKey;
    this.mcData = mcData;
    this.db = {}; 
    this.lastActiveArea = null;
    this.loadData();
  }

  // ─── Database Management ──────────────────────────────────────────────────

  loadData() {
    if (fs.existsSync(DATA_FILE)) {
      try { this.db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { this.db = {}; }
    }
    if (!this.db[this.serverKey]) this.db[this.serverKey] = {};
  }

  saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(this.db, null, 2)); }

  initArea(areaName) {
    if (!this.db[this.serverKey][areaName]) {
      this.db[this.serverKey][areaName] = { bounds: null, home: null, sortChest: null, dropChest: null, chests: {} };
    }
  }

  posKey(pos) { return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`; }

  setAreaBounds(areaName, min, max) {
    this.initArea(areaName);
    this.db[this.serverKey][areaName].bounds = {
      min: { x: Math.min(min.x, max.x), y: Math.min(min.y, max.y), z: Math.min(min.z, max.z) },
      max: { x: Math.max(min.x, max.x), y: Math.max(min.y, max.y), z: Math.max(min.z, max.z) }
    };
    this.saveData();
  }

  setHome(areaName, pos) { this.initArea(areaName); this.db[this.serverKey][areaName].home = { x: pos.x, y: pos.y, z: pos.z }; this.saveData(); }
  setDefaultSortChest(areaName, pos) { this.initArea(areaName); this.db[this.serverKey][areaName].sortChest = { x: pos.x, y: pos.y, z: pos.z }; this.saveData(); }
  getDefaultSortChest(areaName) { return this.db[this.serverKey]?.[areaName]?.sortChest; }
  setDefaultDropChest(areaName, pos) { this.initArea(areaName); this.db[this.serverKey][areaName].dropChest = { x: pos.x, y: pos.y, z: pos.z }; this.saveData(); }
  getDefaultDropChest(areaName) { return this.db[this.serverKey]?.[areaName]?.dropChest; }

  // ─── Hybrid Precision Movement (No More Circles) ────────────────────────

  async goTo(pos, distance = 2.5) {
    const targetCenter = new Vec3(pos.x + 0.5, pos.y, pos.z + 0.5);

    return new Promise(async (resolve) => {
      let dist = this.bot.entity.position.distanceTo(targetCenter);
      const targetBlock = this.bot.blockAt(pos);
      const hasSight = targetBlock ? this.bot.canSeeBlock(targetBlock) : false;

      // 1. If we are already close enough, don't move
      if (dist <= distance && hasSight) {
        this.bot.pathfinder.setGoal(null);
        this.bot.clearControlStates();
        return resolve();
      }

      console.log(`[Movement] Going to ${pos.x}, ${pos.y}, ${pos.z}... (Dist: ${dist.toFixed(1)})`);

      // 2. SHORT DISTANCE: "Direct Walk" (Ignores Pathfinder to prevent circles)
      if (dist < 7 && hasSight) {
        let stuckTimer = 0;
        let lastDist = dist;

        const walkTick = () => {
          dist = this.bot.entity.position.distanceTo(targetCenter);
          
          if (dist <= distance) {
            this.bot.removeListener('physicsTick', walkTick);
            this.bot.clearControlStates();
            return resolve();
          }

          stuckTimer++;
          if (stuckTimer % 20 === 0) { // Check if stuck every 1 second
            if (Math.abs(lastDist - dist) < 0.2) {
              // Bot bumped into something. Abort direct walk and fallback to pathfinder.
              this.bot.removeListener('physicsTick', walkTick);
              this.bot.clearControlStates();
              this.usePathfinder(pos, distance, targetCenter).then(resolve);
              return;
            }
            lastDist = dist;
          }

          this.bot.lookAt(targetCenter.offset(0, 0.5, 0));
          this.bot.setControlState('forward', true);
          this.bot.setControlState('jump', this.bot.entity.isCollidedHorizontally);
        };

        this.bot.on('physicsTick', walkTick);

        // Failsafe timeout
        setTimeout(() => {
          this.bot.removeListener('physicsTick', walkTick);
          this.bot.clearControlStates();
          resolve();
        }, 8000);
        return;
      }

      // 3. LONG DISTANCE: Pathfinder
      await this.usePathfinder(pos, distance, targetCenter);
      resolve();
    });
  }

  // Helper method for the Pathfinder fallback
  async usePathfinder(pos, distance, targetCenter) {
    return new Promise((resolve) => {
      // Look at the target before starting to prevent the initial backtrack loop!
      this.bot.lookAt(targetCenter).then(() => {
        this.bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 1));
      });

      let isFinished = false;

      const checkPosition = () => {
        if (isFinished) return;
        const currentDist = this.bot.entity.position.distanceTo(targetCenter);
        const block = this.bot.blockAt(pos);
        const hasSight = block ? this.bot.canSeeBlock(block) : false;

        if (currentDist <= distance && hasSight) {
          isFinished = true;
          this.bot.removeListener('physicsTick', checkPosition);
          this.bot.pathfinder.setGoal(null);
          this.bot.clearControlStates();['forward', 'back', 'left', 'right', 'jump', 'sprint'].forEach(k => this.bot.setControlState(k, false));
          setTimeout(resolve, 200); 
        }
      };

      this.bot.on('physicsTick', checkPosition);

      const cleanup = () => {
        if (!isFinished) {
          isFinished = true;
          this.bot.removeListener('physicsTick', checkPosition);
          this.bot.pathfinder.setGoal(null);
          this.bot.clearControlStates();
          resolve();
        }
      };

      this.bot.once('goal_reached', cleanup);
      setTimeout(cleanup, 12000);
    });
  }

  async goHome(areaName = null) {
    const area = areaName || this.lastActiveArea;
    if (!area || !this.db[this.serverKey][area]?.home) return;
    const h = this.db[this.serverKey][area].home;
    await this.goTo(new Vec3(h.x, h.y, h.z), 1);
  }

  async openChestAt(pos) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    
    await this.goTo(vec, 2.5); 
    
    await this.bot.lookAt(vec.offset(0.5, 0.5, 0.5), true);
    await this.bot.waitForTicks(5);
    
    const block = this.bot.blockAt(vec);
    if (!block) throw new Error('Chest block is not loaded.');

    return await this.bot.openContainer(block);
  }

  async closeChest(chestWindow) {
    if (chestWindow) { chestWindow.close(); await this.bot.waitForTicks(5); }
  }

  // ─── AI Categorization (mc-data) ─────────────────────────────────────────

  getItemCategory(itemName) {
    const item = this.mcData.itemsByName[itemName];
    if (!item) return "Misc";
    if (item.food) return "Food";
    
    const n = itemName.toLowerCase();
    if (n.includes('log') || n.includes('planks') || n.includes('wood') || n.includes('bark')) return "Wood";
    if (n.includes('ore') || n.includes('ingot') || n.includes('raw') || n.includes('diamond') || n.includes('emerald') || n.includes('coal') || n.includes('redstone')) return "Ores & Minerals";
    if (n.includes('sword') || n.includes('pickaxe') || n.includes('axe') || n.includes('shovel') || n.includes('helmet') || n.includes('chestplate') || n.includes('leggings') || n.includes('boots')) return "Gear";
    if (n.includes('stone') || n.includes('dirt') || n.includes('sand') || n.includes('gravel') || n.includes('cobblestone')) return "Blocks & Earth";
    
    return "Misc";
  }

  categorizeChest(items) {
    if (Object.keys(items).length === 0) return "Empty";
    const scores = {};
    for (const[itemName, count] of Object.entries(items)) {
      const cat = this.getItemCategory(itemName);
      scores[cat] = (scores[cat] || 0) + count;
    }
    let best = "Misc", max = 0;
    for (const[cat, score] of Object.entries(scores)) {
      if (score > max) { max = score; best = cat; }
    }
    return best;
  }

  // ─── Area Scanning ────────────────────────────────────────────────────────

  async scanArea(areaName) {
    this.lastActiveArea = areaName;
    const area = this.db[this.serverKey][areaName];
    if (!area || !area.bounds) return this.bot.chat('No bounds set for this area.');

    const containerIds =['chest', 'trapped_chest', 'barrel'].map(n => this.mcData.blocksByName[n]?.id).filter(Boolean);
    const blocks = this.bot.findBlocks({ matching: containerIds, maxDistance: 64, count: 5000 });
    
    const chests = blocks.filter(p => 
      p.x >= area.bounds.min.x && p.x <= area.bounds.max.x &&
      p.y >= area.bounds.min.y && p.y <= area.bounds.max.y &&
      p.z >= area.bounds.min.z && p.z <= area.bounds.max.z
    );

    if (chests.length === 0) return this.bot.chat('No chests found in bounds.');

    chests.sort((a, b) => this.bot.entity.position.distanceTo(a) - this.bot.entity.position.distanceTo(b));
    this.db[this.serverKey][areaName].chests = {};

    for (const pos of chests) {
      let chestWindow;
      try {
        chestWindow = await this.openChestAt(pos);
        const items = {};
        for (const item of chestWindow.containerItems()) {
          items[item.name] = (items[item.name] || 0) + item.count;
        }
        this.db[this.serverKey][areaName].chests[this.posKey(pos)] = { pos, type: this.categorizeChest(items), items };
      } catch (err) {
        console.error(`[Scan Error] Chest at ${pos.x},${pos.y},${pos.z}: ${err.message}`);
      } finally { 
        await this.closeChest(chestWindow); 
      }
    }
    this.saveData();
    this.bot.chat(`Finished scanning ${chests.length} chests!`);
  }

  // ─── Sorting Logic ────────────────────────────────────────────────────────

  findBestStorageChest(areaName, itemName) {
    const chests = this.db[this.serverKey][areaName].chests;
    for (const data of Object.values(chests)) if (data.items[itemName]) return data.pos;
    const itemCat = this.getItemCategory(itemName);
    for (const data of Object.values(chests)) if (data.type === itemCat) return data.pos;
    for (const data of Object.values(chests)) if (data.type === "Empty") return data.pos;
    return Object.values(chests)[0]?.pos || null;
  }

  async sortChest(areaName, sourcePos) {
    this.lastActiveArea = areaName;
    if (!this.db[this.serverKey][areaName]?.chests) return this.bot.chat('Scan the area first.');

    let sourceChest;
    try {
      sourceChest = await this.openChestAt(sourcePos);
      for (const item of sourceChest.containerItems()) {
        try { await sourceChest.withdraw(item.type, item.metadata, item.count); } catch (e) { break; } 
      }
    } catch(e) {
      return this.bot.chat(`Failed to open drop-off chest.`);
    } finally { 
      await this.closeChest(sourceChest); 
    }

    for (const item of this.bot.inventory.items()) {
      const destPos = this.findBestStorageChest(areaName, item.name);
      if (!destPos) continue;

      let destChest;
      try {
        destChest = await this.openChestAt(destPos);
        await destChest.deposit(item.type, item.metadata, item.count);
        
        const key = this.posKey(destPos);
        this.db[this.serverKey][areaName].chests[key].items[item.name] = (this.db[this.serverKey][areaName].chests[key].items[item.name] || 0) + item.count;
        this.db[this.serverKey][areaName].chests[key].type = this.categorizeChest(this.db[this.serverKey][areaName].chests[key].items);
      } catch (e) { } finally { await this.closeChest(destChest); }
    }
    this.saveData();
    this.bot.chat('Sorting complete!');
  }

  // ─── Fetching Logic ───────────────────────────────────────────────────────

  async fetchItemToChest(areaName, itemName, count, destPos) {
    this.lastActiveArea = areaName;
    const area = this.db[this.serverKey][areaName];
    if (!area?.chests) return this.bot.chat('Scan the area first.');

    let needed = count;
    const locations =[];
    
    for (const data of Object.values(area.chests)) {
      if (data.items[itemName]) locations.push({ pos: data.pos, qty: data.items[itemName] });
    }

    if (locations.length === 0) return this.bot.chat(`I don't have any ${itemName} in [${areaName}].`);

    for (const loc of locations) {
      if (needed <= 0) break;
      const itemId = this.mcData.itemsByName[itemName]?.id;
      if (!itemId) continue;

      let sourceChest;
      try {
        sourceChest = await this.openChestAt(loc.pos);
        const toTake = Math.min(needed, loc.qty);
        await sourceChest.withdraw(itemId, null, toTake);
        needed -= toTake;

        const key = this.posKey(loc.pos);
        this.db[this.serverKey][areaName].chests[key].items[itemName] -= toTake;
        if (this.db[this.serverKey][areaName].chests[key].items[itemName] <= 0) {
          delete this.db[this.serverKey][areaName].chests[key].items[itemName];
        }
        this.db[this.serverKey][areaName].chests[key].type = this.categorizeChest(this.db[this.serverKey][areaName].chests[key].items);
      } catch (e) { } finally { await this.closeChest(sourceChest); }
    }
    this.saveData();

    const grabbedAmount = count - needed;
    if (grabbedAmount <= 0) return;

    let destChest;
    try {
      destChest = await this.openChestAt(destPos);
      const botItems = this.bot.inventory.items().filter(i => i.name.includes(itemName));
      for (const item of botItems) {
        await destChest.deposit(item.type, item.metadata, item.count);
      }
    } finally { await this.closeChest(destChest); }

    this.bot.chat(`Fetched ${grabbedAmount} ${itemName}!`);
  }
}

module.exports = StorageManager;