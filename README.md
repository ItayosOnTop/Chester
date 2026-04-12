# Minecraft Storage Bot (1.21.1)

A Mineflayer bot that manages your storage system, handles combat, tracks food and armor, and responds to chat commands from authorized players only.

---

## Features

- **Chest sorting** — deposits inventory items into their configured chests automatically
- **Item fetching** — retrieves any item from the correct chest on demand
- **Auto combat** — detects and attacks nearby hostile mobs, equips the best weapon automatically
- **Auto eat** — eats food automatically when hunger drops below 14/20
- **Auto armor** — equips the best available armor automatically
- **Auto totem** — automatically equips totems of undying when health drops below 8/20
- **Navigation** — follow a player, come to a player once, or go to specific coordinates
- **Chat commands** — all features accessible through in-game chat (ItayosOnTop only)
- **Player restrictions** — only responds to commands from player "ItayosOnTop"

---

## Setup

### 1. Install Node.js
Requires Node.js 18 or later. Download from https://nodejs.org

### 2. Install dependencies
```bash
cd minecraft-bot
npm install
```

### 3. Configure the bot

**Server connection** — edit `index.js` or set environment variables:
```bash
MC_HOST=your.server.ip
MC_PORT=25565
MC_USERNAME=StorageBot
MC_AUTH=offline   # or 'microsoft' for online-mode servers
```

**Chest positions** — open `chests.json` and set the correct X/Y/Z coordinates for each chest in your world. Walk up to a chest in-game and press F3 to see your coordinates.

```json
{
  "id": "chest_wood",
  "label": "Wood storage",
  "position": { "x": 100, "y": 64, "z": 200 },
  "items": ["oak_log", "birch_log", "oak_planks"]
}
```

- `id` — internal identifier (used with `!collect`)
- `label` — friendly name shown in chat
- `position` — block position of the chest
- `items` — item names that belong in this chest (use Minecraft's internal names, e.g. `iron_ingot` not `Iron Ingot`)

Any item not listed in any chest's `items` array goes into `defaultChest` (set to `chest_misc` by default).

### 4. Start the bot
```bash
npm start
# or directly:
node index.js
```

---

## In-game Commands

**Note:** The bot only responds to commands from the player "ItayosOnTop".

All commands are typed in chat. The bot responds in the same chat.

| Command | Description |
|---|---|
| `!help` | Show all commands |
| `!sort` | Deposit all inventory items into their correct chests |
| `!fetch <item> [amount]` | Pull an item from its chest (default: 64) |
| `!collect <chest_id>` | Empty a chest into the bot's inventory |
| `!chests` | List all configured chests and their categories |
| `!follow <player>` | Follow a player continuously |
| `!come <player>` | Navigate to a player once |
| `!goto <x> <y> <z>` | Navigate to coordinates |
| `!stop` | Stop all movement |
| `!combat on\|off` | Toggle hostile mob combat |
| `!armor` | Manually equip the best available armor |
| `!totem` | Manually equip a totem of undying |
| `!status` | Show HP, food, navigation, and combat status |
| `!inv` | Show current inventory |

### Examples
```
!fetch diamond 32
!fetch iron_ingot
!sort
!follow Steve
!come Alex
!goto 100 64 200
!collect chest_wood
!combat off
!status
```

---

## Adding / changing chests

Edit `chests.json` — no restart needed if you use a file watcher, otherwise restart the bot after saving.

**Finding item names**: item names follow the pattern `minecraft:<name>` but the bot uses just the `<name>` part. Some common examples:
- `oak_log`, `birch_log`, `spruce_log`
- `iron_ingot`, `gold_ingot`, `diamond`, `emerald`
- `cooked_beef`, `bread`, `apple`
- `iron_sword`, `diamond_pickaxe`

When in doubt, use the `/give` command in-game and check the item name format.

---

## Hostile mobs list

The bot attacks these mobs by default (configurable in `chests.json` under `combat.hostileMobs`):
zombie, skeleton, spider, creeper, enderman, witch, pillager, vindicator, ravager, blaze, zombie_villager, husk, stray, drowned, phantom, slime, magma_cube, ghast, wither_skeleton, piglin_brute

---

## Notes

- The bot will not dig blocks during navigation (`canDig: false`). Enable this in `index.js` if needed.
- Combat is paused during chest interactions to avoid interruptions.
- If the bot dies, combat re-enables automatically after 5 seconds.
- For Microsoft/online-mode servers, set `MC_AUTH=microsoft` and the bot will open a browser for login on first run.
