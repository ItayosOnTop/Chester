// index.js — Minecraft combat & utility bot (ItayosOnTop only)
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const readline = require('readline')

// ─── Bot connection settings ──────────────────────────────────────────────────
const BOT_OPTIONS = {
  host: process.env.MC_HOST || 'localhost',
  port: parseInt(process.env.MC_PORT || '25565'),
  username: process.env.MC_USERNAME || 'CombatBot',
  version: '1.21.11',
  auth: process.env.MC_AUTH || 'offline',
}

// Player to /msg when replying to terminal commands
const AUTHORIZED_PLAYER = 'ItayosOnTop'

console.log(`Connecting to ${BOT_OPTIONS.host}:${BOT_OPTIONS.port} as ${BOT_OPTIONS.username}`)

const bot = mineflayer.createBot(BOT_OPTIONS)
bot.loadPlugin(pathfinder)

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

const WEAPON_PRIORITY = [
  'netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword', 'golden_sword',
  'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe',
  'bow'
]

// ─── Navigation Manager ──────────────────────────────────────────────────────
class NavigationManager {
  constructor(bot) {
    this.bot = bot
    this.followTarget = null
    this.followInterval = null
    this.followDistance = 3
    this.stopDistance = 2
    this.combatMgr = null
  }

  startFollow(playerName, sendMessage) {
    const player = this.bot.players[playerName]
    if (!player || !player.entity) {
      sendMessage(`Can't see "${playerName}" — are they nearby?`)
      return
    }

    this.stop()
    this.followTarget = playerName
    sendMessage(`Now following ${playerName}. Say !stop to stop.`)

    this.followInterval = setInterval(() => {
      const target = this.bot.players[this.followTarget]
      if (!target || !target.entity) return
      const dist = this.bot.entity.position.distanceTo(target.entity.position)
      if (dist <= this.stopDistance) return
      try {
        this.bot.pathfinder.setGoal(new goals.GoalFollow(target.entity, this.followDistance), true)
      } catch (_) {}
    }, 500)
  }

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

  stop(sendMessage) {
    if (this.followInterval) {
      clearInterval(this.followInterval)
      this.followInterval = null
    }
    this.followTarget = null
    this.bot.pathfinder.setGoal(null)
    this.combatMgr?.release()
    if (sendMessage) sendMessage('Stopped.')
  }

  status() {
    if (this.followTarget) return `Following ${this.followTarget}`
    return 'Idle'
  }
}

// ─── Combat Manager ──────────────────────────────────────────────────────────
class CombatManager {
  constructor(bot) {
    this.bot = bot
    this.enabled = true
    this.currentTarget = null
    this.loopInterval = null
    this.attackRange = 3.5
    this.scanRadius = 16
    this.hostileMobs = new Set([
      "zombie", "skeleton", "spider", "creeper", "enderman",
      "witch", "pillager", "vindicator", "ravager", "blaze",
      "zombie_villager", "husk", "stray", "drowned", "phantom",
      "slime", "magma_cube", "ghast", "wither_skeleton", "piglin_brute"
    ])
    this.navLock = false
  }

  start() {
    this.loopInterval = setInterval(() => this._tick(), 500)
    console.log('[Combat] Started')
  }

  stop() {
    if (this.loopInterval) {
      clearInterval(this.loopInterval)
      this.loopInterval = null
    }
  }

  enable()  { this.enabled = true;  this.currentTarget = null; console.log('[Combat] Enabled') }
  disable() { this.enabled = false; this.currentTarget = null; console.log('[Combat] Disabled') }

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

  async _equipBestWeapon() {
    for (const weapon of WEAPON_PRIORITY) {
      const item = this.bot.inventory.items().find(i => i.name === weapon)
      if (item) {
        if (this.bot.heldItem?.name !== weapon) {
          try { await this.bot.equip(item, 'hand') } catch (_) {}
        }
        return
      }
    }
  }

  async _tick() {
    if (!this.enabled || this.navLock) return

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
    await this._equipBestWeapon()

    if (dist <= this.attackRange) {
      await this.bot.lookAt(target.position.offset(0, target.height * 0.5, 0))
      this.bot.attack(target)
    } else {
      try {
        this.bot.pathfinder.setGoal(new goals.GoalFollow(target, this.attackRange - 0.5), true)
      } catch (_) {}
    }
  }

  status() {
    const nearby = this._nearestHostile()
    if (!nearby) return `Combat: ${this.enabled ? 'ON' : 'OFF'} | No threats nearby`
    const dist = Math.round(this.bot.entity.position.distanceTo(nearby.position))
    return `Combat: ON | Engaging ${nearby.name} (${dist}m away)`
  }
}

// ─── Auto functions ──────────────────────────────────────────────────────────
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

let isEquippingTotem = false
async function autoTotem() {
  if (isEquippingTotem || bot.health > 8) return
  isEquippingTotem = true
  const totem = bot.inventory.items().find(i => i.name === 'totem_of_undying')
  if (totem) {
    try {
      await bot.equip(totem, 'off-hand')
      console.log('[AutoTotem] Equipped totem of undying')
    } catch (_) {}
  }
  isEquippingTotem = false
}

// ─── Command handler ─────────────────────────────────────────────────────────
async function handleCommand(cmd, args, say) {
  switch (cmd) {
    case '!help':
      say('=== Combat Bot Commands (ItayosOnTop only) ===')
      say('!follow [player] — follow a player')
      say('!come [player] — navigate to a player once')
      say('!stop — stop current movement')
      say('!combat on|off — toggle combat')
      say('!armor — equip best armor now')
      say('!totem — equip totem of undying')
      say('!status — show HP, food, nav, combat status')
      say('!inv — list inventory')
      break

    case '!follow':
      navMgr.startFollow(args[0] || AUTHORIZED_PLAYER, say)
      break

    case '!come':
      await navMgr.comeToPlayer(args[0] || AUTHORIZED_PLAYER, say)
      break

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

    case '!totem':
      await autoTotem()
      say('Totem equipped!')
      break

    case '!status':
      say(`HP: ${Math.round(bot.health)}/20 | Food: ${Math.round(bot.food)}/20`)
      say(`Navigation: ${navMgr.status()}`)
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

// ─── Bot events ──────────────────────────────────────────────────────────────
let navMgr, combatMgr

bot.once('spawn', () => {
  console.log('[Bot] Spawned! Type commands in terminal (e.g. !help)')

  const mcData = require('minecraft-data')(bot.version)
  const movements = new Movements(bot, mcData)
  movements.allowSprinting = true
  movements.canDig = false
  movements.maxDropDown = 256
  bot.pathfinder.setMovements(movements)

  navMgr = new NavigationManager(bot)
  combatMgr = new CombatManager(bot)

  navMgr.combatMgr = combatMgr
  combatMgr.start()

  setTimeout(manageArmor, 2000)

  bot.chat('Combat bot online! I only listen to ItayosOnTop. Type !help for commands.')
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
      try { bot.whisper(AUTHORIZED_PLAYER, text) } catch (_) {}
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
  if (username !== AUTHORIZED_PLAYER) return  // Only listen to ItayosOnTop
  const trimmed = message.trim()
  if (!trimmed.startsWith('!')) return
  const parts = trimmed.split(/\s+/)
  await handleCommand(parts[0].toLowerCase(), parts.slice(1), (text) => bot.chat(text))
})

// ─── Health monitoring ───────────────────────────────────────────────────────
bot.on('health', () => {
  autoEat()
  autoTotem()
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