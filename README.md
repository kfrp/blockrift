# BlockRift

**A multiplayer voxel sandbox game built with Three.js, running natively on Reddit's Devvit platform.**

BlockRift is a browser-based multi-player sandbox game where you can create, destroy, and explore an infinite procedurally-generated world alongside other Reddit users in real-time. Play directly from Reddit posts with no downloads required - your Reddit username is your in-game identity.

The game spawns you high above the terrain so you can survey the procedurally-generated landscape before descending to start building. You'll see flowering trees with stripped oak log textures, grass plains with vibrant lime concrete powder texture on top, stone regions, coal ore deposits, and other players moving around as snoo-inspired voxel characters with floating nametags above their heads.

### Core Gameplay

- **Build and destroy blocks** in an infinite 3D world with 8 different block types in your hotbar (wood planks, glass, grass, stone, wood planks, diamond ore, quartz, coal ore and more)
- **Explore procedurally-generated terrain**  
- **Dig infinitely deep** - new blocks generate beneath removed ones until you hit bedrock at y=0 (unbreakable bottom layer)

### Multiplayer Features

- **Collaborate with other players** in real-time - see them move, build, and chat as colored block characters with nametags floating above their heads
- **Make friends** to enable collaborative building permissions across all worlds - friends can remove each other's blocks globally
- **Chat with other players** using the built-in chat system (press C to open, type message, Enter to send)
- **Upvote builders** to show appreciation for impressive creations - each player can upvote once per builder
- **Highlight builds** by clicking builder names to see all their blocks highlighted in green - great for learning building techniques
- **Track online players** - see how many players are currently in your level and who's building in your region

### Technical Features 

The game features smooth 60 FPS gameplay powered by three.js, real-time multiplayer synchronization via WebSocket, persistent world state stored in Redis, and an intuitive drag-based control system that works perfectly in Reddit's sandboxed iframe environment without requiring pointer lock.

BlockRift combines the creative freedom of voxel building games with Reddit's social platform, enabling seamless multiplayer collaboration where your creations persist and can be explored by the entire community. Your Reddit username is your in-game identity, and your position coordinates (X, Z) are displayed in the top-right corner to help you navigate and share locations with other players.

---

## 🌟 What Makes BlockRift Innovative?

### 1. **Reddit-Native Gaming**

BlockRift runs entirely within Reddit posts using Devvit's webview technology. No external websites, no downloads - just click "Play" on a Reddit post and start building. Your Reddit username is your in-game identity, and your creations are instantly accessible to the entire Reddit community.

**How it works:**

- Game appears as a post on Reddit with a "Launch App" button
- Click to open the game in full-screen webview
- All assets (textures, sounds, music) load automatically with retry logic
- Connection to game server happens seamlessly in the background
- Your Reddit authentication is handled automatically by Devvit

### 2. **Intelligent Drag-Based Controls Without Pointer Lock**

BlockRift features a sophisticated mouse control system that works perfectly in Reddit's sandboxed iframe environment without requiring pointer lock. The game intelligently distinguishes between camera rotation and block interaction:

- **Left-click + drag**: Rotates the camera smoothly (if you move your mouse more than 3 pixels while holding the button)
- **Left-click without drag**: Breaks blocks instantly (clean click without mouse movement)
- **Right-click**: Places blocks (always works, independent of camera movement)

This intelligent detection uses a 3-pixel drag threshold and timing analysis to provide intuitive controls that work seamlessly without pointer lock. The system ensures you never accidentally break blocks while rotating the camera, and you never accidentally rotate the camera when trying to break blocks.

**Technical Implementation:**

- Custom `CameraController` class manipulates camera quaternion directly via Euler angles
- Tracks mouse down position and movement to distinguish drag from click
- Uses capture-phase event listeners to intercept events before block interaction handlers
- Shows helpful notification on first activation: "Drag to look around | Click to break | Right-click to place | Shift to sneak"
- Inverts drag direction so dragging right moves the world right (camera left) for natural feel
- Works universally across all environments without requiring special permissions
- `isDraggingCamera` flag prevents block interactions during camera drags
- Mouse position tracked in normalized device coordinates for raycasting

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

