// index.js — Minecraft 1.21.11 storage & utility bot
const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const armorManager = require('mineflayer-armor-manager')
const autoEat = require('mineflayer-auto-eat')
const config = require('./chests.json')
const ChestManager = require('./chestManager')
const CombatManager = require('./combat')
const NavigationManager = require('./navigation')

// ─── Bot connection settings ─────────────────────────────────────────────────
// Edit these or use environment variables
const BOT_OPTIONS = {
  host: process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT || '8272'),
  username: process.env.MC_USERNAME || 'Chester',
  version: '1.21.11',
  auth: process.env.MC_AUTH || 'offline', // use 'microsoft' for online-mode servers
}

console.log(`Connecting to ${BOT_OPTIONS.host}:${BOT_OPTIONS.port} as ${BOT_OPTIONS.username}`)

const bot = mineflayer.createBot(BOT_OPTIONS)

// Load plugins
bot.loadPlugin(pathfinder)
bot.loadPlugin(armorManager)
bot.loadPlugin(autoEat)

// Module instances (created once bot is ready)
let chestMgr, combatMgr, navMgr

// ─── Bot ready ───────────────────────────────────────────────────────────────
bot.once('spawn', () => {
  console.log('[Bot] Spawned!')

  // Configure pathfinder movements
  const mcData = require('minecraft-data')(bot.version)
  const movements = new Movements(bot, mcData)
  movements.allowSprinting = true
  movements.canDig = false // don't break blocks during navigation
  bot.pathfinder.setMovements(movements)

  // Configure auto-eat
  bot.autoEat.options = {
    priority: 'foodPoints',
    startAt: 14, // eat when hunger drops to 14 (out of 20)
    bannedFood: [],
  }
  bot.autoEat.enable()

  // Configure armor manager (auto-equips best armor automatically)
  // mineflayer-armor-manager handles this passively once loaded

  // Init modules
  chestMgr = new ChestManager(bot, config)
  combatMgr = new CombatManager(bot, config)
  navMgr = new NavigationManager(bot, config)

  // Start combat loop
  combatMgr.start()

  bot.chat('Storage bot online! Type !help for commands.')
})

// ─── Chat command handler ─────────────────────────────────────────────────────
bot.on('chat', async (username, message) => {
  if (username === bot.username) return
  const args = message.trim().split(/\s+/)
  const cmd = args[0].toLowerCase()

  // Helper: respond to the same chat channel
  const say = (text) => bot.chat(text)

  // ─── Help ──────────────────────────────────────────────────────────────────
  if (cmd === '!help') {
    say('=== Storage Bot Commands ===')
    say('!sort — deposit all inventory items to their chests')
    say('!fetch <item> [amount] — get an item from its chest')
    say('!collect <chest_id> — empty a chest into my inventory')
    say('!chests — list all configured chests')
    say('!follow <player> — follow a player')
    say('!come <player> — come to a player once')
    say('!goto <x> <y> <z> — navigate to coords')
    say('!stop — stop moving')
    say('!combat on|off — toggle combat mode')
    say('!status — show current status')
    say('!inv — list my inventory')
    return
  }

  // ─── Sort inventory ────────────────────────────────────────────────────────
  if (cmd === '!sort') {
    navMgr.stop()
    await chestMgr.sortInventory(say)
    return
  }

  // ─── Fetch item ────────────────────────────────────────────────────────────
  if (cmd === '!fetch') {
    if (!args[1]) { say('Usage: !fetch <item_name> [amount]'); return }
    navMgr.stop()
    const itemName = args[1].toLowerCase()
    const amount = parseInt(args[2] || '64')
    await chestMgr.fetchItem(itemName, amount, say)
    return
  }

  // ─── Collect from chest ────────────────────────────────────────────────────
  if (cmd === '!collect') {
    if (!args[1]) { say('Usage: !collect <chest_id>'); return }
    navMgr.stop()
    await chestMgr.collectFromChest(args[1], say)
    return
  }

  // ─── List chests ───────────────────────────────────────────────────────────
  if (cmd === '!chests') {
    chestMgr.listChests(say)
    return
  }

  // ─── Follow player ─────────────────────────────────────────────────────────
  if (cmd === '!follow') {
    const target = args[1] || username
    navMgr.startFollow(target, say)
    return
  }

  // ─── Come to player ────────────────────────────────────────────────────────
  if (cmd === '!come') {
    const target = args[1] || username
    await navMgr.comeToPlayer(target, say)
    return
  }

  // ─── GoTo coords ──────────────────────────────────────────────────────────
  if (cmd === '!goto') {
    const [, x, y, z] = args
    if (!x || !y || !z || isNaN(x) || isNaN(y) || isNaN(z)) {
      say('Usage: !goto <x> <y> <z>'); return
    }
    await navMgr.gotoCoords(parseFloat(x), parseFloat(y), parseFloat(z), say)
    return
  }

  // ─── Stop movement ─────────────────────────────────────────────────────────
  if (cmd === '!stop') {
    navMgr.stop(say)
    return
  }

  // ─── Combat toggle ─────────────────────────────────────────────────────────
  if (cmd === '!combat') {
    if (args[1] === 'off') { combatMgr.disable(); say('Combat disabled.') }
    else if (args[1] === 'on') { combatMgr.enable(); say('Combat enabled.') }
    else say(`Combat is currently ${combatMgr.enabled ? 'ON' : 'OFF'}`)
    return
  }

  // ─── Status ───────────────────────────────────────────────────────────────
  if (cmd === '!status') {
    const hp = Math.round(bot.health)
    const food = Math.round(bot.food)
    say(`HP: ${hp}/20 | Food: ${food}/20`)
    say(navMgr.status())
    say(combatMgr.status())
    return
  }

  // ─── Inventory ────────────────────────────────────────────────────────────
  if (cmd === '!inv') {
    const items = bot.inventory.items()
    if (items.length === 0) { say('Inventory is empty.'); return }
    // Group by name
    const groups = {}
    for (const item of items) {
      groups[item.name] = (groups[item.name] || 0) + item.count
    }
    say('Inventory: ' + Object.entries(groups).map(([n, c]) => `${c}× ${n}`).join(', '))
    return
  }
})

// ─── Events ──────────────────────────────────────────────────────────────────
bot.on('health', () => {
  if (bot.health < 4) {
    bot.chat('Low health! Retreating...')
    combatMgr.disable()
    navMgr.stop()
    // Re-enable combat after a brief recovery window
    setTimeout(() => {
      if (bot.health > 8) combatMgr.enable()
    }, 10000)
  }
})

bot.on('death', () => {
  console.log('[Bot] Died — respawning')
  bot.chat('I died!')
  combatMgr.disable()
  navMgr.stop()
  // Re-enable after respawn settling time
  setTimeout(() => combatMgr.enable(), 5000)
})

bot.on('kicked', (reason) => console.log('[Bot] Kicked:', reason))
bot.on('error', (err) => console.error('[Bot] Error:', err.message))

bot.on('autoeat_started', () => console.log('[AutoEat] Eating...'))
bot.on('autoeat_stopped', () => console.log('[AutoEat] Done eating'))

bot.on('playerCollect', (collector, itemDrop) => {
  if (collector.username === bot.username) {
    console.log(`[Bot] Picked up ${itemDrop.metadata?.[8]?.present ? 'item' : 'something'}`)
  }
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...')
  combatMgr.stop()
  navMgr.stop()
  bot.quit('Bot shutting down')
  process.exit(0)
})
