# Design Document: Sandbox game

## Overview

This document outlines the technical design for a responsive voxel-based game built with TypeScript and Babylon.js. The game implements a sandbox-style experience with block placement/removal, world generation, and cross-platform controls (desktop and mobile). The architecture prioritizes performance through mesh optimization, chunk-based rendering, and is designed to support future multiplayer functionality.

### Technology Stack

- **TypeScript**: Type-safe development
- **Babylon.js**: 3D rendering engine with WebGL support
- **Vite**: Fast build tool and dev server
- **Babylon.js GUI**: In-canvas UI system (alternative: HTML5/CSS3 overlay)

### Key Design Principles

1. **Separation of Concerns**: Game logic, rendering, and state management are decoupled
2. **Performance First**: Mesh optimization, instancing, and culling are core features
3. **Extensibility**: Block types and world generation are data-driven
4. **Multiplayer Ready**: State management supports serialization and synchronization
5. **Centralized State**: Game state managed through a centralized store pattern for predictable updates

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Game Application                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  UI Layer    │  │ Input System │  │  Menu System    │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Game Manager │  │ Config System│  │  Event System   │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Player     │  │    World     │  │ Block Registry  │  │
│  │  Controller  │  │   Manager    │  │                 │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Chunk      │  │    Mesh      │  │   Raycast       │  │
│  │   System     │  │  Optimizer   │  │   System        │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Babylon.js  │  │   Renderer   │  │  Scene Manager  │  │
│  │   Engine     │  │              │  │                 │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Module Breakdown

#### 1. Core Systems

**Game Manager**

- Orchestrates game lifecycle (init, start, pause, resume, stop)
- Manages game state transitions
- Coordinates between subsystems
- Handles configuration loading

**Configuration System**

- Loads and validates game configuration
- Provides typed access to settings (player speed, block size, render distance, etc.)
- Supports runtime configuration for experimentation

**Event System**

- Pub/sub pattern for decoupled communication
- Events: BlockPlaced, BlockRemoved, PlayerMoved, ChunkLoaded, etc.
- Enables multiplayer-ready architecture

#### 2. World Management

**World Manager**

- Manages the overall world state
- Coordinates chunk loading/unloading
- Maintains world metadata (seed, dimensions, etc.)
- Provides world query interface
- Handles world persistence (save/load to IndexedDB)

**Chunk System**

- Divides world into 16x16x16 (configurable) chunks
- Loads/unloads chunks based on player position
- Manages chunk state (empty, generating, ready, unloading)
- Implements chunk pooling for memory efficiency

**Block Registry**

- Central registry of all block types
- Loads block definitions from JSON/TypeScript configs
- Provides block metadata (textures, properties, behavior)
- Supports dynamic block type registration

#### 3. Rendering & Optimization

**Mesh Optimizer**

- Implements greedy meshing algorithm
- Combines adjacent identical blocks into unified meshes
- Performs face culling (hidden faces not rendered)
- Generates optimized geometry per chunk

**Renderer**

- Manages Babylon.js scene and camera
- Implements frustum culling
- Handles material and texture management
- Supports instanced rendering for repeated geometries

**Scene Manager**

- Initializes Babylon.js engine and scene
- Manages lighting (ambient, directional sun)
- Handles skybox and atmospheric effects
- Manages render loop and frame timing

#### 4. Player & Input

**Player Controller**

- Manages player position, velocity, and state
- Implements custom AABB (Axis-Aligned Bounding Box) collision detection against voxel grid
- Applies gravity and handles jumping physics
- Handles camera control (first-person view)
- Enforces movement constraints

**Input System**

- Abstracts input across desktop and mobile
- Desktop: Keyboard (WASD, Space, Esc, 1-9), Mouse (movement, clicks)
- Mobile: Touch (camera), Virtual joystick, Touch menu
- Provides unified input events to game logic

**Raycast System**

- Performs raycasting from camera center
- Identifies target block and adjacent placement position
- Calculates interaction range
- Updates crosshair visual feedback

