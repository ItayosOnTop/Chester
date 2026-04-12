// combat.js — handles hostile mob detection and auto-attack
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
  }

  start() {
    // Run a combat scan every 500ms
    this.loopInterval = setInterval(() => this._tick(), 500)
    console.log('[Combat] Combat loop started')
  }

  stop() {
    if (this.loopInterval) {
      clearInterval(this.loopInterval)
      this.loopInterval = null
    }
  }

  enable() {
    this.enabled = true
    console.log('[Combat] Enabled')
  }

  disable() {
    this.enabled = false
    this.currentTarget = null
    console.log('[Combat] Disabled')
  }

  _isHostile(entity) {
    return this.hostileMobs.has(entity.name)
  }

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
    if (this.bot.pathfinder && this.bot.pathfinder.isMoving()) return // Don't interrupt navigation

    const target = this._nearestHostile()
    if (!target) {
      if (this.currentTarget) {
        console.log('[Combat] Target gone, standing down')
        this.currentTarget = null
      }
      return
    }

    if (this.currentTarget !== target) {
      console.log(`[Combat] Engaging ${target.name}`)
      this.currentTarget = target
    }

    const dist = this.bot.entity.position.distanceTo(target.position)

    // Equip the best available weapon before attacking
    await this._equipBestWeapon()

    if (dist <= this.attackRange) {
      // Face and strike
      await this.bot.lookAt(target.position.offset(0, target.height * 0.5, 0))
      this.bot.attack(target)
    } else {
      // Chase the mob
      const { goals } = require('mineflayer-pathfinder')
      try {
        await this.bot.pathfinder.goto(
          new (require('mineflayer-pathfinder').goals.GoalFollow)(target, this.attackRange - 0.5)
        )
      } catch (_) {
        // Pathfinding may throw if the goal is already satisfied — ignore
      }
    }
  }

  async _equipBestWeapon() {
    const weapons = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword', 'golden_sword']
    for (const weapon of weapons) {
      const item = this.bot.inventory.items().find(i => i.name === weapon)
      if (item) {
        if (this.bot.heldItem?.name !== weapon) {
          await this.bot.equip(item, 'hand')
        }
        return
      }
    }
    // Fall back to best axe
    const axes = ['netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe']
    for (const axe of axes) {
      const item = this.bot.inventory.items().find(i => i.name === axe)
      if (item) {
        if (this.bot.heldItem?.name !== axe) {
          await this.bot.equip(item, 'hand')
        }
        return
      }
    }
  }

  status() {
    const nearby = this._nearestHostile()
    if (!nearby) return `Combat: ON | No threats nearby (scanning ${this.scanRadius}m)`
    const dist = Math.round(this.bot.entity.position.distanceTo(nearby.position))
    return `Combat: ON | Engaging ${nearby.name} (${dist}m away)`
  }
}

module.exports = CombatManager
