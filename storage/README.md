# Minecraft Combat Bot

A specialized Mineflayer bot focused on combat, survival, and following commands. Only responds to player "ItayosOnTop".

## Features

- **Auto combat** — detects and attacks nearby hostile mobs, equips the best weapon automatically
- **Auto eat** — eats food automatically when hunger drops below 14/20
- **Auto armor** — equips the best available armor automatically
- **Auto totem** — automatically equips totems of undying when health drops below 8/20
- **Navigation** — follow a player, come to a player once
- **Player restrictions** — only responds to commands from player "ItayosOnTop"

## Setup

### 1. Install Node.js
Requires Node.js 18 or later. Download from https://nodejs.org

### 2. Install dependencies
```bash
cd storage
npm install
```

### 3. Configure the bot

**Server connection** — edit `index.js` or set environment variables:
```bash
MC_HOST=your.server.ip
MC_PORT=25565
MC_USERNAME=CombatBot
MC_AUTH=offline   # or 'microsoft' for online-mode servers
```

### 4. Start the bot
```bash
npm start
# or directly:
node index.js
```

## In-game Commands

**Note:** The bot only responds to commands from the player "ItayosOnTop".

All commands are typed in chat. The bot responds in the same chat.

| Command | Description |
|---|---|
| `!help` | Show all commands |
| `!follow <player>` | Follow a player continuously |
| `!come <player>` | Navigate to a player once |
| `!stop` | Stop all movement |
| `!combat on\|off` | Toggle hostile mob combat |
| `!armor` | Manually equip the best available armor |
| `!totem` | Manually equip a totem of undying |
| `!status` | Show HP, food, navigation, and combat status |
| `!inv` | Show current inventory |

### Examples
```
!follow ItayosOnTop
!come ItayosOnTop
!stop
!combat off
!armor
!totem
!status
```

## Automatic Features

- **Armor Management**: Automatically equips the best armor when items are picked up
- **Food Management**: Eats food when hunger drops below 14/20
- **Totem Management**: Equips totems when health drops below 8/20
- **Combat**: Attacks hostile mobs within 16 blocks automatically
- **Health Protection**: Disables combat and retreats when health drops below 4/20