When you remove a block, new blocks generate beneath it automatically. Dig as deep as you want - the world generates infinitely downward until you hit bedrock at y=0. The procedural generation ensures consistent terrain across all clients using server-provided seeds. The `generateAdjacentBlocks()` function creates blocks in all 6 directions around removed blocks, filling in the space with appropriate block types (stone, dirt, or sand) based on depth and terrain noise. This enables true underground exploration and mining gameplay.

### 9. **Real-Time Chat System**

Press C to open the chat input and communicate with other players in your level. Type your message (up to 200 characters) and press Enter to send. Messages appear in the bottom-left corner with usernames and are broadcast to all players in the same world. Chat is disabled in Viewer Mode.

### 10. **Builder Recognition System**

See who's building in your region with the builders list (top-left corner). Click on a builder's name to highlight all their blocks in green. Upvote builders to show appreciation for their creations - upvotes are tracked globally and contribute to a leaderboard system.

### 11. **Smart Spawn Positioning**

When you join a level, the server calculates a smart spawn position that avoids placing you on top of other players or existing structures. It tries 25 positions in a spiral pattern to find an unoccupied spot, ensuring a smooth entry experience. If you've played before, you'll spawn at your last known position, allowing you to continue where you left off.

### 12. **Advanced Collision System with Wall Sliding**

The game features a sophisticated collision detection system with 6-directional raycasting (front, back, left, right, up, down). When you collide with walls at an angle, the system allows you to slide along them smoothly rather than stopping completely. This creates natural movement that feels responsive and intuitive - you can strafe along walls and navigate tight spaces effortlessly.

The collision system uses a temporary instanced mesh (100 instances max) that's rebuilt each frame with only nearby blocks that could collide with the player. This approach is far more efficient than raycasting against all terrain blocks. The system checks collisions at both head level and feet level to ensure accurate detection.

**Special collision behaviors:**

- **Builder mode**: Adds invisible collision blocks at edges to prevent falling off - you can't fall while sneaking, perfect for building on high structures
- **Jumping**: Temporarily adjusts downward collision distance during jump start to prevent false ground detection
- **Wall sliding**: Complex angle-based logic (over 200 lines of code) allows smooth sliding along walls when moving at angles - calculates camera direction and applies partial movement perpendicular to walls
- **Procedural integration**: Checks both procedurally generated terrain and custom placed/removed blocks
- **Tree collision**: Detects tree logs and prevents walking through them
- **Safety net**: If you fall below y=-100, you're teleported back to y=60 automatically

**Technical Details:**

- Raycaster distances: 1.2 units up (ceiling), 2.8 units down (ground), 0.5 units horizontal (walls)
- Player body dimensions: 2.8 units tall, 0.5 units wide
- Collision mesh rebuilt every frame with only nearby blocks for optimal performance
- Checks both camera position (head) and camera position - 1 (feet) for accurate detection
- Gravity acceleration: 25 units/second² with terminal velocity cap at 38.4 units/second
- Walking speed: 6.612 units/second, Flying speed: 21.78 units/second, Sneaking speed: 2.55 units/second

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

### 15. **Universal Drag-Based Camera System**

BlockRift is designed to work perfectly in Reddit's sandboxed iframe environment without requiring pointer lock. The game uses a drag-based camera control system that works universally across all environments.

**Camera Control System:**

- Uses a custom `CameraController` class that manipulates camera quaternion directly via Euler angles
- Tracks mouse down position and movement to distinguish drag from click
- Implements a 3-pixel drag threshold to prevent accidental camera rotation during clicks
- Uses capture-phase event listeners to intercept events before block interaction handlers
- Shows a helpful notification on first activation: "Drag to look around | Click to break | Right-click to place | Shift to sneak"
- Inverts drag direction so dragging right moves the world right (camera left) for natural feel

**Why This Matters:**

- Reddit's iframe environment doesn't support pointer lock API
- Traditional Minecraft-style controls (PointerLockControls) don't work in sandboxed environments
- BlockRift's drag-based system works everywhere without requiring special permissions
- No need for fallback modes or compatibility checks - one control system works universally
- Provides smooth, intuitive camera control that feels natural on both desktop and mobile

