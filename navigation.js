// navigation.js — follow, come, goto, and stop commands
const { goals } = require('mineflayer-pathfinder')

class NavigationManager {
  constructor(bot, config) {
    this.bot = bot
    this.config = config.navigation
    this.followTarget = null
    this.followInterval = null
    this.followDistance = this.config.followDistance || 3
    this.stopDistance  = this.config.stopDistance  || 2
    this.combatMgr = null // set from index.js after both are created

    // Configure movement for more realistic behavior
    this.bot.movement.setOptions({
      canOpenDoors: true,
      canDig: false,
      canPlaceBlocks: false,
      canAttack: false,
      movementType: 'walk' // Use walking for more natural movement
    })
  }

  // ─── Follow a player continuously ─────────────────────────────────────────
  startFollow(playerName, sendMessage) {
    const player = this.bot.players[playerName]
    if (!player || !player.entity) {
      sendMessage(`Can't see "${playerName}" — are they nearby?`)
      return
    }

    this.stopFollow()
    this.followTarget = playerName
    sendMessage(`Now following ${playerName}. Say !stop to stop.`)

    this.followInterval = setInterval(() => {
      const target = this.bot.players[this.followTarget]
      if (!target || !target.entity) return
      const dist = this.bot.entity.position.distanceTo(target.entity.position)
      if (dist <= this.stopDistance) {
        // Stop moving when close enough
        this.bot.movement.stop()
        return
      }

      try {
        // Use GoalFollow with dynamic=true for smooth following
        // Increased follow distance slightly for better pathfinding
        this.bot.pathfinder.setGoal(new goals.GoalFollow(target.entity, this.followDistance + 1), true)

        // Set movement type based on distance
        if (dist > 10) {
          this.bot.movement.setMovement('sprint') // Sprint when far
        } else {
          this.bot.movement.setMovement('walk') // Walk when closer
        }
      } catch (_) {}
    }, 200) // Reduced interval for more responsive following
  }

  stopFollow(sendMessage) {
    if (this.followInterval) {
      clearInterval(this.followInterval)
      this.followInterval = null
    }
    this.followTarget = null
    this.bot.pathfinder.setGoal(null)
    this.bot.movement.stop() // Stop movement
    if (sendMessage) sendMessage('Stopped.')
  }

  // ─── Come to player once ───────────────────────────────────────────────────
  async comeToPlayer(playerName, sendMessage) {
    const player = this.bot.players[playerName]
    if (!player || !player.entity) {
      sendMessage(`Can't find "${playerName}".`)
      return
    }

    sendMessage(`On my way to ${playerName}...`)
    this.combatMgr?.lock()
    try {
      const pos = player.entity.position
      // Set walking movement for navigation
      this.bot.movement.setMovement('walk')
      // Use GoalNearXZ for horizontal positioning, allowing any Y level
      await this.bot.pathfinder.goto(new goals.GoalNearXZ(pos.x, pos.z, this.followDistance))
      this.bot.movement.stop()
      sendMessage(`Arrived!`)
    } catch (e) {
      if (!e.message?.includes('Stopped')) {
        sendMessage(`Couldn't reach ${playerName}: ${e.message}`)
      }
    } finally {
      this.combatMgr?.release()
    }
  }

  // ─── Go to coordinates ─────────────────────────────────────────────────────
  async gotoCoords(x, y, z, sendMessage) {
    sendMessage(`Navigating to ${x} ${y} ${z}...`)
    this.combatMgr?.lock()
    try {
      // Set walking movement for navigation
      this.bot.movement.setMovement('walk')
      // Use GoalBlock for precise positioning at exact coordinates
      await this.bot.pathfinder.goto(new goals.GoalBlock(x, y, z))
      this.bot.movement.stop()
      sendMessage(`Arrived at ${x} ${y} ${z}!`)
    } catch (e) {
      if (!e.message?.includes('Stopped')) {
        sendMessage(`Couldn't reach destination: ${e.message}`)
      }
    } finally {
      this.combatMgr?.release()
    }
  }

  // ─── Stop all movement ─────────────────────────────────────────────────────
  stop(sendMessage) {
    this.stopFollow()
    this.combatMgr?.release()
    this.bot.pathfinder.setGoal(null)
    this.bot.movement.stop()
    if (sendMessage) sendMessage('Stopped.')
  }

  isFollowing() { return this.followTarget !== null }

  status() {
    if (this.followTarget) return `Navigation: following ${this.followTarget}`
    return 'Navigation: idle'
  }
}

