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
    this.forceStop = false; // Kill switch
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

  // ─── Hybrid Precision Movement ──────────────────────────────────────────

  async goTo(pos, distance = 2.5) {
    if (this.forceStop) return Promise.resolve(); // Kill Switch

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
        this.bot.pathfinder.setGoal(null); 
        this.bot.clearControlStates();
          
        let stuckTimer = 0;
        let lastDist = dist;

        const walkTick = () => {
          if (this.forceStop) { // Kill Switch
            this.bot.removeListener('physicsTick', walkTick);
            this.bot.clearControlStates();
            return resolve();
          }

          dist = this.bot.entity.position.distanceTo(targetCenter);
          
          if (dist <= distance) {
            this.bot.removeListener('physicsTick', walkTick);
            this.bot.clearControlStates();
            return resolve();
          }

          stuckTimer++;
          if (stuckTimer % 20 === 0) { // Check if stuck every 1 second
            if (Math.abs(lastDist - dist) < 0.2) {
              this.bot.removeListener('physicsTick', walkTick);
              this.bot.clearControlStates();
              this.usePathfinder(pos, distance, targetCenter).then(resolve);
              return;
            }
            lastDist = dist;
          }

          this.bot.lookAt(targetCenter.offset(0, 0.5, 0), true);
          this.bot.setControlState('forward', true);
          this.bot.setControlState('jump', this.bot.entity.isCollidedHorizontally);
        };

        this.bot.on('physicsTick', walkTick);

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

  async usePathfinder(pos, distance, targetCenter) {
    return new Promise((resolve) => {
      this.bot.lookAt(targetCenter, true).then(() => {
        this.bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 1));
      });

      let isFinished = false;

      const cleanup = () => {
        if (!isFinished) {
          isFinished = true;
          this.bot.removeListener('physicsTick', checkPosition);
          this.bot.removeListener('goal_reached', cleanup);
          this.bot.pathfinder.setGoal(null);
          this.bot.clearControlStates();
          resolve();
        }
      };

      const checkPosition = () => {
        if (this.forceStop) return cleanup(); // Kill Switch
        
        if (isFinished) return;
        const currentDist = this.bot.entity.position.distanceTo(targetCenter);
        const block = this.bot.blockAt(pos);
        const hasSight = block ? this.bot.canSeeBlock(block) : false;

        if (currentDist <= distance && hasSight) {
          isFinished = true;
          this.bot.removeListener('physicsTick', checkPosition);
          this.bot.removeListener('goal_reached', cleanup);
          this.bot.pathfinder.setGoal(null);
          this.bot.clearControlStates();
          setTimeout(resolve, 200); 
        }
      };

      this.bot.on('physicsTick', checkPosition);
      this.bot.once('goal_reached', cleanup);
      setTimeout(cleanup, 12000);
    });
  }

  async goHome(areaName = null) {
    const area = areaName || this.lastActiveArea;
    if (!area || !this.db[this.serverKey][area]?.home) return;
    
    const h = this.db[this.serverKey][area].home;
    this.bot.chat(`Returning to home base in [${area}]...`);
    await this.goTo(new Vec3(h.x, h.y, h.z), 1.5);
  }

  async openChestAt(pos) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    await this.goTo(vec, 2.5); 
    if (this.forceStop) return null;

    await this.bot.lookAt(vec.offset(0.5, 0.5, 0.5), true);
    await this.bot.waitForTicks(5);
    
    const block = this.bot.blockAt(vec);
    if (!block) throw new Error('Chest block is not loaded.');

    return await this.bot.openContainer(block);
  }

  async closeChest(chestWindow) {
    if (chestWindow) { chestWindow.close(); await this.bot.waitForTicks(5); }
  }

  // ─── AI Categorization ───────────────────────────────────────────────────

  getItemCategory(itemName) {
    const item = this.mcData.itemsByName[itemName];
    if (!item) return "Misc";
    
    const n = itemName.toLowerCase();

    // 1. Food & Potions (Explicitly named so it never fails)
    if (n.match(/apple|bread|porkchop|beef|steak|mutton|chicken|cod|salmon|potato|carrot|melon|berry|cookie|pie|stew|soup|honey|potion|bottle/)) return "Food & Potions";

    // 2. Tools & Weapons
    if (n.match(/sword|pickaxe|_axe|_hoe|_bow|crossbow|trident|shield|arrow|bucket|fishing_rod|shears|flint|lead|name_tag/)) return "Tools & Weapons";
    
    // 3. Armor (Checked BEFORE Workstations so chestplate doesn't become a chest)
    if (n.match(/helmet|chestplate|leggings|boots|horse_armor|elytra/)) return "Armor";
    
    // 4. Redstone
    if (n.match(/redstone|piston|observer|repeater|comparator|dispenser|dropper|hopper|button|lever|pressure_plate|sensor|target|daylight_detector|torch|lamp/)) return "Redstone";
    
    // 5. Transport (Checked BEFORE Workstations so chest_minecart goes to Transport)
    if (n.match(/boat|minecart|rail|saddle/)) return "Transport";

    // 6. Workstations & Storage (Furnaces, Chests, Crafting Tables)
    if (n.match(/furnace|smoker|crafting_table|loom|stonecutter|grindstone|smithing_table|cartography_table|fletching_table|chest|barrel|shulker|bed|bell|anvil|cauldron|jukebox|noteblock|spawner|enchanting_table/)) return "Workstations & Storage";

    // 7. Ores & Minerals
    if (n.match(/_ore|raw_|ingot|nugget|diamond|emerald|coal|lapis|copper|gold|iron|netherite|quartz|amethyst|glowstone/)) return "Ores & Minerals";
    
    // 8. Nature & Wood
    if (n.match(/log|wood|planks|sapling|leaves|seeds|flower|mushroom|lily|vine|tall_grass|wheat|sugar_cane|kelp|moss|bamboo|cactus|sponge|web/)) return "Nature & Wood";
    
    // 9. Mob Drops & Dyes
    if (n.match(/dye|bone|string|gunpowder|feather|leather|slime|ender_pearl|blaze|ghast|spider|flesh|phantom|shell|prismarine_shard|prismarine_crystals|scute/)) return "Mob Drops & Dyes";
    
    // 10. Decorations
    if (n.match(/door|trapdoor|fence|wall|gate|sign|ladder|glass|pane|carpet|painting|item_frame|candle|banner|head|skull/)) return "Decorations";

    // 11. Building Blocks (Checked LAST so it doesn't hijack specific stone types)
    if (n.match(/stone|dirt|sand|gravel|clay|terracotta|concrete|bricks|diorite|andesite|granite|obsidian|basalt|blackstone|tuff|calcite|dripstone|ice|prismarine|mud|purpur|end_stone|netherrack|soul_sand|magma_block|nylium|coral/)) return "Building Blocks";

    // Absolute Fallback
    if (item.food) return "Food & Potions";

    return "Misc";
  }

  categorizeChest(items) {
    if (Object.keys(items).length === 0) return "Empty";
    const scores = {};
    for (const [itemName, count] of Object.entries(items)) {
      const cat = this.getItemCategory(itemName);
      scores[cat] = (scores[cat] || 0) + count;
    }
    return Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
  }

  // ─── Area Scanning ────────────────────────────────────────────────────────

  async scanArea(areaName) {
    this.lastActiveArea = areaName;
    const area = this.db[this.serverKey][areaName];
    if (!area || !area.bounds) return this.bot.chat('No bounds set for this area.');

    const containerIds =['chest', 'trapped_chest', 'barrel'].map(n => this.mcData.blocksByName[n]?.id).filter(Boolean);
    const blocks = this.bot.findBlocks({ matching: containerIds, maxDistance: 64, count: 5000 });
    
    const chests =[];
    for (const p of blocks) {
      if (p.x >= area.bounds.min.x && p.x <= area.bounds.max.x &&
          p.y >= area.bounds.min.y && p.y <= area.bounds.max.y &&
          p.z >= area.bounds.min.z && p.z <= area.bounds.max.z) {
        
        const block = this.bot.blockAt(p);
        // Ignore the right half of double chests so we don't scan them twice!
        if (block && (block.name === 'chest' || block.name === 'trapped_chest')) {
          if (block.getProperties().type === 'right') continue;
        }
        chests.push(p);
      }
    }

    if (chests.length === 0) return this.bot.chat('No chests found in bounds.');

    chests.sort((a, b) => this.bot.entity.position.distanceTo(a) - this.bot.entity.position.distanceTo(b));
    this.db[this.serverKey][areaName].chests = {};

    for (const pos of chests) {
      if (this.forceStop) break; // Kill Switch

      let chestWindow;
      try {
        chestWindow = await this.openChestAt(pos);
        if (!chestWindow) continue;
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
    
    if (!this.forceStop) {
      this.saveData();
      this.bot.chat(`Finished scanning ${chests.length} valid chests!`);
    }
  }

  // ─── Sorting Logic ────────────────────────────────────────────────────────

  findBestStorageChest(areaName, itemName) {
    const chests = this.db[this.serverKey][areaName].chests;
    for (const data of Object.values(chests)) if (data.items[itemName]) return data.pos;
    
    const itemCat = this.getItemCategory(itemName);
    for (const data of Object.values(chests)) if (data.type === itemCat) return data.pos;
    for (const data of Object.values(chests)) if (data.type === "Empty") return data.pos;
    
    return null; // Area is completely full!
  }

  async sortChest(areaName, sourcePos) {
    this.lastActiveArea = areaName;
    if (!this.db[this.serverKey][areaName]?.chests) return this.bot.chat('Scan the area first.');

    if (this.forceStop) return; // Kill Switch

    let sourceChest;
    try {
      sourceChest = await this.openChestAt(sourcePos);
      if (!sourceChest) return;
      for (const item of sourceChest.containerItems()) {
        try { 
          if (this.bot.inventory.emptySlotCount() === 0) {
            this.bot.chat('My inventory is full! Sorting what I have so far...');
            break; 
          }
          await sourceChest.withdraw(item.type, item.metadata, item.count); 
        } catch (e) { 
          continue; 
        } 
      }
    } catch(e) {
      return this.bot.chat(`Failed to open drop-off chest.`);
    } finally { 
      await this.closeChest(sourceChest); 
    }

    const destMap = new Map();
    
    for (const item of this.bot.inventory.items()) {
      const destPos = this.findBestStorageChest(areaName, item.name);
      if (!destPos) {
        this.bot.chat(`No room left for ${item.name}! Skipping.`);
        continue;
      }
      
      const key = this.posKey(destPos);
      if (!destMap.has(key)) destMap.set(key, { pos: destPos, items:[] });
      destMap.get(key).items.push(item);
      
      // If we assigned this to an Empty chest, immediately flag it in DB memory
      if (this.db[this.serverKey][areaName].chests[key].type === "Empty") {
        this.db[this.serverKey][areaName].chests[key].type = this.getItemCategory(item.name);
      }
    }

    for (const { pos, items } of destMap.values()) {
      if (this.forceStop) break; // Kill Switch

      let destChest;
      try {
        destChest = await this.openChestAt(pos);
        if (!destChest) continue;
        for (const item of items) {
          try {
            await destChest.deposit(item.type, item.metadata, item.count);
            
            const key = this.posKey(pos);
            this.db[this.serverKey][areaName].chests[key].items[item.name] = (this.db[this.serverKey][areaName].chests[key].items[item.name] || 0) + item.count;
            this.db[this.serverKey][areaName].chests[key].type = this.categorizeChest(this.db[this.serverKey][areaName].chests[key].items);
          } catch (e) {}
        }
      } catch (e) {
      } finally { 
        await this.closeChest(destChest); 
      }
    }
    
    if (!this.forceStop) {
      this.saveData();
      this.bot.chat('Sorting complete!');
    }
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
      if (this.forceStop) break; // Kill Switch
      if (needed <= 0) break;
      
      const itemId = this.mcData.itemsByName[itemName]?.id;
      if (!itemId) continue;

      let sourceChest;
      try {
        sourceChest = await this.openChestAt(loc.pos);
        if (!sourceChest) continue;
        
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
    
    if (this.forceStop) return;

    this.saveData();

    const grabbedAmount = count - needed;
    if (grabbedAmount <= 0) return;

    let destChest;
    try {
      destChest = await this.openChestAt(destPos);
      if (!destChest) return;
      const botItems = this.bot.inventory.items().filter(i => i.name.includes(itemName));
      for (const item of botItems) {
        await destChest.deposit(item.type, item.metadata, item.count);
      }
    } finally { await this.closeChest(destChest); }

    this.bot.chat(`Fetched ${grabbedAmount} ${itemName}!`);
  }
}

module.exports = StorageManager;