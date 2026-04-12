// index.js — Minecraft 1.21.11 storage & utility bot
const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const readline = require('readline')
const config = require('./chests.json')
const ChestManager = require('./chestManager')
const CombatManager = require('./combat')
const NavigationManager = require('./navigation')

// ─── Bot connection settings ──────────────────────────────────────────────────
const BOT_OPTIONS = {
  host: process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT || '25565'),
  username: process.env.MC_USERNAME || 'StorageBot',
  version: '1.21.11',
  auth: process.env.MC_AUTH || 'offline',
}

// Player to /msg when replying to terminal commands
const TERMINAL_TARGET = 'ItayosOnTop'

console.log(`Connecting to ${BOT_OPTIONS.host}:${BOT_OPTIONS.port} as ${BOT_OPTIONS.username}`)

const bot = mineflayer.createBot(BOT_OPTIONS)
bot.loadPlugin(pathfinder)

let chestMgr, combatMgr, navMgr

// ─── Armor priority ───────────────────────────────────────────────────────────
const ARMOR_PRIORITY = {
  head:  ['netherite_helmet','diamond_helmet','iron_helmet','golden_helmet','chainmail_helmet','leather_helmet'],
  torso: ['netherite_chestplate','diamond_chestplate','iron_chestplate','golden_chestplate','chainmail_chestplate','leather_chestplate'],
  legs:  ['netherite_leggings','diamond_leggings','iron_leggings','golden_leggings','chainmail_leggings','leather_leggings'],
  feet:  ['netherite_boots','diamond_boots','iron_boots','golden_boots','chainmail_boots','leather_boots'],
}

const FOOD_PRIORITY = [
  'cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken',
  'cooked_salmon','cooked_cod','bread','baked_potato','carrot','apple',
]

async function manageArmor() {
  for (const [slot, priority] of Object.entries(ARMOR_PRIORITY)) {
    for (const armorName of priority) {
      const item = bot.inventory.items().find(i => i.name === armorName)
      if (item) {
        try { await bot.equip(item, slot) } catch (_) {}
        break
      }
    }
  }
}

let isEating = false
async function autoEat() {
  if (isEating || bot.food >= 16) return
  isEating = true
  for (const foodName of FOOD_PRIORITY) {
    const food = bot.inventory.items().find(i => i.name === foodName)
    if (food) {
      try {
        await bot.equip(food, 'hand')
        await bot.consume()
        console.log(`[AutoEat] Ate ${foodName}`)
      } catch (_) {}
      break
    }
  }
  isEating = false
}

// ─── Unified command handler ──────────────────────────────────────────────────
async function handleCommand(cmd, args, say) {
  switch (cmd) {
    case '!help':
      say('=== Storage Bot Commands ===')
      say('!sort — deposit inventory into correct chests')
      say('!fetch <item> [amount] — get item from its chest')
      say('!collect <chest_id> — empty a chest into my inventory')
      say('!chests — list configured chests')
      say('!follow [player] — follow a player')
      say('!come [player] — navigate to a player once')
      say('!goto <x> <y> <z> — navigate to coords')
      say('!stop — stop current movement')
      say('!combat on|off — toggle combat')
      say('!armor — equip best armor now')
      say('!status — show HP, food, nav, combat status')
      say('!inv — list inventory')
      break

    case '!sort':
      navMgr.stop()
      await chestMgr.sortInventory(say)
      break

    case '!fetch':
      if (!args[0]) { say('Usage: !fetch <item_name> [amount]'); break }
      navMgr.stop()
      await chestMgr.fetchItem(args[0].toLowerCase(), parseInt(args[1] || '64'), say)
      break

    case '!collect':
      if (!args[0]) { say('Usage: !collect <chest_id>'); break }
      navMgr.stop()
      await chestMgr.collectFromChest(args[0], say)
      break

    case '!chests':
      chestMgr.listChests(say)
      break

    case '!follow':
      navMgr.startFollow(args[0] || TERMINAL_TARGET, say)
      break

    case '!come':
      await navMgr.comeToPlayer(args[0] || TERMINAL_TARGET, say)
      break

    case '!goto': {
      const [x, y, z] = args
      if (!x || !y || !z || isNaN(x) || isNaN(y) || isNaN(z)) {
        say('Usage: !goto <x> <y> <z>'); break
      }
      await navMgr.gotoCoords(parseFloat(x), parseFloat(y), parseFloat(z), say)
      break
    }

    case '!stop':
      navMgr.stop(say)
      break

    case '!combat':
      if (args[0] === 'off') { combatMgr.disable(); say('Combat disabled.') }
      else if (args[0] === 'on') { combatMgr.enable(); say('Combat enabled.') }
      else say(`Combat is currently ${combatMgr.enabled ? 'ON' : 'OFF'}`)
      break

    case '!armor':
      await manageArmor()
      say('Armor updated!')
      break

    case '!status':
      say(`HP: ${Math.round(bot.health)}/20 | Food: ${Math.round(bot.food)}/20`)
      say(navMgr.status())
      say(combatMgr.status())
      break

    case '!inv': {
      const items = bot.inventory.items()
      if (items.length === 0) { say('Inventory is empty.'); break }
      const groups = {}
      for (const item of items) groups[item.name] = (groups[item.name] || 0) + item.count
      say('Inventory: ' + Object.entries(groups).map(([n, c]) => `${c}x ${n}`).join(', '))
      break
    }

    default:
      say(`Unknown command: ${cmd}. Type !help for list.`)
  }
}

