// combat.js — handles hostile mob detection and auto-attack
const { goals } = require('mineflayer-pathfinder')

class CombatManager {
  constructor(bot, config) {
    this.bot = bot
    this.config = config.combat
    this.hostileMobs = new Set(this.config.hostileMobs)
    this.attackRange = this.config.attackRange || 3.5
    this.scanRadius = this.config.scanRadius || 16
    this.enabled = true
    this.currentTarget = null
    this.loopInterval = null
    // When true, combat will not touch pathfinder (navigation command running)
    this.navLock = false
  }

  start() {
    this.loopInterval = setInterval(() => this._tick(), 500)
    console.log('[Combat] Combat loop started')
  }

  stop() {
    if (this.loopInterval) {
      clearInterval(this.loopInterval)
      this.loopInterval = null
    }
  }

  enable()  { this.enabled = true;  this.currentTarget = null; console.log('[Combat] Enabled') }
  disable() { this.enabled = false; this.currentTarget = null; console.log('[Combat] Disabled') }

  // Call before a navigation command; call release() when done
  lock()    { this.navLock = true  }
  release() { this.navLock = false }

  _isHostile(entity) { return this.hostileMobs.has(entity.name) }

  _nearestHostile() {
    let nearest = null
    let nearestDist = Infinity
    for (const entity of Object.values(this.bot.entities)) {
      if (!this._isHostile(entity)) continue
      const dist = this.bot.entity.position.distanceTo(entity.position)
      if (dist < this.scanRadius && dist < nearestDist) {
        nearest = entity
        nearestDist = dist
      }
    }
    return nearest
  }

  async _tick() {
    if (!this.enabled) return
    if (this.navLock) return  // navigation command in progress — hands off pathfinder

    const target = this._nearestHostile()
    if (!target) {
      if (this.currentTarget) {
        console.log('[Combat] Target gone, standing down')
        this.currentTarget = null
        this.bot.pathfinder.setGoal(null)
        this.bot.movement.stop() // Stop movement when no target
      }
      return
    }

    if (this.currentTarget !== target) {
      console.log(`[Combat] Engaging ${target.name}`)
      this.currentTarget = target
    }

    const dist = this.bot.entity.position.distanceTo(target.position)
    await this._equipBestWeapon()

    if (dist <= this.attackRange) {
      await this.bot.lookAt(target.position.offset(0, target.height * 0.5, 0))
      this.bot.attack(target)
    } else {
      // Chase — use setGoal (non-blocking) so we don't await and block the tick
      try {
        this.bot.pathfinder.setGoal(new goals.GoalFollow(target, this.attackRange - 0.5), true)
        // Sprint when chasing enemies for more aggressive combat
        this.bot.movement.setMovement('sprint')
      } catch (_) {}
    }
  }

  async _equipBestWeapon() {
    const weapons = [
      'netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword', 'golden_sword',
      'netherite_spear', 'diamond_spear', 'iron_spear', 'copper_spear', 'stone_spear', 'wooden_spear',
    ]
    for (const weapon of weapons) {
      const item = this.bot.inventory.items().find(i => i.name === weapon)
      if (item) {
        if (this.bot.heldItem?.name !== weapon) {
          try { await this.bot.equip(item, 'hand') } catch (_) {}
        }
        return
      }
    }
    const axes = ['netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe']
    for (const axe of axes) {
      const item = this.bot.inventory.items().find(i => i.name === axe)
      if (item) {
        if (this.bot.heldItem?.name !== axe) {
          try { await this.bot.equip(item, 'hand') } catch (_) {}
        }
        return
      }
    }
  }

  status() {
    const nearby = this._nearestHostile()
    if (!nearby) return `Combat: ${this.enabled ? 'ON' : 'OFF'} | No threats nearby (scanning ${this.scanRadius}m)`
    const dist = Math.round(this.bot.entity.position.distanceTo(nearby.position))
    return `Combat: ON | Engaging ${nearby.name} (${dist}m away)`
  }
}

module.exports = CombatManager
