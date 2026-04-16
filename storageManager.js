const fs = require('fs');
const path = require('path');
const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder');

const DATA_FILE = path.join(__dirname, 'chest_data.json');

class StorageManager {
  constructor(bot) {
    this.bot = bot;
    this.chestMap = {}; // { "x,y,z": { pos, type: "Logs", items: {name: count} } }
    this.loadData();
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  loadData() {
    if (fs.existsSync(DATA_FILE)) {
      try {
        this.chestMap = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      } catch {
        this.chestMap = {};
      }
    }
  }

  saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.chestMap, null, 2));
  }

  posKey(pos) {
    return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
  }

  clearData() {
    this.chestMap = {};
    this.saveData();
    this.bot.chat('Chest database cleared.');
  }

  // ─── Movement (Anti-Spinning) ─────────────────────────────────────────────

  async goTo(pos) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    const center = vec.offset(0.5, 0.5, 0.5);
    
    // Check if we are already within a safe reach distance (3.5 blocks)
    if (this.bot.entity.position.distanceTo(center) <= 3.5) {
      this.bot.pathfinder.setGoal(null);
      this.bot.clearControlStates(); // Force release all movement keys
      return; 
    }

    console.log(`[Movement] Walking to ${vec.x},${vec.y},${vec.z}...`);
    
    try {
      // Use a distance of 3 so the bot doesn't bump into the chest and spin
      const goal = new goals.GoalNear(vec.x, vec.y, vec.z, 3);
      await this.bot.pathfinder.goto(goal);
    } catch (err) {
      console.log(`[Movement] Path resolved or interrupted: ${err.message}`);
    } finally {
      // THE FIX: Always kill movement and clear keyboard states when done!
      this.bot.pathfinder.setGoal(null);
      this.bot.clearControlStates();
      await this.bot.waitForTicks(5);
    }
  }

  // ─── Chest Interaction ────────────────────────────────────────────────────

  async openChestAt(pos) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    const block = this.bot.blockAt(vec);
    
    if (!block) throw new Error('Block not loaded');

    await this.goTo(vec);
    
    // Look at the exact center of the chest
    await this.bot.lookAt(vec.offset(0.5, 0.5, 0.5), true);
    await this.bot.waitForTicks(5);

    const chestWindow = await this.bot.openContainer(block);
    return chestWindow;
  }

  async closeChest(chestWindow) {
    if (chestWindow) {
      chestWindow.close();
      await this.bot.waitForTicks(5);
    }
  }

  // ─── AI Chest Categorization ──────────────────────────────────────────────

  categorizeChest(items) {
    if (Object.keys(items).length === 0) return "Empty Chest";

    const categories = {
      "Logs & Wood":["log", "planks", "wood", "slab", "stair", "fence", "door"],
      "Stone & Earth":["stone", "dirt", "cobblestone", "gravel", "sand", "granite", "diorite", "andesite", "deepslate", "tuff"],
      "Ores & Valuables":["iron", "gold", "diamond", "emerald", "coal", "lapis", "redstone", "copper", "netherite", "raw"],
      "Food & Farming":["apple", "bread", "beef", "porkchop", "potato", "carrot", "wheat", "seed", "melon", "pumpkin", "sugar"],
      "Tools & Armor":["sword", "pickaxe", "axe", "shovel", "hoe", "helmet", "chestplate", "leggings", "boots", "shield"],
      "Mob Loot":["rotten_flesh", "bone", "gunpowder", "string", "spider_eye", "ender_pearl", "slime_ball"]
    };

    let bestCategory = "Misc / Mixed";
    let maxScore = 0;

    // Calculate which category has the highest number of items in the chest
    for (const [catName, keywords] of Object.entries(categories)) {
      let score = 0;
      for (const [itemName, count] of Object.entries(items)) {
        if (keywords.some(kw => itemName.includes(kw))) {
          score += count;
        }
      }
      if (score > maxScore && score > 0) {
        maxScore = score;
        bestCategory = catName;
      }
    }

    return bestCategory;
  }

  // ─── Scanning ─────────────────────────────────────────────────────────────

  async scanArea(min, max) {
    const mcData = require('minecraft-data')(this.bot.version);
    const containerNames =['chest', 'trapped_chest', 'barrel'];
    const containerIds = containerNames.map(n => mcData.blocksByName[n]?.id).filter(Boolean);

    // Find all chests in the loaded area
    const blocks = this.bot.findBlocks({
      matching: containerIds,
      maxDistance: 64,
      count: 5000
    });

    // Filter to ONLY chests inside the coordinates provided in config.json
    const chestsInArea = blocks.filter(pos => 
      pos.x >= Math.min(min.x, max.x) && pos.x <= Math.max(min.x, max.x) &&
      pos.y >= Math.min(min.y, max.y) && pos.y <= Math.max(min.y, max.y) &&
      pos.z >= Math.min(min.z, max.z) && pos.z <= Math.max(min.z, max.z)
    );

    if (chestsInArea.length === 0) {
      this.bot.chat('No chests found in this area.');
      return;
    }

    this.bot.chat(`/msg ItayosOnTop Found ${chestsInArea.length} chests. Beginning scan...`);

    // Sort chests by distance so the bot walks efficiently
    let remainingChests = [...chestsInArea];

    while (remainingChests.length > 0) {
      remainingChests.sort((a, b) => this.bot.entity.position.distanceTo(a) - this.bot.entity.position.distanceTo(b));
      const nextChest = remainingChests.shift(); 
      
      try {
        await this.scanChest(nextChest);
      } catch (err) {
        console.error(`[Storage] Failed chest at ${nextChest.x},${nextChest.y},${nextChest.z}:`, err.message);
      }
    }

    // Finished scanning. Save data and force bot to completely stop.
    this.saveData();
    this.bot.pathfinder.setGoal(null);
    this.bot.clearControlStates();
    
    this.bot.chat('Scan complete! Check the JSON file. I will remember these chests now.');
  }

  async scanChest(pos) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    const block = this.bot.blockAt(vec);
    
    // Check if chest is blocked by a solid block above it
    const blockAbove = this.bot.blockAt(vec.offset(0, 1, 0));
    if (blockAbove && blockAbove.boundingBox === 'block' && block.name.includes('chest')) {
        console.log(`[Scanning] Skipping chest at ${vec.x},${vec.y},${vec.z} - Blocked from above.`);
        return;
    }

    console.log(`[Scanning] Opening chest at ${vec.x},${vec.y},${vec.z}`);
    
    let chestWindow;
    try {
      chestWindow = await this.openChestAt(vec);
      if (!chestWindow) return;

      const items = {};
      for (const item of chestWindow.containerItems()) {
        items[item.name] = (items[item.name] || 0) + item.count;
      }

      // Determine what kind of chest this is based on its items
      const chestCategory = this.categorizeChest(items);

      const key = this.posKey(vec);
      this.chestMap[key] = {
        pos: { x: vec.x, y: vec.y, z: vec.z },
        type: chestCategory,
        items: items
      };

      console.log(`[Scanning] Categorized as:[${chestCategory}]`);

    } finally {
      if (chestWindow) await this.closeChest(chestWindow);
    }
  }

  // ─── Fetching & Finding (Uses Memory, No Scanning!) ───────────────────────

  findItem(itemName) {
    itemName = itemName.toLowerCase();
    const locations =[];

    // Searches the JSON file memory instantly. No walking required.
    for (const [key, data] of Object.entries(this.chestMap)) {
      for (const [name, count] of Object.entries(data.items)) {
        if (name.includes(itemName)) {
          locations.push({ pos: data.pos, type: data.type, name, count });
        }
      }
    }

    if (locations.length === 0) {
      this.bot.chat(`/msg ItayosOnTop I don't have any ${itemName} in memory.`);
    } else {
      this.bot.chat(`/msg ItayosOnTop Found ${itemName} in ${locations.length} chest(s).`);
      locations.forEach(loc => console.log(`[Memory] ${loc.count}x ${loc.name} in [${loc.type}] at ${loc.pos.x}, ${loc.pos.y}, ${loc.pos.z}`));
    }
    return locations;
  }

  async fetchItem(itemName, count) {
    const mcData = require('minecraft-data')(this.bot.version);
    const locations = this.findItem(itemName);
    
    if (locations.length === 0) return;

    let needed = count;
    this.bot.chat(`/msg ItayosOnTop Fetching ${count}x ${itemName} from storage...`);

    for (const loc of locations) {
      if (needed <= 0) break;

      const itemId = mcData.itemsByName[loc.name]?.id;
      if (!itemId) continue;

      let chestWindow;
      try {
        chestWindow = await this.openChestAt(new Vec3(loc.pos.x, loc.pos.y, loc.pos.z));
        
        const toTake = Math.min(needed, loc.count);
        await chestWindow.withdraw(itemId, null, toTake);
        
        needed -= toTake;
        this.bot.chat(`/msg ItayosOnTop Grabbed ${toTake} ${loc.name} from the [${loc.type}] chest.`);
        
        // Update database so bot knows it took the items
        this.chestMap[this.posKey(loc.pos)].items[loc.name] -= toTake;
        if (this.chestMap[this.posKey(loc.pos)].items[loc.name] <= 0) {
          delete this.chestMap[this.posKey(loc.pos)].items[loc.name];
        }

        // Re-evaluate category in case the chest is empty now
        this.chestMap[this.posKey(loc.pos)].type = this.categorizeChest(this.chestMap[this.posKey(loc.pos)].items);

      } catch (err) {
        console.error(`[Storage] Failed to fetch from ${loc.pos.x},${loc.pos.y},${loc.pos.z}:`, err.message);
      } finally {
        if (chestWindow) await this.closeChest(chestWindow);
      }
    }

    this.saveData();
    this.bot.pathfinder.setGoal(null);
    this.bot.clearControlStates();

    if (needed > 0) {
      this.bot.chat(`/msg ItayosOnTop Could not find enough ${itemName}. Short by ${needed}.`);
    } else {
      this.bot.chat(`/msg ItayosOnTop Finished fetching ${count} ${itemName}! I am done.`);
    }
  }

  // ─── Info ──────────────────────────────────────────────────────────────────

  listChests() {
    const keys = Object.keys(this.chestMap);
    if (keys.length === 0) {
      this.bot.chat('I have 0 chests in memory. Run a scan first.');
      return;
    }
    this.bot.chat(`/msg ItayosOnTop I have catalogued ${keys.length} chest(s).`);
    // Logs the categories to the console so you can see them
    const types = {};
    for (const data of Object.values(this.chestMap)) {
      types[data.type] = (types[data.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(types)) {
      console.log(`- ${count}x [${type}] chests`);
    }
  }

  inspectChest(pos) {
    const key = this.posKey(pos);
    const data = this.chestMap[key];
    if (!data) {
      this.bot.chat(`/msg ItayosOnTop I don't have any data for a chest at ${pos.x},${pos.y},${pos.z}`);
      return;
    }
    
    const items = Object.entries(data.items).map(([name, count]) => `${count}x ${name}`).join(', ');
    this.bot.chat(`/msg ItayosOnTop [${data.type}] Chest at ${pos.x},${pos.y},${pos.z}: ${items || 'Empty'}`);
  }

  async sortInventory() {
    this.bot.chat("/msg ItayosOnTop Sorting inventory logic not fully implemented yet.");
  }

  async sortChest(pos) {
    this.bot.chat("/msg ItayosOnTop Sorting single chest logic not fully implemented yet.");
  }
}

module.exports = StorageManager;