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
3. Add the Code
Ensure your three main files (index.js, commandHandler.js, and storageManager.js) are in the folder.
4. First Run & Configuration
Run the bot for the first time:
code
Bash
node index.js
Note: The bot will immediately close and generate a config.json file.
Open config.json and configure your server IP, port, bot username, Minecraft version, and the bot owner's username (so it only listens to you). Once configured, start the bot again:
code
Bash
node index.js
🎮 How to Use (Getting Started)
When the bot joins the server, you must set up its working area. Stand near your chests and use the in-game chat to send commands.
Step 1: Define the Area
Tell the bot the 3D bounding box that contains all your storage chests.
Command: !setarea Main <x1> <y1> <z1> <x2> <y2> <z2>
(The bot will immediately scan all chests inside these coordinates and save them to its database).
Step 2: Set the Home Base
Set a default spot for the bot to stand when it is idle.
Command: !sethome Main <x> <y> <z>
Step 3: Set the Drop-off / Pick-up Chests
Set the default chest where you will dump items for the bot to sort, and the chest where the bot should deliver fetched items.
Command: !sort Main <x> <y> <z> (Registers the drop-off chest and begins sorting).
Command: !fetch Main diamond 64 <x> <y> <z> (Registers the pick-up chest and fetches 64 diamonds).
💡 Pro Tip: Once the default !sort and !fetch chests are saved for an area, you no longer need to type the coordinates! You can simply type !sort Main or !fetch Main diamond 128.
📜 Command Reference
All commands must be prefixed with !. You can type these in the Minecraft chat, or directly into the Node.js terminal window.
Command	Description
!setarea <Area> <x1> <y1> <z1> <x2> <y2> <z2>	Defines the 3D boundary of your storage room. Automatically initiates a scan.
!sethome <Area> <x> <y> <z>	Sets the idle standing location for the bot.
!scan <Area>	Forces the bot to check all chests in the area and update its memory. Run this if you manually move items around!
!sort <Area> [x y z]	Takes all items from the bot's inventory (and the optional chest coordinates) and neatly sorts them into the storage system.
!fetch <Area> <item> <amount> [x y z]	Fetches the exact amount of the specified item and drops it in the designated delivery chest.
!follow <playerName>	The bot will walk to you and follow you around, navigating around blocks seamlessly.
!stop	Instantly aborts any sorting/fetching task, clears movement paths, and sends the bot home.
!status	Replies with the bot's Health, Hunger, and current internal Task.
!help	Displays a list of all commands.
📂 File Breakdown
index.js - The main brain. Connects to the server, loads the auto-eat/armor plugins, fixes physics, and handles the Terminal Interface.
commandHandler.js - Processes all commands, formats whisper (/msg) replies, and manages the !stop Kill-Switch.
storageManager.js - The heavy lifter. Handles database generation, AI categorizing, pathfinding, chest opening, and the massive fetch and sort loops.
database.json - (Auto-generated) The bot's memory. It remembers where every single item in your base is located.
config.json - (Auto-generated) Your server and owner configuration.