### 16. **Chat System**

Press C to open the chat input and communicate with other players in your level. Type your message (up to 200 characters) and press Enter to send. Messages appear in the bottom-left corner with usernames and are broadcast to all players in the same world. Chat is disabled in Viewer Mode.

---

---

## 🎯 How to Play

### Getting Started

1. **Launch the Game**

   - Find a BlockRift post on Reddit
   - Click the "Play" button on the splash screen
   - **Loading Phase**: A loading screen appears with animated bouncing blocks while assets load:
     - Textures (grass, stone, wood, diamond, etc.)
     - Fonts (PressStart2P for retro UI)
     - Sounds (block placement/breaking effects)
     - Music (background atmospheric music)
     - All assets use retry logic (3 attempts) for reliability
   - **Connection Phase**: A "Connecting..." loading bar appears while establishing connection:
     - HTTP POST to `/api/connect` endpoint
     - Server checks if you're already connected (multi-device detection)
     - If already connected → Viewer Mode (read-only)
     - If not connected → Player Mode (full access)
   - **Data Fetching**: The server sends initial game state:
     - Terrain seeds (ensures everyone sees the same world - deterministic procedural generation)
     - Smart spawn position (your last location from `lastKnownPosition` or an unoccupied spot near default spawn using spiral pattern algorithm)
     - Initial chunks around your spawn position (draw distance of 3 chunks = ~25 chunks loaded)
     - Player data (score, global friends list from `friends` hash, friendedBy list from `friendedBy` hash)
     - Other active players in the level (if any)
     - Player count for the level (from in-memory Map)
   - **Terrain Generation**: The terrain generates around your spawn position:
     - Uses server-provided seeds with Perlin noise
     - Runs in a Web Worker (non-blocking, maintains 60 FPS)
     - Generates grass, trees, stone regions, coal ore, sand
     - Custom blocks (placed/removed by players) applied on top
   - **Spawn**: You'll spawn high above the terrain (at y=50) with a bird's-eye view:
     - Look down to see grass, trees, stone regions, and coal ore spreading out below you
     - Your Reddit username and coordinates (X, Z) appear in the top-right corner
     - Other players appear as colored block characters with nametags above their heads
     - Press Space to start descending (or Q to toggle flying mode for more control)
   - **Error Handling**:
     - If connection fails, an error modal appears with a "Retry" button
     - If authentication fails (no username in response), an error modal appears explaining the issue
   - **Controls**: The game uses drag-based camera controls that work universally without pointer lock

