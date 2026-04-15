const { goals, GoalBlock } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
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

  // ─── Movement ─────────────────────────────────────────────────────────────

  async goTo(pos) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    const currentPos = this.bot.entity.position;
    const dist = currentPos.distanceTo(vec);
    
    console.log(`[Pathfinder] Moving from ${currentPos.x.toFixed(1)},${currentPos.y.toFixed(1)},${currentPos.z.toFixed(1)} to ${vec.x},${vec.y},${vec.z} (distance: ${dist.toFixed(2)})`);
    
    // If already close, resolve immediately
    if (dist < 5) {
      console.log(`[Pathfinder] Already close enough (${dist.toFixed(2)} < 5)`);
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      try {
        const goal = new GoalBlock(vec.x, vec.y, vec.z);
        console.log(`[Pathfinder] Setting goal: ${vec.x},${vec.y},${vec.z}`);
        this.bot.pathfinder.setGoal(goal);
      } catch (e) {
        console.error(`[Pathfinder] Error setting goal:`, e.message);
        reject(new Error(`Failed to set goal: ${e.message}`));
        return;
      }

      let eventFired = false;
      const cleanup = () => {
        eventFired = true;
        this.bot.pathfinder.removeListener('goal_reached', onGoal);
        this.bot.pathfinder.removeListener('path_stop', onStop);
        clearTimeout(timeoutId);
      };

      const onGoal = () => {
        console.log(`[Pathfinder] goal_reached event fired`);
        cleanup();
        resolve();
      };

      const onStop = (reason) => {
        console.log(`[Pathfinder] path_stop event fired: ${reason}`);
        cleanup();
        const actualDist = this.bot.entity.position.distanceTo(vec);
        console.log(`[Pathfinder] Distance after stop: ${actualDist.toFixed(2)}`);
        if (actualDist < 5) resolve();
        else reject(new Error(`Cannot reach: ${reason} (dist: ${actualDist.toFixed(2)})`));
      };

      const timeoutId = setTimeout(() => {
        if (!eventFired) {
          console.log(`[Pathfinder] TIMEOUT - no events fired`);
          cleanup();
          const actualDist = this.bot.entity.position.distanceTo(vec);
          reject(new Error(`Path timeout (dist: ${actualDist.toFixed(2)})`));
        }
      }, 20000);

      console.log(`[Pathfinder] Waiting for events...`);
      this.bot.pathfinder.once('goal_reached', onGoal);
      this.bot.pathfinder.once('path_stop', onStop);
    });
  }

  async moveNearBlock(pos) {
    const base = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    const offsets = [
      new Vec3(1,0,0), new Vec3(-1,0,0),
      new Vec3(0,0,1), new Vec3(0,0,-1),
      new Vec3(0,1,0), new Vec3(0,-1,0),
      new Vec3(2,0,0), new Vec3(-2,0,0),
      new Vec3(0,0,2), new Vec3(0,0,-2)
    ];

    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i];
      try {
        const target = base.plus(off);
        await this.goTo(target);
        return;
      } catch (e) {
        if (i < offsets.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }
    throw new Error('Cannot reach chest');
  }

  // ─── Chest Interaction ────────────────────────────────────────────────────

  async openChestAt(pos) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    const block = this.bot.blockAt(vec);
    if (!block) throw new Error('Block not found at position');

    try {
      await this.moveNearBlock(vec);
    } catch (e) {
      throw new Error(`Cannot move to chest: ${e.message}`);
    }

    try {
      await this.bot.lookAt(vec.offset(0.5, 0.5, 0.5));
    } catch (e) {
      throw new Error(`Cannot look at chest: ${e.message}`);
    }

    try {
      return await this.bot.openChest(block);
    } catch (e) {
      throw new Error(`Cannot open chest: ${e.message}`);
    }
  }

  async closeChest(chest) {
    try { chest.close(); } catch {}
    await new Promise(r => setTimeout(r, 200));
  }

  // ─── Scanning ─────────────────────────────────────────────────────────────

  async scanArea(min, max) {
    min = new Vec3(min.x, min.y, min.z);
    max = new Vec3(max.x, max.y, max.z);

    const chestBlocks = [];

    for (let x = Math.min(min.x,max.x); x <= Math.max(min.x,max.x); x++) {
      for (let y = Math.min(min.y,max.y); y <= Math.max(min.y,max.y); y++) {
        for (let z = Math.min(min.z,max.z); z <= Math.max(min.z,max.z); z++) {
          const pos = new Vec3(x,y,z);
          const block = this.bot.blockAt(pos);
          if (!block) continue;
          if (!block.name.includes('chest') && !block.name.includes('barrel')) continue;

          chestBlocks.push(pos);
        }
      }
    }

    for (const pos of chestBlocks) {
      try {
        await this.scanChest(pos);
      } catch (e) {
        console.error(`[Storage] Chest scan error at ${pos.x},${pos.y},${pos.z}:`, e.message);
        this.bot.chat(`Failed chest ${pos.x},${pos.y},${pos.z}`);
      }
    }

    this.saveData();
    this.bot.chat('Scan done');
  }

  async scanChest(pos) {
    const vec = new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
    
    try {
      const chest = await this.openChestAt(vec);

      const items = {};
      for (const item of chest.items()) {
        items[item.name] = (items[item.name] || 0) + item.count;
      }

      await this.closeChest(chest);

      const key = this.posKey(vec);
      this.chestMap[key] = {
        pos: { x: vec.x, y: vec.y, z: vec.z },
        items
      };
    } catch (e) {
      throw new Error(`Failed to scan chest at ${vec.x},${vec.y},${vec.z}: ${e.message}`);
    }
  }
}

module.exports = StorageManager;
