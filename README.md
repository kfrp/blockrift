# BlockRift

**A multiplayer voxel sandbox game built with Three.js, running natively on Reddit's Devvit platform.**

BlockRift is a browser-based Minecraft-inspired building game where you can create, destroy, and explore an infinite procedurally-generated world alongside other Reddit users in real-time. Play directly from Reddit posts with no downloads required - your Reddit username is your in-game identity.

The game features smooth 60 FPS gameplay powered by Three.js, real-time multiplayer synchronization via WebSocket, persistent world state stored in Redis, and an intuitive building system with 12 different block types. Whether you're building solo or collaborating with friends, BlockRift brings the classic voxel sandbox experience directly to Reddit.

BlockRift combines the creative freedom of voxel building games with Reddit's social platform, enabling seamless multiplayer collaboration where your creations persist and can be explored by the entire community. The game works seamlessly in both standard browsers and Reddit's sandboxed iframe environment, automatically adapting controls for optimal gameplay.

Your position coordinates (X, Z) are displayed in the top-right corner next to your username, helping you navigate and share locations with other players. The game features a real-time chat system (press C to open), a global friendship system for collaborative building, and a builder recognition system with upvoting to appreciate great creations.

---

## 🎮 What is BlockRift?

BlockRift is a fully-featured voxel sandbox game that runs entirely within Reddit posts. It's a multiplayer building experience where you can:

- **Build and destroy blocks** in an infinite 3D world with 12 different block types
- **Collaborate with other players** in real-time - see them move, build, and chat
- **Explore procedurally-generated terrain** with trees, underground caves, stone regions, and coal ore
- **Make friends** to enable collaborative building permissions across all worlds
- **Chat with other players** using the built-in chat system (press C)
- **Switch between walking and flying modes** for different building styles
- **Dig infinitely deep** - new blocks generate beneath removed ones until you hit bedrock
- **Upvote builders** to show appreciation for impressive creations
- **Highlight builds** by clicking builder names to see all their blocks in green

The game features:

- **Infinite procedurally-generated terrain** with realistic biomes, trees, and underground resources
- **Real-time multiplayer** with position synchronization and collaborative building
- **12 different block types** including grass, sand, tree logs, leaves, dirt, stone, coal, wood planks, diamond, quartz, glass, and bedrock
- **Global friendship system** allowing trusted players to modify each other's creations across all worlds
- **Builder recognition** with upvoting system to appreciate great builds
- **Persistent world state** stored in Redis - your creations are saved automatically
- **Real-time chat system** for communication with other players (press C to chat)
- **Mobile-friendly controls** with touch joystick and optimized UI
- **Smooth 60 FPS gameplay** powered by Three.js and Web Workers
- **Smart spawn positioning** to avoid player overlap and existing structures
- **Walking and flying modes** with realistic physics including gravity, jumping, and sneaking
- **Sandboxed environment support** with automatic control adaptation for Reddit's iframe
- **Viewer mode** for multi-device users to prevent conflicts

---

## 🌟 What Makes BlockRift Innovative?

### 1. **Reddit-Native Gaming**

BlockRift runs entirely within Reddit posts using Devvit's webview technology. No external websites, no downloads - just click "Play" on a Reddit post and start building. Your Reddit username is your in-game identity.

### 2. **Intelligent Click Detection**

BlockRift features a sophisticated mouse control system that distinguishes between camera rotation and block interaction. The game tracks mouse movement and timing during clicks:

- **Left-click + drag**: Rotates the camera (if you move your mouse more than 3 pixels while holding the button)
- **Left-click without drag**: Breaks blocks (clean click without mouse movement)
- **Right-click**: Places blocks (always works, independent of camera movement)

This intelligent detection uses a drag threshold and timing analysis to provide intuitive controls that work seamlessly in Reddit's sandboxed environment without requiring pointer lock. The system ensures you never accidentally break blocks while rotating the camera, and you never accidentally rotate the camera when trying to break blocks.

### 3. **Smart Regional Broadcasting**

Instead of sending every player's position to everyone, BlockRift uses a regional channel system that divides the world into zones (15×15 chunks per region). You only receive updates from players near you, enabling massive multiplayer worlds without performance issues. This architecture scales to infinite world sizes.

### 4. **Optimistic UI with Conflict Resolution**

Block placements and removals happen instantly on your screen, then sync with the server. If two players modify the same block simultaneously, the server's timestamp-based conflict resolution ensures consistency across all clients. You never wait for server confirmation - the game feels responsive even with network latency.