2. **Basic Controls (Desktop)**

   **Camera Control:**

   - **Left Click + Drag** - Look around (camera control)
     - Drag your mouse while holding left button to rotate the camera
     - The game intelligently detects drag vs click using a 3-pixel threshold
     - If you move your mouse more than 3 pixels while holding the left button → camera rotates
     - If you click without moving → breaks blocks
     - Camera rotation is inverted so dragging right moves the world right (camera left) for natural feel
     - Uses custom `CameraController` class with quaternion manipulation via Euler angles
     - A helpful notification appears when you first activate the camera: "Drag to look around | Click to break | Right-click to place | Shift to sneak"
     - No pointer lock required - works perfectly in Reddit's sandboxed iframe environment
     - `isDraggingCamera` flag prevents block interactions during camera drags
     - Capture-phase event listeners ensure camera drag detection happens before block interaction

   **Movement:**

   - **WASD** - Move forward/backward/left/right
     - Forward/backward velocity: `velocity.x` (positive = forward, negative = backward)
     - Left/right velocity: `velocity.z` (positive = right, negative = left)
     - Movement speed: 6.612 units/second (walking), 2.55 units/second (builder mode)
   - **Space** - Jump
     - Jump: applies upward velocity of 8 units/second
     - Hold Space for continuous jumping (10ms interval)
   - **Shift** - Builder mode
     - Builder: slower movement (2.55 units/second), prevents falling off edges
     - Camera lowers by 0.2 units for visual feedback
     - Cannot jump in builder mode


   **Building:**

   - **Left Click** - Destroy block (click without dragging)
     - The game intelligently detects if you're rotating the camera vs breaking blocks
     - Uses raycasting with 8-unit reach distance against actual InstancedMesh objects
     - Block shrinks with animation before disappearing
     - Sound effect plays based on block type
     - Hold for continuous breaking (333ms intervals, only if not dragging camera)
   - **Right Click** - Place block
     - Places block adjacent to clicked face (uses face normal)
     - Cannot place inside player position (checks both head and feet)
     - Sound effect plays on placement
     - Hold for continuous placing (333ms intervals)
   - **Mouse Wheel / Number Keys (1-8)** - Select block type from hotbar
     - Hotbar shows 8 block types: wood, glass, grass, stone, tree, diamond, quartz, coal
     - Selected block highlighted with white border (2px solid white with 1px outline)
     - Mouse wheel has 100ms debounce to prevent accidental scrolling
     - Bag UI updates automatically via `bag.updateSelection(holdingIndex)`
   - **Tip**: The game prevents accidental block breaking during camera drags - if you're dragging to look around (moved more than 3 pixels), block interactions are ignored. This intelligent click detection ensures smooth gameplay without requiring pointer lock.
   - **Permission System**:
     - You can always break your own blocks
     - You can break blocks placed by players who added you as a friend (checks `friendedBy` array)
     - You cannot break blocks placed by other players (unless they're your friend)
     - Attempting to break protected blocks shows an error notification in bottom-right corner
     - Bedrock (y=0) cannot be broken by anyone

   **Communication:**

   - **C** - Open chat input
     - Type message (max 200 characters) and press Enter to send
     - Press Escape to cancel without sending
     - Messages broadcast to all players in your level via `game:{level}` channel
     - Chat disabled in Viewer Mode
     - All keyboard input goes to chat when active (except Escape)
   - **F** - Toggle friends list (when menu is open)

   **Menu:**

   - **E** - Open/close menu (pause game)
     - Music pauses when menu is open
     - Shows Play, Guide, Settings buttons
   - **F** - Toggle fullscreen (lowercase 'f')

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
     1. **Wood Planks** - Mangrove plank texture, great for building structures
     2. **Glass** - Light gray stained glass, transparent blocks for windows (semi-transparent with 70% opacity)
     3. **Grass** - Blocks with vibrant lime concrete powder texture on top and grass texture on sides
     4. **Stone** - Gray stone blocks, common underground
     5. **Tree Logs** - Stripped oak log texture on sides with oak log top texture on top/bottom
     6. **Diamond Ore** - Deepslate diamond ore texture, rare blue ore blocks for decoration
     7. **Quartz** - Quartz brick texture, white decorative blocks
     8. **Coal Ore** - Coal ore texture, dark ore blocks found underground
   - Additional blocks exist in the world but aren't in the hotbar:
     - **Sand** - Suspicious sand texture, found in low-lying areas (underwater)
     - **Dirt** - Coarse dirt texture, underground beneath grass
     - **Leaves** - Flowering azalea leaves texture, part of trees (transparent)
     - **Bedrock** - Bedrock texture, unbreakable bottom layer at y=0

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
     - **Players Online**: Total number of players currently in this level (updates in real-time, displayed above the list)
     - **Builders**: Number of unique players who have built in your current region (15×15 chunks, shown in collapsible header)
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

### UI Elements

**Hotbar** (Bottom Center):

- Shows 8 block types you can place
- Selected block is highlighted with white border (2px solid white with 1px outline)
- Use number keys 1-8 or mouse wheel to select
- Each slot displays a 40×40px icon of the block type

**Block Highlighting** (Mouse Cursor):

- Blocks are highlighted when you hover your mouse over them
- The highlighted block is shown with a translucent overlay (25% opacity, slightly larger at 1.01×1.01×1.01 to prevent z-fighting)
- Highlighting uses raycasting with 8-unit maximum reach distance
- Raycasts directly against the actual rendered terrain meshes (InstancedMesh objects)
- Precise targeting for building - the highlight shows exactly which block you'll interact with
- The highlight system is updated every frame in the render loop
- Works with transparent blocks (glass) by setting intersectTransparent flag

**Username & Position** (Top Right):

- Your Reddit username
- Current coordinates (X, Z)
- In Viewer Mode, shows "VIEWER | username" in red

**Builders List** (Top Left):

- Shows "Players Online" count above the list (total players in level, in green)
- Shows "Builders" count in collapsible header (unique builders in your region)
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

- **First spawn**: You'll spawn high in the sky (y=50) with a panoramic view - look around to survey the landscape, then press Space to descend or Q to toggle flying mode for controlled descent
- **Start small**: Build a simple structure to get familiar with drag-based camera controls before attempting large projects
- **Use flying mode**: Press Q to toggle flying (Speed.flying = 21.78 units/second) - it's much easier for building tall structures or exploring
- **Camera control**: Left-click and drag to look around - the game prevents block breaking while you're dragging (3-pixel threshold with capture-phase event listeners)
- **Breaking blocks**: Click without dragging to break blocks - the game intelligently distinguishes between camera rotation and block interaction using mouse movement tracking
- **Make friends**: Add other builders as friends to collaborate on projects and modify each other's builds globally across all levels
- **Explore**: The world is infinite - walk in any direction to discover new terrain, trees, stone regions, coal ore, and sand in low-lying areas
- **Check the builders list**: Click the header in the top-left to expand and see who's online (player count) and building in your region (15×15 chunks = 360×360 blocks)
- **Dig deep**: Remove blocks to explore underground - new blocks generate beneath automatically (generateAdjacentBlocks function) until you hit bedrock at y=0
- **Bedrock is unbreakable**: The bottom layer (y=0) prevents falling into the void - you can't break it (BlockType.bedrock check in control.ts)
- **Watch the highlight**: Blocks are highlighted with a translucent overlay (25% opacity, 1.01×1.01×1.01 size) when you hover over them - raycasts against actual InstancedMesh objects
- **Continuous actions**: Hold left-click to continuously break blocks (without dragging, 333ms interval), hold right-click to continuously place (same interval)
- **Chat with others**: Press C to open chat input, type message (max 200 characters), press Enter to send to all players in your level via game-level channel
- **Highlight to learn**: Click builder names in the list to see their blocks highlighted in green (BuilderRecognitionManager) - great for learning techniques
- **Upvote good builds**: Show appreciation by upvoting builders (one-time per builder, tracked globally with totalUpvotesGiven/Received counters)
- **Watch your permissions**: You can only break blocks you placed or blocks from players who added you as a friend (friendedBy array check)
- **Spawn position persists**: When you disconnect and rejoin, you'll spawn at your last known position (saved in lastKnownPosition field on disconnect)
- **Smooth wall sliding**: When you hit walls at an angle, the collision system lets you slide along them naturally using complex angle-based calculations (over 200 lines of collision logic)
- **Expand builders list**: The builders list starts collapsed - click the header to expand and see all builders in your region with friend/upvote buttons
- **Safety net**: If you somehow fall below y=-100, you'll be teleported back to y=60 automatically (safety check in control.ts update loop)
- **Builder mode for precision**: Use Shift to enter sneak mode (Speed.sneaking = 2.55 units/second) - you'll move slower but won't fall off edges (invisible collision blocks added at edges)


### Understanding the World

1. **Procedural Generation**

   - The world is generated using Perlin noise algorithms
   - Every player sees the same terrain because the server provides seeds
   - Terrain includes:
     - **Grass blocks** on the surface (vibrant lime concrete powder texture on top, grass texture on sides)
     - **Dirt blocks** underground (coarse dirt texture)
     - **Stone regions** deep underground and in certain areas (stone texture)
     - **Coal ore** scattered underground (coal ore texture)
     - **Sand** in low-lying areas (suspicious sand texture, underwater)
     - **Trees** with stripped oak logs and flowering azalea leaves on the surface
     - **Bedrock** at y=0 (bedrock texture, unbreakable bottom layer)
   - Only player modifications (placed/removed blocks) are stored on the server
   - The rest regenerates procedurally using the same seeds

2. **Position Persistence**

   - Your position is automatically saved when you disconnect or close the browser
   - When you reconnect, you'll spawn at your last known location
   - This allows you to continue building where you left off
   - If you disconnect unexpectedly, the smart spawn system finds a safe nearby location

3. **Visual Atmosphere**

   - **Sky**: Light blue sky with white clouds at y=80
   - **Fog**: Distance fog creates atmospheric depth (adjusts with render distance)
   - **Lighting**: Directional lighting simulates sunlight
   - **Block Textures**: Each block type has unique textures (grass, stone, wood, etc.)
   - **Player Entities**: Other players appear as colored block characters with nametags
   - **Highlighting**: Selected blocks glow green when clicking builder names

4. **Chunks and Regions**

   - The world is divided into **chunks** (24×24 blocks)
   - Chunks are grouped into **regions** (15×15 chunks = 360×360 blocks)
   - As you move, new chunks generate automatically
   - The builders list shows players who built in your current region
   - Regional broadcasting ensures you only receive updates from nearby players

5. **Infinite World**

   - The world extends infinitely in all horizontal directions
   - Walk in any direction and new terrain generates procedurally using Perlin noise
   - Dig down and new blocks generate beneath (generateAdjacentBlocks function) until bedrock at y=0
   - Render distance fixed at 3 chunks (72 blocks) for optimal performance
   - The game uses Web Workers to generate terrain without freezing the main thread
   - Your position is saved automatically when you disconnect (lastKnownPosition field), so you can continue where you left off

---

## 🏗️ Technical Architecture

BlockRift uses a sophisticated client-server architecture optimized for Reddit's Devvit platform:

- **Client**: Three.js (r152) for 3D rendering, Web Workers for terrain generation, InstancedMesh for performance
- **Server**: Express with Redis for data persistence and pub/sub (mock server for local dev), Devvit for production
- **Communication**: HTTP POST for client→server, WebSocket/Realtime API for server→client broadcasts
- **Data Storage**: Redis with chunk-based storage (one hash per 24×24 chunk, key format: `level:{level}:chunk:{chunkX}:{chunkZ}`)
- **Multiplayer**: Regional channel system (15×15 chunks per region = 360×360 blocks) for efficient broadcasting
- **Friendship**: Global Redis hashes (`friends` and `friendedBy`) for instant O(1) permission checks
- **Conflict Resolution**: Timestamp-based with server authority (serverTimestamp >= localTimestamp)
- **Player Count**: In-memory tracking (Map<level, count>) with real-time broadcasts via game-level channel
- **Chat**: Fire-and-forget HTTP POST with broadcast to game-level channel (`game:{level}`)
- **Block Types**: 12 total block types (grass, sand, tree, leaf, dirt, stone, coal, wood, diamond, quartz, glass, bedrock)
- **Physics**: Realistic gravity (25 units/s² acceleration, 38.4 units/s terminal velocity), 6-directional collision detection with wall sliding (200+ lines of angle-based logic), jumping (8 units/s initial velocity), and sneaking (2.55 units/s speed)
- **Rendering**: InstancedMesh for efficient rendering of thousands of blocks (one mesh per block type), fog for atmosphere (THREE.Fog), directional lighting (THREE.DirectionalLight)
- **Controls**: Drag-based camera system without pointer lock (CameraController class with quaternion manipulation), 3-pixel drag threshold, capture-phase event listeners
- **Asset Loading**: LoadingManager class with AssetLoader for preloading textures, fonts, sounds, and music with retry logic
- **Error Handling**: Graceful error modals for connection and authentication failures with retry functionality
- **Terrain Generation**: Perlin noise (Noise class) with deterministic seeds from server, Web Worker for non-blocking generation
- **Position Updates**: Chunk-based throttling (ChunkBasedPositionManager) - only sends when crossing chunk boundaries or after 500ms of no movement
- **Block Modifications**: Batched with 1-second debounce or immediate send at 100 modifications (ChunkStateManager)
- **Highlighting**: Raycasts against actual InstancedMesh objects (BlockHighlight class) with 8-unit reach distance

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
- Render distance settings are currently disabled in the UI (fixed at 3 chunks for optimal performance)

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