#### 5. UI & Menus

**Menu System**

- Main menu (Start, Instructions, Options)
- Pause menu (Resume, Options, Quit)
- Manages menu state and transitions
- Handles menu input separately from game input

**UI Layer**

- Crosshair rendering (2D overlay)
- Block selection indicator
- Mobile controls (joystick, mode toggle, block menu)
- HUD elements (selected block, FPS counter)
- Uses Babylon.js GUI for in-canvas rendering (simplifies input handling and scaling)

#### 6. World Generation

**World Generator**

- Procedural terrain generation using noise functions (Perlin/Simplex)
- Generates base terrain (grass, dirt, stone layers)
- Places features (trees, roads, clouds)
- Supports pre-generated world loading
- Ensures terrain continuity (no voids beneath player)

## Components and Interfaces

### Block System

#### BlockType Interface

```typescript
interface BlockType {
  id: string; // Unique identifier (e.g., "grass", "stone")
  name: string; // Display name
  textures: {
    // Texture paths for each face
    top: string;
    bottom: string;
    sides: string;
  };
  solid: boolean; // Can player collide with it?
  transparent: boolean; // Does it allow light through?
  breakable: boolean; // Can it be removed?
  metadata?: Record<string, any>; // Extensible properties
}
```

#### Block Data Structure

```typescript
interface Block {
  typeId: string; // Reference to BlockType
  position: Vector3Int; // World position (x, y, z)
  metadata?: any; // Instance-specific data
}
```

### Chunk System

#### Chunk Interface

```typescript
interface Chunk {
  position: Vector3Int; // Chunk coordinates
  blocks: Uint16Array; // Flattened 3D array of block type IDs
  mesh: Mesh | null; // Babylon.js mesh (null if not generated)
  state: ChunkState; // empty | generating | ready | unloading
  dirty: boolean; // Needs mesh regeneration?
}

enum ChunkState {
  Empty,
  Generating,
  Ready,
  Unloading,
}
```

#### Chunk Manager Interface

```typescript
interface ChunkManager {
  loadChunk(position: Vector3Int): Promise<Chunk>;
  unloadChunk(position: Vector3Int): void;
  getChunk(position: Vector3Int): Chunk | null;
  updateChunks(playerPosition: Vector3): void;
  getBlock(worldPosition: Vector3Int): Block | null;
  setBlock(worldPosition: Vector3Int, typeId: string): void;
  removeBlock(worldPosition: Vector3Int): void;
}
```

### Player System

#### Player Interface

```typescript
interface Player {
  position: Vector3; // World position
  velocity: Vector3; // Current velocity
  rotation: Vector2; // Yaw and pitch
  selectedBlockId: string; // Currently selected block type
  isGrounded: boolean; // Touching ground?
  isFalling: boolean; // In free fall?
}

interface PlayerController {
  update(deltaTime: number): void;
  move(direction: Vector3): void;
  jump(): void;
  rotate(delta: Vector2): void;
  selectBlock(blockId: string): void;
}
```

### Input System

#### Input Interface

```typescript
interface InputState {
  movement: Vector2; // WASD or joystick input
  jump: boolean;
  interact: InteractType; // place | remove | none
  blockSelect: number | null; // 1-9 key or null
  menuToggle: boolean; // ESC pressed
  pointerDelta: Vector2; // Mouse/touch movement
  pointerPosition: Vector2; // Touch position for block interaction
}

enum InteractType {
  None,
  Place,
  Remove,
}

interface InputManager {
  getInputState(): InputState;
  update(): void;
  setMobileMode(enabled: boolean): void;
}
```

### Configuration

#### GameConfig Interface

```typescript
interface GameConfig {
  player: {
    moveSpeed: number; // Units per second
    jumpHeight: number; // Jump velocity
    cameraSensitivity: number;
    interactionRange: number; // Max block interaction distance
  };
  world: {
    blockSize: number; // Size of each block
    chunkSize: number; // Blocks per chunk dimension
    renderDistance: number; // Chunks to render around player
    seed: number; // World generation seed
  };
  rendering: {
    targetFPS: number;
    enableGreedyMeshing: boolean;
    enableInstancing: boolean;
    enableFaceCulling: boolean;
  };
  controls: {
    invertY: boolean;
    touchJoystickSize: number;
  };
}
```