// ─── Spawn ────────────────────────────────────────────────────────────────────
bot.once('spawn', () => {
  console.log('[Bot] Spawned! Type commands in terminal (e.g. !help)')

  const mcData = require('minecraft-data')(bot.version)
  const movements = new Movements(bot, mcData)
  movements.allowSprinting = true
  movements.canDig = false
  movements.maxDropDown = 256 // allow falling any distance
  bot.pathfinder.setMovements(movements)

  chestMgr = new ChestManager(bot, config)
  combatMgr = new CombatManager(bot, config)
  navMgr = new NavigationManager(bot, config)

  // Wire combat manager into nav and chest so they can lock it during navigation
  navMgr.combatMgr = combatMgr
  chestMgr.combatMgr = combatMgr

  // When bot has no active goal and is in the air, clear pathfinder so native gravity applies
  bot.on('physicsTick', () => {
    if (!bot.entity) return
    if (!bot.entity.onGround && !bot.pathfinder.isMoving()) {
      bot.pathfinder.setGoal(null)
    }
  })

  combatMgr.start()
  setTimeout(manageArmor, 2000)

  bot.chat('Storage bot online! Type !help for commands.')
  setupTerminal()
})

// ─── Terminal input ───────────────────────────────────────────────────────────
function setupTerminal() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' })
  rl.prompt()

  rl.on('line', async (line) => {
    const trimmed = line.trim()
    if (!trimmed) { rl.prompt(); return }

    const say = (text) => {
      console.log(`[Bot] ${text}`)
      try { bot.whisper(TERMINAL_TARGET, text) } catch (_) {}
    }

    if (trimmed.startsWith('!')) {
      const parts = trimmed.split(/\s+/)
      await handleCommand(parts[0].toLowerCase(), parts.slice(1), say)
    } else {
      bot.chat(trimmed)
      console.log(`[Chat] ${trimmed}`)
    }

    rl.prompt()
  })
}

// ─── In-game chat commands ────────────────────────────────────────────────────
bot.on('chat', async (username, message) => {
  if (username === bot.username) return
  const trimmed = message.trim()
  if (!trimmed.startsWith('!')) return
  const parts = trimmed.split(/\s+/)
  await handleCommand(parts[0].toLowerCase(), parts.slice(1), (text) => bot.chat(text))
})

// ─── Events ───────────────────────────────────────────────────────────────────
bot.on('health', () => {
  autoEat()
  if (bot.health <= 4) {
    bot.chat('Low health! Retreating...')
    combatMgr.disable()
    navMgr.stop()
    setTimeout(() => { if (bot.health > 8) combatMgr.enable() }, 10000)
  }
})

bot.on('playerCollect', (collector) => {
  if (collector.username === bot.username) setTimeout(manageArmor, 500)
})

bot.on('death', () => {
  console.log('[Bot] Died')
  bot.chat('I died!')
  combatMgr.disable()
  navMgr.stop()
  setTimeout(() => combatMgr.enable(), 5000)
})

bot.on('kicked', (reason) => console.log('[Bot] Kicked:', reason))
bot.on('error', (err) => console.error('[Bot] Error:', err.message))

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('Shutting down...')
  combatMgr.stop()
  navMgr.stop()
  bot.quit('Shutting down')
  process.exit(0)
})
