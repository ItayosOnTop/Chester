// chestManager.js — handles all chest interaction logic
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')

class ChestManager {
  constructor(bot, config) {
    this.bot = bot
    this.config = config
    this.chests = config.chests
    this.defaultChest = config.defaultChest
    this.combatMgr = null // wired in from index.js

    // Build item → chest lookup
    this.itemMap = {}
    for (const chest of this.chests) {
      for (const item of chest.items) {
        this.itemMap[item] = chest.id
      }
    }
  }

  getChestForItem(itemName) {
    const chestId = this.itemMap[itemName] || this.defaultChest
    return this.chests.find(c => c.id === chestId) || null
  }

  findChestContaining(itemName) {
    return this.chests.find(c => c.items.includes(itemName)) || null
  }

  async navigateToChest(chestConfig) {
    const pos = chestConfig.position
    this.combatMgr?.lock()
    try {
      await this.bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 2))
    } finally {
      this.combatMgr?.release()
    }
  }

  async openChestAt(chestConfig) {
    const pos = new Vec3(chestConfig.position.x, chestConfig.position.y, chestConfig.position.z)
    const block = this.bot.blockAt(pos)
    if (!block || !block.name.includes('chest')) {
      throw new Error(`No chest at ${JSON.stringify(chestConfig.position)} (found: ${block ? block.name : 'nothing'})`)
    }
    return await this.bot.openChest(block)
  }

  // ─── Sort: deposit all inventory items into correct chests ────────────────
  async sortInventory(sendMessage) {
    sendMessage('Scanning inventory...')

    const plan = {}
    for (const item of this.bot.inventory.items()) {
      if (item.slot < 9) continue // skip armor slots
      const chest = this.getChestForItem(item.name)
      if (!chest) continue
      if (!plan[chest.id]) plan[chest.id] = { chest, items: [] }
      plan[chest.id].items.push(item)
    }

    if (Object.keys(plan).length === 0) {
      sendMessage('Nothing to sort!')
      return
    }

    for (const { chest, items } of Object.values(plan)) {
      sendMessage(`Going to ${chest.label}...`)
      try {
        await this.navigateToChest(chest)
        const window = await this.openChestAt(chest)
        for (const item of items) {
          try {
            await window.deposit(item.type, null, item.count)
            sendMessage(`  Deposited ${item.count}x ${item.name}`)
          } catch (e) {
            sendMessage(`  Could not deposit ${item.name}: ${e.message}`)
          }
        }
        await window.close()
        await this.bot.waitForTicks(10)
      } catch (e) {
        sendMessage(`Error at ${chest.label}: ${e.message}`)
      }
    }

    sendMessage('Sort complete!')
  }

  // ─── Fetch: pull a specific item from its chest ───────────────────────────
  async fetchItem(itemName, amount, sendMessage) {
    const chest = this.findChestContaining(itemName)
    if (!chest) {
      sendMessage(`I don't know which chest holds "${itemName}". Add it to chests.json!`)
      return false
    }

    sendMessage(`Fetching ${amount}x ${itemName} from ${chest.label}...`)
    try {
      await this.navigateToChest(chest)
      const window = await this.openChestAt(chest)
      const available = window.containerItems().filter(i => i.name === itemName)
      const total = available.reduce((s, i) => s + i.count, 0)

      if (total === 0) {
        sendMessage(`"${itemName}" is not in ${chest.label} right now.`)
        await window.close()
        return false
      }

      const toWithdraw = Math.min(amount, total)
      await window.withdraw(available[0].type, null, toWithdraw)
      await window.close()
      sendMessage(`Got ${toWithdraw}x ${itemName}!`)
      return true
    } catch (e) {
      sendMessage(`Failed to fetch ${itemName}: ${e.message}`)
      return false
    }
  }

  // ─── Collect: empty a named chest into inventory ──────────────────────────
  async collectFromChest(chestId, sendMessage) {
    const chest = this.chests.find(c => c.id === chestId)
    if (!chest) { sendMessage(`Unknown chest id: "${chestId}"`); return }

    sendMessage(`Collecting from ${chest.label}...`)
    try {
      await this.navigateToChest(chest)
      const window = await this.openChestAt(chest)
      const items = window.containerItems()
      if (items.length === 0) { sendMessage(`${chest.label} is empty.`); await window.close(); return }

      for (const item of items) {
        try { await window.withdraw(item.type, null, item.count) } catch (e) {
          sendMessage(`Could not take ${item.name}: ${e.message}`)
        }
      }
      await window.close()
      sendMessage(`Collected everything from ${chest.label}!`)
    } catch (e) {
      sendMessage(`Error accessing ${chest.label}: ${e.message}`)
    }
  }

  listChests(sendMessage) {
    sendMessage('=== Configured Chests ===')
    for (const chest of this.chests) {
      const preview = chest.items.length > 0
        ? chest.items.slice(0, 4).join(', ') + (chest.items.length > 4 ? '...' : '')
        : 'catch-all'
      sendMessage(`[${chest.id}] ${chest.label}: ${preview}`)
    }
  }
}

module.exports = ChestManager