## State Management

### Centralized State Store

The game uses a centralized state management pattern to ensure predictable state updates and facilitate multiplayer synchronization.

**State Structure:**

```typescript
interface GameState {
  world: {
    chunks: Map<string, Chunk>; // Key: "x,y,z" chunk coordinates
    seed: number;
    modified: Set<string>; // Track modified chunks for saving
  };
  player: Player;
  ui: {
    menuOpen: boolean;
    selectedBlockId: string;
    mobileMode: boolean;
  };
  config: GameConfig;
}
```

**State Updates:**

- All state changes go through action dispatchers
- Actions are serializable for network transmission
- State updates trigger relevant system updates (e.g., chunk dirty flag)
- Immutable update pattern for predictable state changes

### World Persistence

**Save System:**

- Modified chunks are tracked in `world.modified` set
- On save, serialize modified chunks and player state to JSON
- Store in browser's IndexedDB for client-side persistence
- Compress chunk data using run-length encoding for efficiency

**Load System:**

- Check IndexedDB for existing save on game start
- Load player state and modified chunks
- Generate missing chunks procedurally using world seed
- Merge saved chunks with procedural generation

**Save Format:**

```typescript
interface SaveData {
  version: string;
  timestamp: number;
  seed: number;
  player: Player;
  modifiedChunks: Array<{
    position: Vector3Int;
    blocks: number[]; // Compressed block data
  }>;
}
```

## Data Models

### World Data Structure

The world is represented as a collection of chunks, each containing a 3D grid of blocks.

**Coordinate Systems:**

- **World Coordinates**: Absolute position in the world (floating point)
- **Block Coordinates**: Integer grid position (x, y, z)
- **Chunk Coordinates**: Chunk position (chunkX, chunkY, chunkZ)
- **Local Coordinates**: Position within a chunk (0-15 for 16x16x16 chunks)

**Conversion:**

```
chunkCoord = floor(blockCoord / chunkSize)
localCoord = blockCoord % chunkSize
blockCoord = chunkCoord * chunkSize + localCoord
```

### Block Storage

Blocks within a chunk are stored in a flat Uint16Array for memory efficiency:

```
index = x + y * chunkSize + z * chunkSize * chunkSize
```

Value 0 represents air (empty), values 1-65535 represent block type IDs.

### Mesh Generation

For each chunk, the mesh optimizer:

1. Iterates through all blocks
2. For each solid block, checks adjacent blocks
3. Generates faces only for sides exposed to air or transparent blocks
4. Applies greedy meshing to combine adjacent identical faces
5. Creates a single merged mesh per chunk with shared material

## Error Handling

### Rendering Errors

**WebGL Context Loss**

- Listen for `webglcontextlost` event
- Pause game and display recovery message
- Attempt context restoration
- Reload assets if necessary

**Mesh Generation Failures**

- Log error with chunk coordinates
- Mark chunk as dirty for retry
- Display placeholder mesh (wireframe cube)
- Limit retry attempts to prevent infinite loops

### World Generation Errors

**Chunk Generation Timeout**

- Set maximum generation time (e.g., 5 seconds)
- If exceeded, generate flat chunk as fallback
- Log warning for debugging

**Invalid Block Types**

- Validate block type IDs during world generation
- Replace invalid IDs with default block (stone)
- Log warning with position and invalid ID

### Input Errors

**Touch Event Conflicts**

- Prevent default browser gestures (pinch zoom, pull-to-refresh)
- Handle multi-touch scenarios gracefully
- Separate game touch events from UI touch events

### Configuration Errors

**Invalid Config Values**

- Validate all config values on load
- Use default values for invalid entries
- Display warning message to user
- Log validation errors

## Testing Strategy