module.exports = NavigationManager// navigation.js — follow, come, goto, and stop commands
const { goals } = require('mineflayer-pathfinder')

class NavigationManager {
  constructor(bot, config) {
    this.bot = bot
    this.config = config.navigation
    this.followTarget = null
    this.followInterval = null
    this.followDistance = this.config.followDistance || 3
    this.stopDistance  = this.config.stopDistance  || 2
    this.combatMgr = null // set from index.js after both are created

    // Configure movement for more realistic behavior
    this.bot.movement.setOptions({
      canOpenDoors: true,
      canDig: false,
      canPlaceBlocks: false,
      canAttack: false,
      movementType: 'walk' // Use walking for more natural movement
    })
  }

  // ─── Follow a player continuously ─────────────────────────────────────────
  startFollow(playerName, sendMessage) {
    const player = this.bot.players[playerName]
    if (!player || !player.entity) {
      sendMessage(`Can't see "${playerName}" — are they nearby?`)
      return
    }

    this.stopFollow()
    this.followTarget = playerName
    sendMessage(`Now following ${playerName}. Say !stop to stop.`)

    this.followInterval = setInterval(() => {
      const target = this.bot.players[this.followTarget]
      if (!target || !target.entity) return
      const dist = this.bot.entity.position.distanceTo(target.entity.position)
      if (dist <= this.stopDistance) {
        // Stop moving when close enough
        this.bot.movement.stop()
        return
      }

      try {
        // Use GoalFollow with dynamic=true for smooth following
        // Increased follow distance slightly for better pathfinding
        this.bot.pathfinder.setGoal(new goals.GoalFollow(target.entity, this.followDistance + 1), true)

        // Set movement type based on distance
        if (dist > 10) {
          this.bot.movement.setMovement('sprint') // Sprint when far
        } else {
          this.bot.movement.setMovement('walk') // Walk when closer
        }
      } catch (_) {}
    }, 200) // Reduced interval for more responsive following
  }

  stopFollow(sendMessage) {
    if (this.followInterval) {
      clearInterval(this.followInterval)
      this.followInterval = null
    }
    this.followTarget = null
    this.bot.pathfinder.setGoal(null)
    this.bot.movement.stop() // Stop movement
    if (sendMessage) sendMessage('Stopped.')
  }

  // ─── Come to player once ───────────────────────────────────────────────────
  async comeToPlayer(playerName, sendMessage) {
    const player = this.bot.players[playerName]
    if (!player || !player.entity) {
      sendMessage(`Can't find "${playerName}".`)
      return
    }

    sendMessage(`On my way to ${playerName}...`)
    this.combatMgr?.lock()
    try {
      const pos = player.entity.position
      // Set walking movement for navigation
      this.bot.movement.setMovement('walk')
      // Use GoalNearXZ for horizontal positioning, allowing any Y level
      await this.bot.pathfinder.goto(new goals.GoalNearXZ(pos.x, pos.z, this.followDistance))
      this.bot.movement.stop()
      sendMessage(`Arrived!`)
    } catch (e) {
      if (!e.message?.includes('Stopped')) {
        sendMessage(`Couldn't reach ${playerName}: ${e.message}`)
      }
    } finally {
      this.combatMgr?.release()
    }
  }

  // ─── Go to coordinates ─────────────────────────────────────────────────────
  async gotoCoords(x, y, z, sendMessage) {
    sendMessage(`Navigating to ${x} ${y} ${z}...`)
    this.combatMgr?.lock()
    try {
      // Set walking movement for navigation
      this.bot.movement.setMovement('walk')
      // Use GoalBlock for precise positioning at exact coordinates
      await this.bot.pathfinder.goto(new goals.GoalBlock(x, y, z))
      this.bot.movement.stop()
      sendMessage(`Arrived at ${x} ${y} ${z}!`)
    } catch (e) {
      if (!e.message?.includes('Stopped')) {
        sendMessage(`Couldn't reach destination: ${e.message}`)
      }
    } finally {
      this.combatMgr?.release()
    }
  }

  // ─── Stop all movement ─────────────────────────────────────────────────────
  stop(sendMessage) {
    this.stopFollow()
    this.combatMgr?.release()
    this.bot.pathfinder.setGoal(null)
    this.bot.movement.stop()
    if (sendMessage) sendMessage('Stopped.')
  }

  isFollowing() { return this.followTarget !== null }

  status() {
    if (this.followTarget) return `Navigation: following ${this.followTarget}`
    return 'Navigation: idle'
  }
}

module.exports = NavigationManager
