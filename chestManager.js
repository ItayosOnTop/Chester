// chestManager.js — handles all chest interaction logic
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')

class ChestManager {
  constructor(bot, config) {
    this.bot = bot
    this.config = config
    this.chests = config.chests
    this.defaultChest = config.defaultChest
    // Build a quick item → chest lookup
    this.itemMap = {}
    for (const chest of this.chests) {
      for (const item of chest.items) {
        this.itemMap[item] = chest.id
      }
    }
  }

  // Find which configured chest an item belongs to
  getChestForItem(itemName) {
    const chestId = this.itemMap[itemName] || this.defaultChest
    return this.chests.find(c => c.id === chestId) || null
  }

  // Find which configured chest holds a specific item (for fetching)
  findChestContaining(itemName) {
    // First check the config mapping
    const configChest = this.chests.find(c => c.items.includes(itemName))
    return configChest || null
  }

  // Navigate close enough to interact with a chest
  async navigateToChest(chestConfig) {
    const pos = new Vec3(chestConfig.position.x, chestConfig.position.y, chestConfig.position.z)
    const goal = new goals.GoalNear(pos.x, pos.y, pos.z, 2)
    await this.bot.pathfinder.goto(goal)
  }

  // Open a chest block and return the mineflayer chest window
  async openChestAt(chestConfig) {
    const pos = new Vec3(chestConfig.position.x, chestConfig.position.y, chestConfig.position.z)
    const block = this.bot.blockAt(pos)
    if (!block || !block.name.includes('chest')) {
      throw new Error(`No chest found at ${JSON.stringify(chestConfig.position)} (found: ${block ? block.name : 'nothing'})`)
    }
    return await this.bot.openChest(block)
  }

  // ─── Sort: deposit all inventory items into their correct chests ─────────
  async sortInventory(sendMessage) {
    sendMessage('Starting sort — scanning inventory...')

    // Group items by destination chest
    const plan = {} // chestId → [inventoryItem, ...]
    for (const item of this.bot.inventory.items()) {
      // Skip currently worn armor
      if (item.slot < 9) continue
      const chest = this.getChestForItem(item.name)
      if (!chest) continue
      if (!plan[chest.id]) plan[chest.id] = { chest, items: [] }
      plan[chest.id].items.push(item)
    }

    if (Object.keys(plan).length === 0) {
      sendMessage('Nothing to sort — inventory is clean!')
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
            sendMessage(`  Deposited ${item.count}× ${item.name}`)
          } catch (e) {
            sendMessage(`  Could not deposit ${item.name}: ${e.message}`)
          }
        }

        await window.close()
        // Small delay so the server doesn't rate-limit us
        await this.bot.waitForTicks(10)
      } catch (e) {
        sendMessage(`Error at ${chest.label}: ${e.message}`)
      }
    }

    sendMessage('Sort complete!')
  }

  // ─── Fetch: pull a specific item from its chest ──────────────────────────
  async fetchItem(itemName, amount, sendMessage) {
    const chest = this.findChestContaining(itemName)
    if (!chest) {
      sendMessage(`I don't know which chest holds "${itemName}". Add it to chests.json!`)
      return false
    }

    sendMessage(`Fetching ${amount}× ${itemName} from ${chest.label}...`)

    try {
      await this.navigateToChest(chest)
      const window = await this.openChestAt(chest)

      // Check how many are available
      const available = window.containerItems().filter(i => i.name === itemName)
      const totalAvailable = available.reduce((sum, i) => sum + i.count, 0)

      if (totalAvailable === 0) {
        sendMessage(`"${itemName}" is not in ${chest.label} right now.`)
        await window.close()
        return false
      }

      const toWithdraw = Math.min(amount, totalAvailable)
      await window.withdraw(available[0].type, null, toWithdraw)
      await window.close()

      sendMessage(`Got ${toWithdraw}× ${itemName}!`)
      return true
    } catch (e) {
      sendMessage(`Failed to fetch ${itemName}: ${e.message}`)
      return false
    }
  }

  // ─── Collect: pick up all items from a named chest ───────────────────────
  async collectFromChest(chestId, sendMessage) {
    const chest = this.chests.find(c => c.id === chestId)
    if (!chest) {
      sendMessage(`Unknown chest id: "${chestId}"`)
      return
    }

    sendMessage(`Collecting all items from ${chest.label}...`)

    try {
      await this.navigateToChest(chest)
      const window = await this.openChestAt(chest)

      const items = window.containerItems()
      if (items.length === 0) {
        sendMessage(`${chest.label} is empty.`)
        await window.close()
        return
      }

      for (const item of items) {
        try {
          await window.withdraw(item.type, null, item.count)
        } catch (e) {
          sendMessage(`Could not take ${item.name}: ${e.message}`)
        }
      }

      await window.close()
      sendMessage(`Collected everything from ${chest.label}!`)
    } catch (e) {
      sendMessage(`Error accessing ${chest.label}: ${e.message}`)
    }
  }

  // List all configured chests and their item categories
  listChests(sendMessage) {
    sendMessage('=== Configured Chests ===')
    for (const chest of this.chests) {
      const items = chest.items.length > 0
        ? chest.items.slice(0, 4).join(', ') + (chest.items.length > 4 ? '...' : '')
        : 'catch-all'
      sendMessage(`[${chest.id}] ${chest.label}: ${items}`)
    }
  }
}

module.exports = ChestManager