### Unit Tests

**Block Registry**

- Test block type registration
- Test block lookup by ID
- Test invalid block handling

**Chunk System**

- Test coordinate conversions
- Test block get/set operations
- Test chunk state transitions

**Mesh Optimizer**

- Test face culling logic
- Test greedy meshing algorithm
- Test mesh generation for various block configurations

**Player Controller**

- Test movement calculations
- Test collision detection
- Test gravity and jumping

### Integration Tests

**World Generation**

- Test chunk loading around player
- Test chunk unloading when player moves
- Test terrain continuity across chunk boundaries

**Block Interaction**

- Test raycast hit detection
- Test block placement at correct position
- Test block removal
- Test prevention of creating voids

**Input System**

- Test keyboard input mapping
- Test mouse camera control
- Test mobile touch controls
- Test input mode switching

### Performance Tests

**Rendering Performance**

- Measure FPS with various render distances
- Test mesh optimization effectiveness (draw call count)
- Profile chunk loading/unloading performance
- Test memory usage over time

**World Generation Performance**

- Measure chunk generation time
- Test concurrent chunk generation
- Profile noise function performance

### Manual Testing

**Cross-Platform**

- Test on desktop browsers (Chrome, Firefox, Safari, Edge)
- Test on mobile devices (iOS Safari, Android Chrome)
- Test touch controls on tablets
- Test keyboard/mouse on various OS (Windows, Mac, Linux)

**Gameplay**

- Test player spawn and falling sequence
- Test movement in all directions
- Test block placement and removal
- Test block type selection
- Test menu navigation and pause/resume
- Test world exploration and chunk loading

**Visual Quality**

- Verify textures load correctly
- Check lighting and shadows
- Verify crosshair visibility
- Test UI element positioning on various screen sizes

## Performance Optimization Techniques

### Greedy Meshing Algorithm

Combines adjacent identical block faces into larger quads to reduce vertex count and draw calls.

**Algorithm:**

1. For each layer (XY plane at each Z)
2. Create a 2D mask of which faces are visible
3. Scan mask row by row
4. For each visible face, extend horizontally as far as possible
5. Then extend vertically as far as possible
6. Create a single quad for the merged area
7. Mark merged faces as processed

### Instanced Rendering

For objects that appear many times with identical geometry (e.g., clouds, certain decorative blocks), use Babylon.js InstancedMesh to render multiple instances with a single draw call.

### Frustum Culling

Babylon.js automatically performs frustum culling, but we enhance it by:

- Not generating meshes for chunks outside render distance
- Unloading chunk meshes that haven't been visible for a threshold time

### Face Culling

Only render faces of blocks that are exposed to air or transparent blocks. Faces between two solid blocks are never rendered.

### Chunk-Based LOD (Future Enhancement)

For chunks far from the player, generate simplified meshes with lower detail.

### Texture Atlas

Combine all block textures into a single texture atlas to minimize texture binding changes and enable better batching.

### Web Workers (Future Enhancement)

Offload chunk generation and mesh optimization to web workers to prevent blocking the main thread.

## Multiplayer Considerations

### State Synchronization

**World State**

- Chunks are the unit of synchronization
- Only modified chunks need to be synced
- Use delta compression for chunk updates

**Player State**

- Position, rotation, and selected block are synced
- Movement is client-predicted with server reconciliation
- Block interactions are validated server-side

**Event-Driven Architecture**

- All game actions emit events
- Events can be serialized and transmitted
- Server acts as authoritative source

### Network Protocol (Future)

**Message Types:**

- `PlayerMove`: Position and rotation updates
- `BlockPlace`: Block placement request
- `BlockRemove`: Block removal request
- `ChunkUpdate`: Chunk data synchronization
- `PlayerJoin`: New player connected
- `PlayerLeave`: Player disconnected

### Client-Server Architecture (Future)

- Server maintains authoritative world state
- Clients send input commands
- Server validates and broadcasts state changes
- Clients perform optimistic updates with rollback on conflict

