// navigation.js — follow, come, goto, and stop commands
const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

class NavigationManager {
  constructor(bot, config) {
    this.bot = bot
    this.config = config.navigation
    this.followTarget = null
    this.followInterval = null
    this.followDistance = this.config.followDistance || 3
    this.stopDistance = this.config.stopDistance || 2
  }

  // ─── Follow a player continuously ────────────────────────────────────────
  startFollow(playerName, sendMessage) {
    const player = this.bot.players[playerName]
    if (!player || !player.entity) {
      sendMessage(`Can't see "${playerName}" — are they nearby?`)
      return
    }

    this.stopFollow()
    this.followTarget = playerName
    sendMessage(`Now following ${playerName}. Say "!stop" to stop.`)

    this.followInterval = setInterval(async () => {
      const target = this.bot.players[this.followTarget]
      if (!target || !target.entity) return

      const dist = this.bot.entity.position.distanceTo(target.entity.position)
      if (dist <= this.stopDistance) return // Close enough — don't crowd

      try {
        const goal = new goals.GoalFollow(target.entity, this.followDistance)
        this.bot.pathfinder.setGoal(goal, true) // dynamic = true → updates each tick
      } catch (_) {}
    }, 1000)
  }

  stopFollow(sendMessage) {
    if (this.followInterval) {
      clearInterval(this.followInterval)
      this.followInterval = null
    }
    this.followTarget = null
    this.bot.pathfinder.stop()
    if (sendMessage) sendMessage('Stopped.')
  }

  // ─── Come: navigate to a specific player once ────────────────────────────
  async comeToPlayer(playerName, sendMessage) {
    const player = this.bot.players[playerName]
    if (!player || !player.entity) {
      sendMessage(`Can't find "${playerName}".`)
      return
    }

    sendMessage(`On my way to ${playerName}...`)
    try {
      const pos = player.entity.position
      const goal = new goals.GoalNear(pos.x, pos.y, pos.z, this.followDistance)
      await this.bot.pathfinder.goto(goal)
      sendMessage(`Arrived!`)
    } catch (e) {
      sendMessage(`Couldn't reach ${playerName}: ${e.message}`)
    }
  }

  // ─── GoTo: navigate to absolute coordinates ──────────────────────────────
  async gotoCoords(x, y, z, sendMessage) {
    sendMessage(`Navigating to ${x} ${y} ${z}...`)
    try {
      const goal = new goals.GoalNear(x, y, z, 1)
      await this.bot.pathfinder.goto(goal)
      sendMessage(`Arrived at ${x} ${y} ${z}!`)
    } catch (e) {
      sendMessage(`Couldn't reach destination: ${e.message}`)
    }
  }

  // ─── Stop all movement ───────────────────────────────────────────────────
  stop(sendMessage) {
    this.stopFollow()
    this.bot.pathfinder.stop()
    if (sendMessage) sendMessage('All movement stopped.')
  }

  isFollowing() {
    return this.followTarget !== null
  }

  status() {
    if (this.followTarget) return `Navigation: following ${this.followTarget}`
    return 'Navigation: idle'
  }
}

module.exports = NavigationManager