### 5. **Web Worker Terrain Generation**

Terrain generation runs in a separate Web Worker thread, keeping the game at 60 FPS even while generating thousands of blocks. The main thread never freezes, ensuring smooth gameplay during chunk loading.

### 6. **Global Friendship System**

Unlike traditional games with complex permission systems, BlockRift uses a simple global friendship model: add someone as a friend, and they can remove your blocks (and you can remove theirs) in ANY level. This enables true collaboration without griefing. Friendships persist across all worlds and are stored in a global Redis hash for instant permission checks.

### 7. **Viewer Mode for Multi-Device Users**

If you're already playing on one device and open the game on another, the second device enters "Viewer Mode" - you can watch the world but not modify it. This prevents accidental conflicts and data loss while allowing you to spectate your own gameplay.

### 8. **Infinite Depth Generation**

When you remove a block, new blocks generate beneath it automatically. Dig as deep as you want - the world generates infinitely downward until you hit bedrock at y=0. The procedural generation ensures consistent terrain across all clients using server-provided seeds. The `generateAdjacentBlocks()` function creates blocks in all 6 directions around removed blocks, filling in the space with appropriate block types (stone, dirt, or sand) based on depth and terrain noise.

### 9. **Real-Time Chat System**

Press C to open the chat input and communicate with other players in your level. Type your message (up to 200 characters) and press Enter to send. Messages appear in the bottom-left corner with usernames and are broadcast to all players in the same world. Chat is disabled in Viewer Mode.

### 10. **Builder Recognition System**

See who's building in your region with the builders list (top-left corner). Click on a builder's name to highlight all their blocks in green. Upvote builders to show appreciation for their creations - upvotes are tracked globally and contribute to a leaderboard system.

### 11. **Smart Spawn Positioning**

When you join a level, the server calculates a smart spawn position that avoids placing you on top of other players or existing structures. It tries 25 positions in a spiral pattern to find an unoccupied spot, ensuring a smooth entry experience. If you've played before, you'll spawn at your last known position, allowing you to continue where you left off.

### 12. **Advanced Collision System**

The game features a sophisticated collision detection system with 6-directional raycasting (front, back, left, right, up, down). When you collide with walls at an angle, the system allows you to slide along them smoothly rather than stopping completely. This creates natural movement that feels responsive and intuitive. The collision system also handles special cases like sneaking (prevents falling off edges) and jumping (temporary collision adjustments). The system uses a temporary instanced mesh for efficient collision checking, testing only nearby blocks rather than the entire world.

### 13. **Procedural Cloud Generation**

The sky features dynamically generated clouds made from 50-75 small pieces clustered together. Each cloud cluster is positioned randomly across the sky at y=80, creating a realistic atmosphere. Clouds are regenerated every 6 terrain generation cycles as you explore, maintaining visual variety without impacting performance. The cloud system uses instanced rendering with up to 10,000 cloud pieces for efficient rendering.

**Visual Features**:

- White clouds with transparency for realistic appearance
- Randomly positioned across the sky
- Regenerate as you explore new areas
- No performance impact due to instanced rendering

### 14. **Efficient Instance-Based Rendering**

Instead of creating individual meshes for each block (which would be thousands of draw calls), BlockRift uses Three.js InstancedMesh to render all blocks of the same type in a single draw call. Each block type has its own InstancedMesh with pre-allocated capacity based on expected frequency (grass is common, diamonds are rare). This optimization enables smooth 60 FPS gameplay even with thousands of visible blocks.

**Allocation Strategy**:

- Grass blocks: 100% allocation (most common)
- Leaves: 70% allocation (trees are common)
- Sand, stone, coal: 20% allocation (moderately common)
- Dirt, tree logs, wood, diamond, quartz, glass, bedrock: 10% allocation (less common)

This smart allocation prevents over-allocation while ensuring capacity for all block types.

### 15. **Sandboxed Environment Support**

BlockRift is designed to work perfectly in Reddit's sandboxed iframe environment without requiring pointer lock. Players use left-click and drag to look around, with intelligent detection that distinguishes between camera rotation (dragging) and block interaction (clicking). The game shows a helpful notification when you first activate the camera to explain the controls, ensuring a smooth experience whether you're playing on Reddit or in a standalone browser.

### 16. **Chat System**

Press C to open the chat input and communicate with other players in your level. Type your message (up to 200 characters) and press Enter to send. Messages appear in the bottom-left corner with usernames and are broadcast to all players in the same world. Chat is disabled in Viewer Mode.

---

