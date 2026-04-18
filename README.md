# 🤖 Minecraft Auto-Storage Bot

An advanced, highly-optimized Mineflayer bot designed to completely automate your Minecraft storage system. This bot acts as your personal warehouse manager: it can scan massive arrays of chests, automatically categorize and sort your loot, and fetch exact amounts of items across multiple trips.

## ✨ Features

* **🧠 Smart Categorization:** Automatically groups items by category (e.g., Redstone, Building Blocks, Ores, Food) using intelligent string-matching. No manual item-ID JSON files required!
* **⚡ Optimized Pathfinding:** Uses a Greedy Nearest-Neighbor algorithm to smoothly scan chest aisles without zigzagging. Includes instant-turning physics for perfectly straight, robotic movement.
* **🚚 Infinite Fetching:** Need 5,000 cobblestone? The bot will automatically calculate trips, fill its inventory, drop it off, and repeat until the exact quota is met.
* **🛡️ Inventory Protection:** Features built-in Auto-Eat and Auto-Armor/Totem managers. The bot is smart enough to *never* sort its own equipped armor, totems, or personal food supply into the storage system.
* **🛑 Instant Kill-Switch:** A perfectly wired `!stop` command that immediately aborts any background task, closes all GUIs, and safely returns the bot to its home base.
* **🤫 Whisper & Terminal Control:** The bot replies via private `/msg` to avoid spamming the global server chat. You can also send commands directly from your computer's terminal!

---

## 📥 Installation

### 1. Prerequisites
You will need [Node.js](https://nodejs.org/) installed on your computer.

### 2. Setup the Project
Create a folder for your bot, open your terminal inside that folder, and run the following commands:
```bash
# Initialize a new Node project
npm init -y

# Install all required dependencies
npm install mineflayer mineflayer-pathfinder vec3 minecraft-data mineflayer-auto-eat mineflayer-armor-manager