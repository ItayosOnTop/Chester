const { goals, GoalBlock } = require('mineflayer-pathfinder');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'chest_data.json');

class StorageManager {
  constructor(bot) {
    this.bot = bot;
    this.chestMap = {}; // key: "x,y,z" → { pos, categories: [string], items: {name: count} }
    this.loadData();
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  loadData() {
    if (fs.existsSync(DATA_FILE)) {
      try {
        this.chestMap = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        console.log(`[Storage] Loaded ${Object.keys(this.chestMap).length} chests from disk.`);
      } catch (e) {
        console.error('[Storage] Failed to load chest data:', e.message);
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

  // ─── Movement ─────────────────────────────────────────────────────────────

  async goTo(pos) {
    return new Promise((resolve, reject) => {
      const goal = new GoalBlock(
        Math.floor(pos.x),
        Math.floor(pos.y),
        Math.floor(pos.z)
      );
      this.bot.pathfinder.setGoal(goal);

      const onGoalReached = () => {
        cleanup();
        resolve();
      };
      const onPathStopped = (reason) => {
        cleanup();
        // treat 'noPath' as partial success if close enough
        const dist = this.bot.entity.position.distanceTo(pos);
        if (dist < 4) resolve();
        else reject(new Error(`Cannot reach ${pos.x},${pos.y},${pos.z}: ${reason}`));
      };

      function cleanup() {
        this.bot.pathfinder.removeListener('goal_reached', onGoalReached);
        this.bot.pathfinder.removeListener('path_stop', onPathStopped);
      }
      cleanup = cleanup.bind(this);

      this.bot.pathfinder.once('goal_reached', onGoalReached);
      this.bot.pathfinder.once('path_stop', onPathStopped);
    });
  }

  async moveNearBlock(pos) {
    // Stand adjacent to the chest (within 3 blocks)
    const offsets = [
      { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
      { x: 0, y: 1, z: 0 },
    ];
    for (const off of offsets) {
      const target = {
        x: Math.floor(pos.x) + off.x,
        y: Math.floor(pos.y) + off.y,
        z: Math.floor(pos.z) + off.z,
      };
      try {
        await this.goTo(target);
        return;
      } catch (_) {}
    }
    throw new Error(`Cannot navigate near chest at ${pos.x},${pos.y},${pos.z}`);
  }

  // ─── Chest Interaction ────────────────────────────────────────────────────

  async openChestAt(pos) {
    const block = this.bot.blockAt(pos);
    if (!block) throw new Error('No block found at position');

    await this.moveNearBlock(pos);
    await this.bot.lookAt(pos.offset(0.5, 0.5, 0.5), true);

    const chest = await this.bot.openChest(block);
    return chest;
  }

  async closeChest(chest) {
    try {
      chest.close();
    } catch (_) {}
    await this.sleep(200);
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ─── Scanning ─────────────────────────────────────────────────────────────

  async scanArea(min, max) {
    this.bot.chat(`Scanning area from ${min.x},${min.y},${min.z} to ${max.x},${max.y},${max.z}...`);

    const minX = Math.min(min.x, max.x);
    const minY = Math.min(min.y, max.y);
    const minZ = Math.min(min.z, max.z);
    const maxX = Math.max(min.x, max.x);
    const maxY = Math.max(min.y, max.y);
    const maxZ = Math.max(min.z, max.z);

    const chestBlocks = [];
    const visited = new Set();

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const block = this.bot.blockAt({ x, y, z });
          if (!block) continue;
          if (!block.name.includes('chest') && !block.name.includes('barrel')) continue;

          // Avoid double-counting double chests
          const key = `${x},${y},${z}`;
          if (visited.has(key)) continue;
          visited.add(key);

          // For double chests, also mark the partner
          const props = block.getProperties ? block.getProperties() : {};
          if (props.type === 'left' || props.type === 'right') {
            const partner = this.getDoubleChestPartner(block, props);
            if (partner) visited.add(`${partner.x},${partner.y},${partner.z}`);
          }

          chestBlocks.push({ x, y, z });
        }
      }
    }

    this.bot.chat(`Found ${chestBlocks.length} chest(s). Scanning contents...`);

    let scanned = 0;
    for (const pos of chestBlocks) {
      try {
        await this.scanChest(pos);
        scanned++;
        if (scanned % 5 === 0) {
          this.bot.chat(`Progress: ${scanned}/${chestBlocks.length} chests scanned.`);
        }
      } catch (err) {
        console.error(`[Storage] Failed to scan chest at ${pos.x},${pos.y},${pos.z}:`, err.message);
        this.bot.chat(`Warning: Could not scan chest at ${pos.x},${pos.y},${pos.z}`);
      }
      await this.sleep(300);
    }

    this.saveData();
    this.bot.chat(`Scan complete! ${scanned} chests catalogued. Use !listchests to view.`);
  }

  getDoubleChestPartner(block, props) {
    const p = block.position;
    const facing = props.facing;
    const type = props.type;

    const faceMap = {
      north: { left: { x: 1, z: 0 }, right: { x: -1, z: 0 } },
      south: { left: { x: -1, z: 0 }, right: { x: 1, z: 0 } },
      east:  { left: { x: 0, z: -1 }, right: { x: 0, z: 1 } },
      west:  { left: { x: 0, z: 1 }, right: { x: 0, z: -1 } },
    };

    if (!faceMap[facing]) return null;
    const dir = type === 'left' ? faceMap[facing].right : faceMap[facing].left;
    return { x: p.x + dir.x, y: p.y, z: p.z + dir.z };
  }

  async scanChest(pos) {
    const vecPos = this.bot.blockAt(pos)?.position || pos;
    const chest = await this.openChestAt(vecPos);

    const items = {};
    for (const item of chest.items()) {
      const name = item.name;
      items[name] = (items[name] || 0) + item.count;
    }

    await this.closeChest(chest);

    const categories = this.categorizeItems(Object.keys(items));
    const key = this.posKey(vecPos);

    this.chestMap[key] = {
      pos: { x: Math.floor(vecPos.x), y: Math.floor(vecPos.y), z: Math.floor(vecPos.z) },
      categories,
      items,
      lastScanned: new Date().toISOString(),
    };

    console.log(`[Storage] Scanned chest at ${key}: ${Object.keys(items).length} item types, categories: ${categories.join(', ')}`);
  }

  categorizeItems(itemNames) {
    const categories = new Set();

    const rules = [
      { pattern: /log$|log_/, category: 'logs' },
      { pattern: /plank/, category: 'planks' },
      { pattern: /stone|cobblestone|granite|diorite|andesite|deepslate|tuff/, category: 'stone' },
      { pattern: /sand$|gravel|dirt|clay|mud|soul_sand|soul_soil/, category: 'terrain' },
      { pattern: /ore$|raw_/, category: 'ores' },
      { pattern: /ingot|nugget/, category: 'metals' },
      { pattern: /diamond|emerald|amethyst|quartz/, category: 'gems' },
      { pattern: /sword|axe|pickaxe|shovel|hoe|bow|crossbow|trident|shield/, category: 'tools_weapons' },
      { pattern: /helmet|chestplate|leggings|boots|armor/, category: 'armor' },
      { pattern: /food|bread|carrot|potato|apple|meat|fish|cookie|cake|pie|stew|soup/, category: 'food' },
      { pattern: /seed|wheat|crop|harvest/, category: 'farming' },
      { pattern: /potion|splash|lingering/, category: 'potions' },
      { pattern: /redstone|comparator|repeater|observer|piston|hopper|dropper|dispenser|lever|button|pressure/, category: 'redstone' },
      { pattern: /wool|carpet|banner|bed/, category: 'decoration' },
      { pattern: /glass|pane/, category: 'glass' },
      { pattern: /torch|lantern|lamp|light/, category: 'lighting' },
      { pattern: /book|paper|map|compass|clock|knowledge/, category: 'misc_items' },
      { pattern: /chest|barrel|shulker|container/, category: 'storage' },
      { pattern: /mob|spawn|egg/, category: 'mob_items' },
      { pattern: /slime|string|feather|leather|bone|gunpowder|blaze|ender|pearl|scale/, category: 'mob_drops' },
    ];

    for (const itemName of itemNames) {
      let matched = false;
      for (const rule of rules) {
        if (rule.pattern.test(itemName)) {
          categories.add(rule.category);
          matched = true;
          break;
        }
      }
      if (!matched) categories.add('misc');
    }

    return [...categories];
  }

  // ─── Sorting ──────────────────────────────────────────────────────────────

  /**
   * Sort inventory: for each item in bot's inventory, find a matching chest and deposit.
   */
  async sortInventory() {
    this.bot.chat('Starting sort: scanning my inventory...');
    const invItems = this.bot.inventory.items();

    if (invItems.length === 0) {
      this.bot.chat('My inventory is empty, nothing to sort!');
      return;
    }

    this.bot.chat(`I have ${invItems.length} item stack(s) to sort.`);
    let sorted = 0;
    let unsorted = [];

    for (const item of invItems) {
      const target = this.findBestChestForItem(item.name);
      if (!target) {
        unsorted.push(item.name);
        continue;
      }

      try {
        await this.depositItem(item, target);
        sorted++;
      } catch (err) {
        console.error(`[Storage] Failed to deposit ${item.name}:`, err.message);
        this.bot.chat(`Failed to deposit ${item.name}: ${err.message}`);
      }

      await this.sleep(400);
    }

    this.saveData();

    if (unsorted.length > 0) {
      this.bot.chat(`Sorted ${sorted} stacks! No matching chest for: ${[...new Set(unsorted)].join(', ')}`);
    } else {
      this.bot.chat(`All ${sorted} stacks sorted successfully!`);
    }
  }

  /**
   * Sort a specific chest: open it, take items, then route them to correct chests.
   */
  async sortChest(pos) {
    this.bot.chat(`Sorting chest at ${pos.x},${pos.y},${pos.z}...`);

    let chest;
    try {
      chest = await this.openChestAt(pos);
    } catch (err) {
      this.bot.chat(`Cannot open chest: ${err.message}`);
      return;
    }

    const itemsInChest = chest.items();
    if (itemsInChest.length === 0) {
      this.bot.chat('Chest is already empty!');
      await this.closeChest(chest);
      return;
    }

    // Withdraw all items into bot inventory
    for (const item of itemsInChest) {
      try {
        await chest.withdraw(item.type, item.metadata, item.count);
        await this.sleep(100);
      } catch (err) {
        console.error(`[Storage] Withdraw error:`, err.message);
      }
    }

    await this.closeChest(chest);
    this.bot.chat(`Picked up ${this.bot.inventory.items().length} stacks. Now sorting...`);

    await this.sortInventory();
  }

  findBestChestForItem(itemName) {
    const itemCategories = this.categorizeItems([itemName]);
    let bestChest = null;
    let bestScore = -1;

    for (const [key, data] of Object.entries(this.chestMap)) {
      // Score: +10 for exact item match, +5 for category match
      let score = 0;

      if (data.items && data.items[itemName]) score += 10;

      for (const cat of itemCategories) {
        if (data.categories.includes(cat)) score += 5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestChest = data;
      }
    }

    return bestScore > 0 ? bestChest : null;
  }

  async depositItem(invItem, chestData) {
    const chestBlock = this.bot.blockAt(chestData.pos);
    if (!chestBlock) throw new Error('Chest block not found in world');

    const chest = await this.openChestAt(chestData.pos);

    try {
      // Find the item in inventory again (position may have shifted)
      const item = this.bot.inventory.items().find(i => i.name === invItem.name);
      if (!item) {
        await this.closeChest(chest);
        return;
      }

      await chest.deposit(item.type, item.metadata, item.count);

      // Update our cache
      const key = this.posKey(chestData.pos);
      if (this.chestMap[key]) {
        this.chestMap[key].items[item.name] = (this.chestMap[key].items[item.name] || 0) + item.count;
      }
    } finally {
      await this.closeChest(chest);
    }
  }

  // ─── Fetching ─────────────────────────────────────────────────────────────

  async fetchItem(itemName, count = 1) {
    this.bot.chat(`Fetching ${count}x ${itemName}...`);

    const sources = this.findChestsWithItem(itemName);
    if (sources.length === 0) {
      this.bot.chat(`No chest found containing ${itemName}!`);
      return;
    }

    let remaining = count;
    let fetched = 0;

    for (const chestData of sources) {
      if (remaining <= 0) break;

      const available = chestData.items[itemName] || 0;
      const toFetch = Math.min(available, remaining);

      try {
        const chest = await this.openChestAt(chestData.pos);

        const mcData = require('minecraft-data')(this.bot.version);
        const itemType = mcData.itemsByName[itemName];
        if (!itemType) {
          await this.closeChest(chest);
          this.bot.chat(`Unknown item: ${itemName}`);
          return;
        }

        await chest.withdraw(itemType.id, null, toFetch);
        fetched += toFetch;
        remaining -= toFetch;

        // Update cache
        const key = this.posKey(chestData.pos);
        if (this.chestMap[key]) {
          this.chestMap[key].items[itemName] = Math.max(0, available - toFetch);
          if (this.chestMap[key].items[itemName] === 0) {
            delete this.chestMap[key].items[itemName];
          }
        }

        await this.closeChest(chest);
      } catch (err) {
        console.error(`[Storage] Fetch error:`, err.message);
        this.bot.chat(`Error fetching from chest at ${chestData.pos.x},${chestData.pos.y},${chestData.pos.z}: ${err.message}`);
      }

      await this.sleep(400);
    }

    this.saveData();

    if (fetched > 0) {
      this.bot.chat(`Fetched ${fetched}x ${itemName}! ${remaining > 0 ? `(${remaining} not available)` : ''}`);
    } else {
      this.bot.chat(`Failed to fetch any ${itemName}.`);
    }
  }

  findChestsWithItem(itemName) {
    return Object.values(this.chestMap)
      .filter(data => data.items && data.items[itemName] > 0)
      .sort((a, b) => (b.items[itemName] || 0) - (a.items[itemName] || 0));
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  listChests() {
    const keys = Object.keys(this.chestMap);
    if (keys.length === 0) {
      this.bot.chat('No chests catalogued yet. Use !scan to scan an area.');
      return;
    }

    this.bot.chat(`=== ${keys.length} Catalogued Chest(s) ===`);
    for (const key of keys) {
      const data = this.chestMap[key];
      const cats = data.categories.join(', ');
      const itemCount = Object.keys(data.items || {}).length;
      this.bot.chat(`[${key}] ${cats} (${itemCount} item types)`);
    }
  }

  inspectChest(pos) {
    const key = this.posKey(pos);
    const data = this.chestMap[key];

    if (!data) {
      this.bot.chat(`No recorded data for chest at ${key}. Try scanning first.`);
      return;
    }

    this.bot.chat(`=== Chest at ${key} ===`);
    this.bot.chat(`Categories: ${data.categories.join(', ')}`);
    this.bot.chat(`Contents (${Object.keys(data.items).length} types):`);

    const entries = Object.entries(data.items || {});
    if (entries.length === 0) {
      this.bot.chat('  (empty)');
      return;
    }

    // Chat is limited, send in chunks
    const lines = entries.map(([name, count]) => `  ${name}: ${count}`);
    for (let i = 0; i < lines.length; i += 3) {
      this.bot.chat(lines.slice(i, i + 3).join(' | '));
    }
  }

  findItem(itemName) {
    const sources = this.findChestsWithItem(itemName);
    if (sources.length === 0) {
      this.bot.chat(`"${itemName}" not found in any catalogued chest.`);
      return;
    }

    this.bot.chat(`Found "${itemName}" in ${sources.length} chest(s):`);
    for (const data of sources) {
      const { x, y, z } = data.pos;
      this.bot.chat(`  [${x},${y},${z}] x${data.items[itemName]}`);
    }
  }

  clearData() {
    this.chestMap = {};
    this.saveData();
    this.bot.chat('Chest database cleared.');
  }
}

module.exports = StorageManager;
