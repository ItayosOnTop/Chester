# Minecraft Storage Bot 🤖📦

A Mineflayer-powered bot that automatically scans, sorts, and fetches items from chest storage systems.
Only responds to commands from **ItayosOnTop**.

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Edit `config.json`

This is the **only file you need to edit**. It controls the server connection and all scan areas:

```json
{
  "server": {
    "host": "localhost",
    "port": 25565,
    "username": "StorageBot",
    "version": "1.20.1"
  },
  "owner": "ItayosOnTop",
  "scanAreas": [
    {
      "name": "Main Storage",
      "from": { "x": -100, "y": 60, "z": -100 },
      "to":   { "x": -50,  "y": 70, "z": -50  }
    },
    {
      "name": "Underground Vault",
      "from": { "x": 200, "y": 20, "z": 300 },
      "to":   { "x": 250, "y": 40, "z": 350 }
    }
  ]
}
```

| Field | Description |
|---|---|
| `server.host` | Your server IP or hostname |
| `server.port` | Server port (default 25565) |
| `server.username` | The bot's Minecraft username |
| `server.version` | Minecraft version string (e.g. `"1.20.1"`) |
| `owner` | The only player allowed to send commands |
| `scanAreas` | List of named areas to scan for chests |

You can add as many `scanAreas` entries as you want. Each needs a `name`, a `from` coordinate, and a `to` coordinate.

### 3. Start the bot
```bash
npm start
```

---

## Commands (in-game chat)

### Scanning
| Command | Description |
|---|---|
| `!areas` | List all scan areas from config.json |
| `!scan` | Same — shows available areas |
| `!scan <name or #>` | Scan a specific area by name or number |
| `!scanall` | Scan every area defined in config.json |
| `!rescan x y z` | Re-scan a single chest at specific coords |

### Sorting & Fetching
| Command | Description |
|---|---|
| `!sort` | Sort bot's current inventory into matching chests |
| `!sort x y z` | Empty a specific chest and sort its items |
| `!fetch <item_name> [count]` | Retrieve items from storage |

### Info
| Command | Description |
|---|---|
| `!find <item_name>` | Find which chest(s) contain an item |
| `!list` | List all catalogued chests with categories |
| `!inspect x y z` | Show detailed contents of a specific chest |

### Misc
| Command | Description |
|---|---|
| `!clear` | Clear the entire chest database |
| `!come` | Bot navigates to your location |
| `!status` | Check if bot is busy |
| `!stop` | Cancel the current task |
| `!help` | Show help in-game |

---

## Example Workflow

```
ItayosOnTop: !areas
Bot: === 2 Scan Area(s) in config.json ===
Bot:   #1 "Main Storage"  [-100,60,-100] → [-50,70,-50]
Bot:   #2 "Underground Vault"  [200,20,300] → [250,40,350]

ItayosOnTop: !scan 1
Bot: Starting scan of area: "Main Storage"
Bot: Found 12 chest(s). Scanning contents...
Bot: Scan complete! 12 chests catalogued.

ItayosOnTop: !scan Underground
Bot: Starting scan of area: "Underground Vault"
...

ItayosOnTop: !fetch oak_log 64
Bot: Fetching 64x oak_log...
Bot: Fetched 64x oak_log!

ItayosOnTop: !sort
Bot: Starting sort: scanning my inventory...
Bot: All 3 stacks sorted successfully!
```

---

## File Structure

```
minecraft-storage-bot/
├── config.json       ← Edit this! Server + scan areas
├── index.js          ← Bot entry, reads config.json
├── storageManager.js ← Chest scanning, sorting, fetching
├── commandHandler.js ← In-game command parser
├── chest_data.json   ← Auto-generated chest database (do not edit)
└── package.json
```

---

## Item Categories (auto-detected)

| Category | Examples |
|---|---|
| `logs` | oak_log, birch_log, spruce_log |
| `planks` | oak_planks, birch_planks |
| `stone` | stone, cobblestone, granite, deepslate |
| `ores` | iron_ore, coal_ore, diamond_ore |
| `metals` | iron_ingot, gold_ingot, copper_ingot |
| `gems` | diamond, emerald, amethyst_shard |
| `terrain` | sand, gravel, dirt, clay |
| `tools_weapons` | sword, pickaxe, bow, trident |
| `armor` | helmet, chestplate, leggings, boots |
| `food` | bread, apple, cooked_beef |
| `redstone` | redstone, comparator, piston, hopper |
| `potions` | potion, splash_potion |
| `lighting` | torch, lantern |
| `mob_drops` | string, feather, bone, blaze_rod |
| `misc` | anything uncategorized |
