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
    this.db = {}; // Format: { "IP:Port": { "AreaName": { bounds, home, chests } } }
    this.lastActiveArea = null;
    this.loadData();
  }

  // ─── Database Management ──────────────────────────────────────────────────

  loadData() {
    if (fs.existsSync(DATA_FILE)) {
      try { this.db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } 
      catch { this.db = {}; }
    }
    if (!this.db[this.serverKey]) this.db[this.serverKey] = {};
  }

  saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.db, null, 2));
  }

  initArea(areaName) {
    if (!this.db[this.serverKey][areaName]) {
      this.db[this.serverKey][areaName] = { bounds: null, home: null, chests: {} };
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

  setHome(areaName, pos) {
    this.initArea(areaName);
    this.db[this.serverKey][areaName].home = { x: pos.x, y: pos.y, z: pos.z };
    this.saveData();
  }

  // ─── Movement & Chest Interactions ────────────────────────────────────────

  async goTo(pos, distance = 3) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)).offset(0.5, 0.5, 0.5);
    if (this.bot.entity.position.distanceTo(vec) <= distance + 0.5) {
      this.bot.pathfinder.setGoal(null);
      this.bot.clearControlStates();
      return; 
    }
    try {
      await this.bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, distance));
    } catch (err) { } 
    finally {
      this.bot.pathfinder.setGoal(null);
      this.bot.clearControlStates();
      await this.bot.waitForTicks(5);
    }
  }

  async goHome(areaName = null) {
    const area = areaName || this.lastActiveArea;
    if (!area || !this.db[this.serverKey][area]?.home) return;
    const h = this.db[this.serverKey][area].home;
    await this.goTo(new Vec3(h.x, h.y, h.z), 1);
  }

  async openChestAt(pos) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    await this.goTo(vec);
    await this.bot.lookAt(vec.offset(0.5, 0.5, 0.5), true);
    await this.bot.waitForTicks(5);
    const block = this.bot.blockAt(vec);
    if (!block) throw new Error('Block not loaded');
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
    if (n.includes('ore') || n.includes('ingot') || n.includes('raw') || n.includes('diamond') || n.includes('emerald') || n.includes('coal') || n.includes('redstone') || n.includes('lapis')) return "Ores & Minerals";
    if (n.includes('sword') || n.includes('pickaxe') || n.includes('axe') || n.includes('shovel') || n.includes('hoe') || n.includes('helmet') || n.includes('chestplate') || n.includes('leggings') || n.includes('boots')) return "Gear";
    if (n.includes('stone') || n.includes('dirt') || n.includes('sand') || n.includes('gravel') || n.includes('andesite') || n.includes('diorite') || n.includes('granite') || n.includes('deepslate') || n.includes('tuff') || n.includes('cobblestone')) return "Blocks & Earth";
    
    if (this.mcData.blocksByName[itemName]) return "Building Blocks"; // If it's a placeable block
    return "Misc";
  }

  categorizeChest(items) {
    if (Object.keys(items).length === 0) return "Empty";
    const scores = {};
    for (const [itemName, count] of Object.entries(items)) {
      const cat = this.getItemCategory(itemName);
      scores[cat] = (scores[cat] || 0) + count;
    }
    let best = "Misc", max = 0;
    for (const [cat, score] of Object.entries(scores)) {
      if (score > max) { max = score; best = cat; }
    }
    return best;
  }

  // ─── Area Scanning ────────────────────────────────────────────────────────

  async scanArea(areaName) {
    this.lastActiveArea = areaName;
    const area = this.db[this.serverKey][areaName];
    if (!area || !area.bounds) return this.bot.chat('No bounds set for this area.');

    const containerIds = ['chest', 'trapped_chest', 'barrel'].map(n => this.mcData.blocksByName[n]?.id).filter(Boolean);
    const blocks = this.bot.findBlocks({ matching: containerIds, maxDistance: 64, count: 5000 });
    
    const chests = blocks.filter(p => 
      p.x >= area.bounds.min.x && p.x <= area.bounds.max.x &&
      p.y >= area.bounds.min.y && p.y <= area.bounds.max.y &&
      p.z >= area.bounds.min.z && p.z <= area.bounds.max.z
    );

    if (chests.length === 0) return this.bot.chat('No chests found in bounds.');

    // Reset chest memory for this area
    this.db[this.serverKey][areaName].chests = {};

    for (const pos of chests) {
      let chestWindow;
      try {
        chestWindow = await this.openChestAt(pos);
        const items = {};
        for (const item of chestWindow.containerItems()) {
          items[item.name] = (items[item.name] || 0) + item.count;
        }
        this.db[this.serverKey][areaName].chests[this.posKey(pos)] = { 
          pos, type: this.categorizeChest(items), items 
        };
      } catch (err) { } 
      finally { await this.closeChest(chestWindow); }
    }
    this.saveData();
    this.bot.chat(`Finished scanning ${chests.length} chests in [${areaName}]!`);
  }

  // ─── Sorting Logic ────────────────────────────────────────────────────────

  findBestStorageChest(areaName, itemName) {
    const chests = this.db[this.serverKey][areaName].chests;
    
    // 1. Find a chest that already has this exact item
    for (const data of Object.values(chests)) if (data.items[itemName]) return data.pos;
    
    // 2. Find a chest that matches the mc-data category
    const itemCat = this.getItemCategory(itemName);
    for (const data of Object.values(chests)) if (data.type === itemCat) return data.pos;

    // 3. Find an empty chest
    for (const data of Object.values(chests)) if (data.type === "Empty") return data.pos;

    // 4. Default to the very first chest found
    return Object.values(chests)[0]?.pos || null;
  }

  async sortChest(areaName, sourcePos) {
    this.lastActiveArea = areaName;
    if (!this.db[this.serverKey][areaName]?.chests) return this.bot.chat('Scan the area first.');

    // 1. Take everything from the source chest
    let sourceChest;
    try {
      sourceChest = await this.openChestAt(sourcePos);
      for (const item of sourceChest.containerItems()) {
        try { await sourceChest.withdraw(item.type, item.metadata, item.count); } 
        catch (e) { break; } // Inventory full
      }
    } finally { await this.closeChest(sourceChest); }

    // 2. Deposit items into proper categorized chests
    for (const item of this.bot.inventory.items()) {
      const destPos = this.findBestStorageChest(areaName, item.name);
      if (!destPos) continue;

      let destChest;
      try {
        destChest = await this.openChestAt(destPos);
        await destChest.deposit(item.type, item.metadata, item.count);
        
        // Update database seamlessly
        const key = this.posKey(destPos);
        this.db[this.serverKey][areaName].chests[key].items[item.name] = (this.db[this.serverKey][areaName].chests[key].items[item.name] || 0) + item.count;
        this.db[this.serverKey][areaName].chests[key].type = this.categorizeChest(this.db[this.serverKey][areaName].chests[key].items);
      } catch (e) { } 
      finally { await this.closeChest(destChest); }
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
    
    // Find everywhere the item is stored
    for (const data of Object.values(area.chests)) {
      if (data.items[itemName]) locations.push({ pos: data.pos, qty: data.items[itemName] });
    }

    if (locations.length === 0) return this.bot.chat(`I don't have any ${itemName} in [${areaName}].`);

    // Withdraw items
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

        // Update database
        const key = this.posKey(loc.pos);
        this.db[this.serverKey][areaName].chests[key].items[itemName] -= toTake;
        if (this.db[this.serverKey][areaName].chests[key].items[itemName] <= 0) {
          delete this.db[this.serverKey][areaName].chests[key].items[itemName];
        }
        this.db[this.serverKey][areaName].chests[key].type = this.categorizeChest(this.db[this.serverKey][areaName].chests[key].items);
      } catch (e) {} 
      finally { await this.closeChest(sourceChest); }
    }
    this.saveData();

    const grabbedAmount = count - needed;
    if (grabbedAmount <= 0) return;

    // Dump them into the destination chest requested by the user
    let destChest;
    try {
      destChest = await this.openChestAt(destPos);
      const botItems = this.bot.inventory.items().filter(i => i.name.includes(itemName));
      for (const item of botItems) {
        await destChest.deposit(item.type, item.metadata, item.count);
      }
    } finally { await this.closeChest(destChest); }

    this.bot.chat(`Fetched ${grabbedAmount} ${itemName} and dropped them in the target chest!`);
  }
}

module.exports = StorageManager;