## Block Type Documentation

### Block Definition Schema

```typescript
/**
 * Defines a block type that can be placed in the world.
 *
 * @property id - Unique identifier (lowercase, no spaces)
 * @property name - Human-readable display name
 * @property textures - Texture file paths for each face
 * @property solid - Whether the block has collision
 * @property transparent - Whether the block allows light through
 * @property breakable - Whether players can remove this block
 * @property metadata - Extensible properties for custom behavior
 *
 * @example
 * {
 *   id: "grass",
 *   name: "Grass Block",
 *   textures: {
 *     top: "textures/grass_top.png",
 *     bottom: "textures/dirt.png",
 *     sides: "textures/grass_side.png"
 *   },
 *   solid: true,
 *   transparent: false,
 *   breakable: true
 * }
 */
```

### Default Block Types

1. **Grass** - Green top, dirt sides, base terrain
2. **Dirt** - Brown, found beneath grass
3. **Stone** - Gray, deep underground
4. **Wood** - Brown, tree trunks
5. **Leaves** - Green, semi-transparent, tree foliage
6. **Cement** - Gray, smooth, for roads/structures
7. **Cloud** - White, semi-transparent, decorative
8. **Sand** - Tan, for beaches/deserts (future)
9. **Water** - Blue, transparent, liquid (future)

### Adding New Block Types

1. Create texture files (PNG, power-of-2 dimensions recommended)
2. Add block definition to `blocks.json` or register programmatically
3. Block automatically available in game
4. Can be used in world generation by referencing block ID

### AI-Generated Blocks

The block system is designed to be AI-friendly:

- Simple JSON schema
- Clear property definitions
- No code changes required to add blocks
- Texture files can be generated or sourced separately

### Themed Worlds

World generation can reference block types by ID:

- Desert theme: Use sand, sandstone, cacti blocks
- Snow theme: Use snow, ice, pine tree blocks
- Urban theme: Use cement, glass, metal blocks

World generator accepts a theme configuration that maps terrain types to block IDs.

## Diagram: Game Loop

```
┌─────────────────────────────────────────┐
│         Game Loop (60 FPS)              │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  1. Process Input                       │
│     - Read keyboard/mouse/touch         │
│     - Update InputState                 │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  2. Update Game Logic                   │
│     - Update player position/velocity   │
│     - Apply physics (gravity, collision)│
│     - Process block interactions        │
│     - Update chunk loading              │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  3. Update World                        │
│     - Generate new chunks               │
│     - Regenerate dirty chunk meshes     │
│     - Unload distant chunks             │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  4. Render Frame                        │
│     - Update camera                     │
│     - Render scene (Babylon.js)         │
│     - Render UI overlay                 │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  5. Handle Events                       │
│     - Process queued events             │
│     - Notify listeners                  │
└─────────────────────────────────────────┘
              │
              └──────────────┐
                             │
                    (Repeat at 60 FPS)
```

## Diagram: Block Interaction Flow

```
Player clicks/taps
       │
       ▼
┌─────────────────────┐
│  Raycast from       │
│  camera center      │
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│  Hit block?         │
└─────────────────────┘
       │
   Yes │         No
       │          └──> Do nothing
       ▼
┌─────────────────────┐
│  Within range?      │
└─────────────────────┘
       │
   Yes │         No
       │          └──> Do nothing
       ▼
┌─────────────────────┐
│  Place or Remove?   │
└─────────────────────┘
       │
       ├─ Remove ──────────────┐
       │                       ▼
       │              ┌─────────────────────┐
       │              │ Check if removal    │
       │              │ creates void        │
       │              └─────────────────────┘
       │                       │
       │                   Yes │    No
       │                       │     └──> Remove block
       │                       │          Emit BlockRemoved
       │                       │          Mark chunk dirty
       │                       │
       │                       └──> Prevent removal
       │                            Show message
       │
       └─ Place ───────────────┐
                               ▼
                      ┌─────────────────────┐
                      │ Get adjacent empty  │
                      │ block position      │
                      └─────────────────────┘
                               │
                               ▼
                      ┌─────────────────────┐
                      │ Place selected      │
                      │ block type          │
                      └─────────────────────┘
                               │
                               ▼
                      ┌─────────────────────┐
                      │ Emit BlockPlaced    │
                      │ Mark chunk dirty    │
                      └─────────────────────┘
```