## 🎯 How to Play

### Getting Started

1. **Launch the Game**

   - Find a BlockRift post on Reddit
   - Click the "Play" button on the splash screen
   - A loading screen appears with animated bouncing blocks while assets load (images, fonts, and game data)
   - A "Connecting..." loading bar appears while establishing connection to the server
   - The game connects to the server and fetches:
     - Terrain seeds (ensures everyone sees the same world)
     - Initial chunks around your spawn position
     - Player data (score, friends, position)
     - Other active players in the level
   - You'll spawn in a procedurally-generated world with other players
   - Your Reddit username and coordinates (X, Z) appear in the top-right corner
   - Other players appear as colored block characters with nametags above their heads
   - If connection fails, an error modal appears with a "Retry" button
   - If authentication fails, an error modal appears explaining the issue
   - The game automatically detects if you're in Reddit's sandboxed environment and adjusts controls accordingly

2. **Basic Controls (Desktop)**

   **Camera Control:**

   - **Left Click + Drag** - Look around (camera control)
   - The game intelligently detects drag vs click: if you move your mouse while holding the left button, it rotates the camera; if you click without moving, it breaks blocks
   - The crosshair (white + in center) shows where you'll place/break blocks
   - A helpful notification appears when you first activate the camera explaining the controls

   **Movement:**

   - **WASD** - Move forward/backward/left/right
   - **Space** - Jump (in walking mode) or fly up (in flying mode)
   - **Shift** - Sneak (walking mode) or fly down (flying mode)
   - **Q** - Toggle between walking mode and flying mode

   **Building:**

   - **Left Click** - Destroy block (click without dragging - the game intelligently detects if you're rotating the camera vs breaking blocks)
   - **Right Click** - Place block (click to place, hold for continuous placing)
   - **Mouse Wheel / Number Keys (1-8)** - Select block type from hotbar
   - **Tip**: The game prevents accidental block breaking during camera drags - if you're dragging to look around, block interactions are ignored. This intelligent click detection ensures smooth gameplay without requiring pointer lock.

   **Communication:**

   - **C** - Open chat input (type message and press Enter to send, Escape to cancel)
   - **F** - Toggle friends list (when menu is open)

   **Menu:**

   - **E** - Open/close menu (pause game)
   - **F** - Toggle fullscreen

3. **Basic Controls (Mobile)**
   - **Left Joystick** - Move in any direction
   - **Swipe Screen** - Look around (camera control)
   - **Tap** - Place block (quick tap) or destroy block (hold)
   - **Action Buttons** - Jump, mode switch, fly up/down
   - **Block Selector** - Tap to change selected block type

### Building and Mining

1. **Selecting Blocks**

   - Use number keys 1-8 or scroll with mouse wheel to cycle through blocks
   - Your selected block appears highlighted in the hotbar at the bottom of the screen
   - Available blocks in hotbar (in order):
     1. **Wood Planks** - Brown planks, great for building structures
     2. **Glass** - Transparent blocks for windows
     3. **Grass** - Green blocks with grass texture on top
     4. **Stone** - Gray blocks, common underground
     5. **Tree Logs** - Log blocks with bark texture
     6. **Diamond** - Rare blue blocks for decoration
     7. **Quartz** - White decorative blocks
     8. **Coal** - Dark blocks found underground
   - Additional blocks exist in the world but aren't in the hotbar:
     - **Sand** - Found in low-lying areas (underwater)
     - **Dirt** - Underground beneath grass
     - **Leaves** - Part of trees
     - **Bedrock** - Unbreakable bottom layer at y=0

2. **Placing Blocks**

   - Move your mouse over any surface - the block will be highlighted with a translucent overlay
   - Right-click to place your selected block adjacent to the highlighted surface
   - Blocks snap to a 1×1×1 grid for precise building
   - You cannot place blocks inside your own player position
   - Placed blocks are instantly visible and saved to the server
   - A sound effect plays when you place a block

3. **Destroying Blocks**
   - Move your mouse over a block to highlight it
   - Left-click (without dragging) to destroy it - the game intelligently detects if you're rotating the camera (dragging) vs breaking blocks (clicking)
   - The block shrinks with an animation and disappears
   - **Permission System**:
     - You can always destroy blocks you placed
     - You can destroy blocks placed by players who added you as a friend (global permission)
     - You cannot destroy blocks placed by other players (unless they're your friend)
     - Attempting to destroy protected blocks shows an error notification (bottom-right corner)
   - **Bedrock** (bottom layer at y=0) cannot be destroyed by anyone
   - When you destroy a block, new blocks generate beneath it (infinite depth)
   - A sound effect plays based on the block type destroyed
   - Hold left-click for continuous block breaking (as long as you're not dragging the camera)

### Multiplayer Features

1. **Builders List** (Top-Left Corner)

   - Shows two key stats:
     - **Players Online**: Total number of players currently in this level (updates in real-time)
     - **Builders**: Number of unique players who have built in your current region (15×15 chunks)
   - Click the header to expand/collapse the list
   - When expanded, shows all builders with their usernames
   - Each builder has three interactive buttons:
     - **Friend button** (+/✓) - Add or remove as friend (instant toggle)
     - **Username** - Click to highlight their blocks in green
     - **Upvote button** (↑) - Show appreciation for their builds (one-time per builder)

2. **Adding Friends**

   - Click the **+** button next to a player's name in the builders list
   - The button changes to **✓** when they're your friend
   - **Important**: When you add someone as a friend, they can remove your blocks (and you can remove theirs) in ANY level
   - This enables true collaborative building projects across all worlds
   - Friendships are global - they persist across all levels/worlds
   - Click the **✓** button to remove a friend
   - You'll receive a notification (bottom-right corner) when someone adds or removes you as a friend
   - Friend receives notification even if they're in a different level or offline (within 2 hours)

3. **Upvoting Builders**

   - Click the **↑** button next to a player's name
   - Shows appreciation for their builds
   - Each player can upvote once per builder (button becomes disabled after upvoting)
   - Upvotes are tracked globally across all levels
   - Cannot upvote yourself
   - Upvotes contribute to a global leaderboard system

4. **Highlighting Builds**

   - Click a player's name in the builders list
   - All their blocks in the current region will be highlighted in green
   - Great for finding specific builds or seeing who built what
   - The builder's name in the list also turns green when highlighted
   - Click again to remove highlighting
   - Only one builder can be highlighted at a time

5. **Chat System**

   - Press **C** to open the chat input (appears in center of screen)
   - Type your message (up to 200 characters) and press **Enter** to send
   - Press **Escape** to close chat without sending
   - Messages appear in the bottom-left corner with username (in green)
   - Chat messages are visible to all players in your current level
   - Messages persist until overflow (no time-based expiration)
   - Chat is disabled in Viewer Mode
   - All keyboard input goes to chat when active (except Escape)

6. **Notification System**
   - Notifications appear in the bottom-right corner
   - **Success notifications** (green): Friend additions, successful actions
   - **Error notifications** (red): Permission errors, failed actions
   - Notifications auto-dismiss after 20 seconds with fade animation
   - Multiple notifications stack vertically
   - Examples:
     - "username has added you as a friend! You can now build AND break blocks together"
     - "Cannot remove this block - only the builder or their friends can remove it"
   - Notifications slide in from the right with smooth animations

### Game Modes

1. **Walking Mode** (Default)

   - Realistic physics with gravity
   - You fall when not on solid ground
   - **Jump** with Space (applies upward velocity)
   - **Sneak** with Shift:
     - Slower movement speed
     - Prevents falling off edges
     - Camera lowers slightly
     - Cannot jump while sneaking
   - Collisions with blocks prevent movement through walls

2. **Flying Mode** (Press Q to toggle)
   - No gravity - fly freely in any direction
   - **Space** to fly up continuously
   - **Shift** to fly down continuously
   - Release keys to stop vertical movement
   - Perfect for building tall structures or exploring from above
   - WASD still controls horizontal movement

### Settings

Access settings by pressing **E** (opens menu) and clicking "Settings":

- **Music** (On/Off):
  - Toggle background music
  - Music plays automatically when game is active
  - Pauses when menu is open
  - Changes apply when you click "Apply & Close"

### Guide

Access the in-game guide by clicking "Guide" from the main menu. The guide includes:

- **POV & Movement**: Camera controls and movement keys
- **Building**: Block placement and destruction controls
- **Multiplayer**: Chat, friends list, and builder interaction
- **Other**: Menu and fullscreen controls

### Audio

The game features immersive audio:

- **Background Music**: Atmospheric music plays during gameplay (toggle in settings)
- **Sound Effects**: Block placement and destruction sounds
- **Spatial Audio**: Sounds are positioned in 3D space relative to the camera

### UI Elements

**Hotbar** (Bottom Center):

- Shows 8 block types you can place
- Selected block is highlighted with white border
- Use number keys 1-8 or mouse wheel to select

**Crosshair & Block Highlighting** (Center):

- White + symbol provides a visual reference point
- Blocks are highlighted when you hover your mouse over them
- The highlighted block (shown with a translucent overlay) is where you'll place/break blocks
- Precise targeting for building

**Username & Position** (Top Right):

- Your Reddit username
- Current coordinates (X, Z)
- In Viewer Mode, shows "VIEWER | username" in red

**Builders List** (Top Left):

- Shows "Players Online" count (total players in level)
- Shows "Builders" count (unique builders in your region)
- Click header to expand/collapse
- When expanded, shows all builders with friend/upvote buttons

**Chat Display** (Bottom Left):

- Shows recent chat messages
- Username in green, message in white
- Messages persist until overflow

**Notifications** (Bottom Right):

- Success messages in green
- Error messages in red
- Auto-dismiss after 20 seconds
- Slide in from right with animation

### Tips for New Players

- **Start small**: Build a simple structure to get familiar with controls before attempting large projects
- **Use flying mode**: Press Q to toggle flying - it's much easier for building tall structures or exploring
- **Camera control**: Left-click and drag to look around - the game prevents block breaking while you're dragging
- **Breaking blocks**: Click without dragging to break blocks - the game intelligently distinguishes between camera rotation and block interaction
- **Make friends**: Add other builders as friends to collaborate on projects and modify each other's builds
- **Explore**: The world is infinite - walk in any direction to discover new terrain, trees, and underground resources
- **Check the builders list**: Click the header in the top-left to expand and see who's online and building in your region
- **Dig deep**: Remove blocks to explore underground - new blocks generate beneath automatically until you hit bedrock
- **Bedrock is unbreakable**: The bottom layer (y=0) prevents falling into the void - you can't break it
- **Watch the highlight**: Blocks are highlighted with a translucent overlay when you hover over them - this shows exactly where you'll place or break blocks
- **Continuous actions**: Hold left-click to continuously break blocks (without dragging), hold right-click to continuously place
- **Chat with others**: Press C to communicate with nearby players and coordinate builds
- **Highlight to learn**: Click builder names in the list to see their blocks highlighted in green - great for learning techniques
- **Upvote good builds**: Show appreciation by upvoting builders whose creations you admire
- **Watch your permissions**: You can only break blocks you placed or blocks from players who added you as a friend
- **Spawn position persists**: When you disconnect and rejoin, you'll spawn at your last known position
- **Smooth wall sliding**: When you hit walls at an angle, the collision system lets you slide along them naturally
- **Expand builders list**: The builders list starts collapsed - click the header to expand and see all builders in your region

### Viewer Mode

If you're already playing on another device, new connections enter **Viewer Mode**:

- A red notification appears at the top of the screen: "⚠️ Viewer Mode - You are already playing from another device. Block modifications are disabled."
- You can see the world and other players moving around
- You can move and look around freely
- **Restrictions**:
  - Cannot place or remove blocks (attempts show warning)
  - Cannot send chat messages (C key disabled)
  - Cannot modify the world in any way
  - Position updates are not sent to server
- Your username label shows "VIEWER | username" in red
- The builders list still works - you can see who's building and player count
- The notification hides when you enter gameplay (pointer locked) and reappears in menu
- **To regain full control**: Close the other session/device where you're playing
- This prevents accidental conflicts and data loss from multi-device usage

### Understanding the World

1. **Procedural Generation**

   - The world is generated using Perlin noise algorithms
   - Every player sees the same terrain because the server provides seeds
   - Terrain includes:
     - **Grass blocks** on the surface (green with grass texture on top)
     - **Dirt blocks** underground
     - **Stone regions** deep underground and in certain areas
     - **Coal ore** scattered underground
     - **Sand** in low-lying areas (underwater)
     - **Trees** with logs and leaves on the surface
     - **Bedrock** at y=0 (unbreakable bottom layer)
   - Only player modifications (placed/removed blocks) are stored on the server
   - The rest regenerates procedurally using the same seeds

2. **Visual Atmosphere**

   - **Sky**: Light blue sky with white clouds at y=80
   - **Fog**: Distance fog creates atmospheric depth (adjusts with render distance)
   - **Lighting**: Directional lighting simulates sunlight
   - **Block Textures**: Each block type has unique textures (grass, stone, wood, etc.)
   - **Player Entities**: Other players appear as colored block characters with nametags
   - **Highlighting**: Selected blocks glow green when clicking builder names

3. **Chunks and Regions**

   - The world is divided into **chunks** (24×24 blocks)
   - Chunks are grouped into **regions** (15×15 chunks = 360×360 blocks)
   - As you move, new chunks generate automatically
   - The builders list shows players who built in your current region
   - Regional broadcasting ensures you only receive updates from nearby players

4. **Infinite World**
   - The world extends infinitely in all horizontal directions
   - Walk in any direction and new terrain generates
   - Dig down and new blocks generate beneath (until bedrock at y=0)
   - Your render distance setting controls how far you can see
   - The game uses Web Workers to generate terrain without freezing

---

## 🏗️ Technical Architecture

BlockRift uses a sophisticated client-server architecture optimized for Reddit's Devvit platform:

- **Client**: Three.js for 3D rendering, Web Workers for terrain generation, InstancedMesh for performance
- **Server**: Express with Redis for data persistence and pub/sub (mock server for local dev), Devvit for production
- **Communication**: HTTP POST for client→server, WebSocket/Realtime API for server→client broadcasts
- **Data Storage**: Redis with chunk-based storage (one hash per 24×24 chunk)
- **Multiplayer**: Regional channel system (15×15 chunks per region) for efficient broadcasting
- **Friendship**: Global Redis hashes (`friends` and `friendedBy`) for instant permission checks
- **Conflict Resolution**: Timestamp-based with server authority
- **Player Count**: In-memory tracking with real-time broadcasts via game-level channel
- **Chat**: Fire-and-forget HTTP POST with broadcast to game-level channel
- **Block Types**: 12 total block types (grass, sand, tree, leaf, dirt, stone, coal, wood, diamond, quartz, glass, bedrock)
- **Physics**: Realistic gravity, 6-directional collision detection with wall sliding, jumping, and sneaking in walking mode
- **Rendering**: InstancedMesh for efficient rendering of thousands of blocks, fog for atmosphere, directional lighting
- **Controls**: Automatic detection of sandboxed environments with fallback to alternative controls (middle mouse button for camera)
- **Asset Loading**: Preloading system with retry logic for images and fonts, ensuring reliable startup
- **Error Handling**: Graceful error modals for connection and authentication failures with retry functionality

For detailed technical documentation, see the architecture guides in `.kiro/steering/`.

---

## 🚀 Development

### Prerequisites

- Node.js v18+ (v22.2.0+ recommended for production deployment)
- Redis running locally on port 6379 (for local development)
- Devvit CLI installed (`npm install -g devvit`)

### Local Development

```bash
# Install dependencies
npm install

# Run development server (client + server + devvit in parallel)
npm run dev

# Run local development without Devvit (client + mock server only)
npm run dev:local

# Build for production
npm run build

# Build for local testing
npm run build:local

# Deploy to Reddit
npm run deploy

# Publish for review
npm run launch

# Type checking
npm run lint

# Run tests
npm run test
```

### Project Structure

```
src/
├── client/              # Three.js game client (browser)
│   ├── assets/          # Textures, sounds, music, fonts
│   ├── terrain/         # Procedural generation (noise, worker)
│   ├── mesh/            # 3D geometry and materials
│   ├── core/            # Core systems (scene, controls, physics)
│   ├── player/          # Player modes and rendering
│   ├── state/           # Multiplayer state management
│   ├── ui/              # UI components (chat, hotbar, builders list)
│   ├── upvote/          # Upvote system
│   ├── realtime/        # Realtime communication wrapper
│   ├── utils/           # Utility functions and endpoints
│   └── main.ts          # Entry point
├── server/              # Server implementation
│   ├── mock/            # Mock server for local dev (Express + Redis)
│   ├── reddit/          # Production Devvit server
│   └── index.ts         # Conditional server loader
└── shared/              # Shared types and constants
```

---

## 📝 License

AGPLv3 License - See LICENSE file for details

---

## 🎨 Credits

- Built with [Three.js](https://threejs.org/) for 3D rendering
- Powered by [Reddit's Devvit Platform](https://developers.reddit.com/)
- Textures inspired by Minecraft

---

## 🐛 Known Issues

- Mobile performance may vary on older devices
- Very large render distances (7-8 chunks) can cause lag
- Chat messages are not persisted (only visible while online)

---

## 🔮 Roadmap

- [ ] More block types (colored blocks, transparent blocks)
- [ ] Inventory system with resource gathering
- [ ] Day/night cycle
- [ ] Weather effects
- [ ] Mob spawning
- [ ] Crafting system
- [ ] Achievements and progression

---

**Ready to build? Click "Play" and start creating!** 🎮✨
