const fs = require('fs');
const path = require('path');
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');

const DATA_FILE = path.join(__dirname, 'chest_data.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

class StorageManager {
  constructor(bot) {
    this.bot = bot;
    this.chestMap = {}; // { "x,y,z": { pos, type, items: {name: count} } }
    this.loadData();
  }

  loadData() {
    if (fs.existsSync(DATA_FILE)) {
      try { this.chestMap = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } 
      catch { this.chestMap = {}; }
    }
  }

  saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.chestMap, null, 2));
  }

  posKey(pos) {
    return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
  }

  // ─── Core Movement ────────────────────────────────────────────────────────

  async goTo(pos, distance = 3) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    const center = vec.offset(0.5, 0.5, 0.5);
    
    if (this.bot.entity.position.distanceTo(center) <= distance + 0.5) {
      this.bot.pathfinder.setGoal(null);
      this.bot.clearControlStates();
      return; 
    }

    try {
      await this.bot.pathfinder.goto(new goals.GoalNear(vec.x, vec.y, vec.z, distance));
    } catch (err) {
      console.log(`[Movement] Interrupted: ${err.message}`);
    } finally {
      this.bot.pathfinder.setGoal(null);
      this.bot.clearControlStates();
      await this.bot.waitForTicks(5);
    }
  }

  async goHome() {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!config.home) return;
    
    console.log('[Storage] Returning to home position...');
    await this.goTo(config.home, 1);
  }

  // ─── Chest Interactions ───────────────────────────────────────────────────

  async openChestAt(pos) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    const block = this.bot.blockAt(vec);
    if (!block) throw new Error('Block not loaded');

    await this.goTo(vec);
    await this.bot.lookAt(vec.offset(0.5, 0.5, 0.5), true);
    await this.bot.waitForTicks(5);
    return await this.bot.openContainer(block);
  }

  async closeChest(chestWindow) {
    if (chestWindow) {
      chestWindow.close();
      await this.bot.waitForTicks(5);
    }
  }

  categorizeChest(items) {
    if (Object.keys(items).length === 0) return "Empty";
    const categories = {
      "Wood": ["log", "planks", "wood", "slab", "stair", "fence"],
      "Stone":["stone", "dirt", "cobblestone", "gravel", "sand", "deepslate"],
      "Ores":["iron", "gold", "diamond", "emerald", "coal", "lapis", "redstone", "copper"],
      "Food":["apple", "bread", "beef", "porkchop", "potato", "carrot", "wheat"],
      "Gear":["sword", "pickaxe", "axe", "shovel", "helmet", "chestplate", "leggings", "boots"]
    };
    let best = "Misc";
    let max = 0;
    for (const [catName, keywords] of Object.entries(categories)) {
      let score = 0;
      for (const itemName of Object.keys(items)) {
        if (keywords.some(kw => itemName.includes(kw))) score += items[itemName];
      }
      if (score > max) { max = score; best = catName; }
    }
    return best;
  }

  // ─── Base Scanning ────────────────────────────────────────────────────────

  async scanArea(min, max) {
    const mcData = require('minecraft-data')(this.bot.version);
    const containerIds =['chest', 'trapped_chest', 'barrel'].map(n => mcData.blocksByName[n]?.id).filter(Boolean);

    const blocks = this.bot.findBlocks({ matching: containerIds, maxDistance: 64, count: 5000 });
    const chests = blocks.filter(p => 
      p.x >= Math.min(min.x, max.x) && p.x <= Math.max(min.x, max.x) &&
      p.y >= Math.min(min.y, max.y) && p.y <= Math.max(min.y, max.y) &&
      p.z >= Math.min(min.z, max.z) && p.z <= Math.max(min.z, max.z)
    );

    if (chests.length === 0) {
      this.bot.chat('No chests found in the base area.');
      return;
    }

    this.bot.chat(`Scanning ${chests.length} chests to update memory...`);
    for (const pos of chests) {
      let chestWindow;
      try {
        chestWindow = await this.openChestAt(pos);
        const items = {};
        for (const item of chestWindow.containerItems()) {
          items[item.name] = (items[item.name] || 0) + item.count;
        }
        this.chestMap[this.posKey(pos)] = { pos, type: this.categorizeChest(items), items };
      } catch (err) { } 
      finally { await this.closeChest(chestWindow); }
    }
    this.saveData();
    this.bot.chat('Base area scan complete!');
  }

  // ─── Sorting Logic (!sort) ────────────────────────────────────────────────

  findBestStorageChest(itemName) {
    // 1. Find a chest that already has this item
    for (const [key, data] of Object.entries(this.chestMap)) {
      if (data.items[itemName]) return data.pos;
    }
    // 2. Find an empty chest as a fallback
    for (const [key, data] of Object.entries(this.chestMap)) {
      if (data.type === "Empty") return data.pos;
    }
    // 3. Return the very first chest in memory if nowhere else fits
    const keys = Object.keys(this.chestMap);
    return keys.length > 0 ? this.chestMap[keys[0]].pos : null;
  }

  async sortChest(sourcePos) {
    const mcData = require('minecraft-data')(this.bot.version);
    this.bot.chat('Taking items out of the drop chest...');
    
    // Step 1: Empty the target chest into Bot's inventory
    let sourceChest = await this.openChestAt(sourcePos);
    for (const item of sourceChest.containerItems()) {
      try {
        await sourceChest.withdraw(item.type, item.metadata, item.count);
      } catch (e) {
        this.bot.chat('My inventory is full! Sorting what I have so far.');
        break;
      }
    }
    await this.closeChest(sourceChest);

    // Step 2: Deposit items from Bot's inventory into base area chests
    const botItems = this.bot.inventory.items();
    if (botItems.length === 0) {
      this.bot.chat('No items to sort.');
      return;
    }

    for (const item of botItems) {
      const destPos = this.findBestStorageChest(item.name);
      if (!destPos) {
        this.bot.chat(`I don't have anywhere to put ${item.name}. Skipping.`);
        continue;
      }

      let destChest;
      try {
        destChest = await this.openChestAt(destPos);
        await destChest.deposit(item.type, item.metadata, item.count);
        
        // Update memory
        const key = this.posKey(destPos);
        this.chestMap[key].items[item.name] = (this.chestMap[key].items[item.name] || 0) + item.count;
        this.chestMap[key].type = this.categorizeChest(this.chestMap[key].items);
      } catch (e) {
        console.error(`Failed to deposit ${item.name}: ${e.message}`);
      } finally {
        await this.closeChest(destChest);
      }
    }
    this.saveData();
    this.bot.chat('Finished sorting!');
  }

  // ─── Fetching Logic (!fetch) ──────────────────────────────────────────────

  async fetchItemToChest(itemName, count, destPos) {
    const mcData = require('minecraft-data')(this.bot.version);
    let needed = count;

    // Step 1: Find where the items are
    const locations = [];
    for (const[key, data] of Object.entries(this.chestMap)) {
      for (const [name, qty] of Object.entries(data.items)) {
        if (name.includes(itemName)) locations.push({ pos: data.pos, name, qty });
      }
    }

    if (locations.length === 0) {
      this.bot.chat(`I don't have any ${itemName} in storage.`);
      return;
    }

    this.bot.chat(`Gathering ${count} ${itemName} from storage...`);

    // Step 2: Grab the items from storage chests
    for (const loc of locations) {
      if (needed <= 0) break;
      const itemId = mcData.itemsByName[loc.name]?.id;
      if (!itemId) continue;

      let sourceChest;
      try {
        sourceChest = await this.openChestAt(loc.pos);
        const toTake = Math.min(needed, loc.qty);
        await sourceChest.withdraw(itemId, null, toTake);
        needed -= toTake;

        // Update memory
        const key = this.posKey(loc.pos);
        this.chestMap[key].items[loc.name] -= toTake;
        if (this.chestMap[key].items[loc.name] <= 0) delete this.chestMap[key].items[loc.name];
        this.chestMap[key].type = this.categorizeChest(this.chestMap[key].items);
      } catch (e) {} 
      finally { await this.closeChest(sourceChest); }
    }
    this.saveData();

    // Step 3: Deposit the gathered items into the user's requested chest
    const grabbedAmount = count - needed;
    if (grabbedAmount <= 0) return;

    this.bot.chat(`Gathered ${grabbedAmount}. Putting it in chest at ${destPos.x}, ${destPos.y}, ${destPos.z}...`);
    
    let destChest;
    try {
      destChest = await this.openChestAt(destPos);
      const botItems = this.bot.inventory.items().filter(i => i.name.includes(itemName));
      for (const item of botItems) {
        await destChest.deposit(item.type, item.metadata, item.count);
      }
    } catch (e) {
      this.bot.chat(`Could not put items in the destination chest: ${e.message}`);
    } finally {
      await this.closeChest(destChest);
    }

    this.bot.chat(`Finished fetching task!`);
  }
}

module.exports = StorageManager;