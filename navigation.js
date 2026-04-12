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
      if (dist <= this.stopDistance) return
      try {
        // setGoal with dynamic=true — pathfinder updates the target every tick
        this.bot.pathfinder.setGoal(new goals.GoalFollow(target.entity, this.followDistance), true)
      } catch (_) {}
    }, 500)
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
    const player = this.bot.players[playerName]
    if (!player || !player.entity) {
      sendMessage(`Can't find "${playerName}".`)
      return
    }

    sendMessage(`On my way to ${playerName}...`)
    this.combatMgr?.lock()
    try {
      const pos = player.entity.position
      await this.bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, this.followDistance))
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
      await this.bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1))
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
    if (sendMessage) sendMessage('Stopped.')
  }

  isFollowing() { return this.followTarget !== null }

  status() {
    if (this.followTarget) return `Navigation: following ${this.followTarget}`
    return 'Navigation: idle'
  }
}

module.exports = NavigationManager