## Physics & Collision System

### AABB Collision Detection

The game uses a custom Axis-Aligned Bounding Box (AABB) collision system optimized for voxel grids.

**Player Bounding Box:**

- Width: 0.8 blocks
- Height: 1.8 blocks
- Centered on player position

**Collision Algorithm:**

1. Calculate player AABB based on intended new position
2. Determine which blocks the AABB overlaps
3. Check each overlapping block for solidity
4. If collision detected, adjust position to slide along surface
5. Apply separate collision checks for X, Y, Z axes

**Ground Detection:**

- Cast ray downward from player center
- Check for solid block within 0.1 units
- Set `isGrounded` flag for jump logic

**Advantages of Custom AABB:**

- Lightweight (no physics engine overhead)
- Optimized for grid-based world
- Predictable behavior for voxel games
- Easy to network (deterministic)

## UI Implementation Strategy

### Babylon.js GUI vs HTML/CSS

**Chosen Approach: Babylon.js GUI**

The game uses Babylon.js GUI library for all UI elements to avoid complexities of mixing DOM and WebGL.

**Advantages:**

- Input handling unified within canvas (no focus conflicts)
- UI scales automatically with canvas resolution
- Consistent rendering pipeline (no z-index issues)
- Better performance (rendered in WebGL)
- Easier to integrate with 3D elements (e.g., block preview)

**UI Components:**

- `AdvancedDynamicTexture.CreateFullscreenUI()` for HUD overlay
- `Rectangle` and `TextBlock` for menus
- `Ellipse` for crosshair
- `VirtualJoystick` for mobile controls (or custom implementation)
- `StackPanel` for block selection menu

**Fallback Consideration:**

- HTML/CSS can be used for main menu (pre-game) if desired
- In-game UI exclusively uses Babylon.js GUI

## Technology-Specific Implementation Notes

### Babylon.js Specifics

**Scene Setup**

- Use `BABYLON.Engine` with `antialias: true` for better visuals
- Create `BABYLON.Scene` with `autoClear: false` for performance
- Use `BABYLON.UniversalCamera` for first-person controls

**Mesh Creation**

- Use `BABYLON.MeshBuilder.CreateBox` for individual blocks (development)
- Use custom `VertexData` for optimized chunk meshes (production)
- Apply `BABYLON.StandardMaterial` with texture atlas

**Raycasting**

- Use `scene.pick()` with ray from camera
- Configure `predicate` to only hit solid blocks
- Use `pickInfo.pickedPoint` and `pickInfo.getNormal()` for placement position

**Performance**

- Enable `scene.freezeActiveMeshes()` for static chunks
- Use `mesh.freezeWorldMatrix()` for chunks that don't move
- Implement `scene.blockMaterialDirtyMechanism` to reduce checks

**Mobile Optimization**

- Reduce `engine.setHardwareScalingLevel()` on low-end devices
- Disable shadows on mobile
- Use lower resolution textures

### TypeScript Best Practices

- Use strict mode (`"strict": true` in tsconfig.json)
- Define interfaces for all major data structures
- Use enums for state machines and constants
- Leverage union types for type-safe event handling
- Use generics for reusable systems (e.g., event emitter)

### Build Configuration (Vite)

- Configure asset handling for textures and models
- Enable code splitting for faster initial load
- Use environment variables for development vs. production configs
- Configure PWA support for offline play (future)

## Summary

This design provides a solid foundation for a performant, extensible sandbox-style voxel game. The architecture separates concerns, optimizes rendering through multiple techniques, and is structured to support future multiplayer functionality. The block system is well-documented and data-driven, enabling easy extension through AI-generated content or manual additions.
