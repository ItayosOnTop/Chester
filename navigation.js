// navigation.js — follow, come, goto, and stop commands
const { goals } = require('mineflayer-pathfinder')

class NavigationManager {
  constructor(bot, config) {
    this.bot = bot
    this.config = config.navigation
    this.followTarget = null
    this.followInterval = null
    this.isNavigating = false
    this.followDistance = this.config.followDistance || 3
    this.stopDistance  = this.config.stopDistance  || 2
    this.combatMgr = null // set from index.js after both are created
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

      // Check if bot is floating
      const blockBelow = this.bot.blockAt(this.bot.entity.position.offset(0, -1, 0))
      if (!blockBelow || blockBelow.name === 'air') {
        // Bot is floating, clear goals to let it fall
        this.bot.pathfinder.setGoal(null)
        return
      }

      const dist = this.bot.entity.position.distanceTo(target.entity.position)
      if (dist <= this.stopDistance) {
        // Stop moving when close enough
        this.bot.pathfinder.setGoal(null)
        return
      }

      try {
        // Use GoalFollow with dynamic=true for smooth following
        // Increased follow distance slightly for better pathfinding
        this.bot.pathfinder.setGoal(new goals.GoalFollow(target.entity, this.followDistance + 1), true)
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
    if (sendMessage) sendMessage('Stopped.')
  }

  // ─── Come to player once ───────────────────────────────────────────────────
  async comeToPlayer(playerName, sendMessage) {
    // Check if already navigating
    if (this.isNavigating) {
      sendMessage('Already navigating! Use !stop first.')
      return
    }

    const player = this.bot.players[playerName]
    if (!player || !player.entity) {
      sendMessage(`Can't find "${playerName}".`)
      return
    }

    this.isNavigating = true
    sendMessage(`On my way to ${playerName}...`)
    this.combatMgr?.lock()
    try {
      const pos = player.entity.position
      // Clear any existing goals first
      this.bot.pathfinder.setGoal(null)

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Navigation timeout')), 30000)
      )

      // Use GoalNearXZ for horizontal positioning, allowing any Y level
      await Promise.race([
        this.bot.pathfinder.goto(new goals.GoalNearXZ(pos.x, pos.z, this.followDistance)),
        timeoutPromise
      ])
      sendMessage(`Arrived!`)
    } catch (e) {
      console.log(`[Navigation] Come to player failed: ${e.message}`)
      // Clear goals on failure
      this.bot.pathfinder.setGoal(null)
      if (!e.message?.includes('Stopped')) {
        sendMessage(`Couldn't reach ${playerName}: ${e.message}`)
      }
    } finally {
      this.isNavigating = false
      this.combatMgr?.release()
    }
  }

  // ─── Go to coordinates ─────────────────────────────────────────────────────
  async gotoCoords(x, y, z, sendMessage) {
    // Check if already navigating
    if (this.isNavigating) {
      sendMessage('Already navigating! Use !stop first.')
      return
    }

    this.isNavigating = true
    sendMessage(`Navigating to ${x} ${y} ${z}...`)
    this.combatMgr?.lock()
    try {
      // Validate coordinates
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        throw new Error('Invalid coordinates')
      }

      // Clear any existing goals first
      this.bot.pathfinder.setGoal(null)

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Navigation timeout')), 30000)
      )

      // Use GoalNear for more flexible positioning (within 2 blocks of target)
      await Promise.race([
        this.bot.pathfinder.goto(new goals.GoalNear(x, y, z, 2)),
        timeoutPromise
      ])
      sendMessage(`Arrived near ${x} ${y} ${z}!`)
    } catch (e) {
      console.log(`[Navigation] Goto failed: ${e.message}`)
      // Clear goals on failure
      this.bot.pathfinder.setGoal(null)
      if (!e.message?.includes('Stopped')) {
        sendMessage(`Couldn't reach destination: ${e.message}`)
      }
    } finally {
      this.isNavigating = false
      this.combatMgr?.release()
    }
  }

  // ─── Stop all movement ─────────────────────────────────────────────────────
  stop(sendMessage) {
    this.stopFollow()
    this.isNavigating = false
    this.combatMgr?.release()
    this.bot.pathfinder.setGoal(null)
    if (sendMessage) sendMessage('Stopped.')
  }

  // ─── Force clear all goals ─────────────────────────────────────────────────
  clearGoals() {
    this.bot.pathfinder.setGoal(null)
  }

  isFollowing() { return this.followTarget !== null }

  status() {
    if (this.followTarget) return `Navigation: following ${this.followTarget}`
    return 'Navigation: idle'
  }
}

module.exports = NavigationManager