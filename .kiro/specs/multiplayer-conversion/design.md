# Multiplayer Conversion Design Document

## Overview

This design document outlines the architecture for converting the Minecraft Three.js clone from a single-player, client-side game into a multiplayer, server-authoritative game. The design maintains all existing client-side optimizations (InstancedMesh, chunking, Web Workers) while adding real-time synchronization using Redis and Devvit's realtime API.

### Key Design Principles

1. **Optimistic Updates**: Clients immediately apply changes locally and broadcast to others, with server persistence happening asynchronously
2. **Minimal Client Changes**: Preserve existing rendering optimizations and procedural generation
3. **Server Authority**: Server maintains the authoritative world state in Redis
4. **Efficient Synchronization**: Use structured JSON messages with coordinate rounding to minimize bandwidth
5. **Development Parity**: Mock and production environments use identical APIs

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Game Clients                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Client 1   │  │   Client 2   │  │   Client N   │      │
│  │  (Three.js)  │  │  (Three.js)  │  │  (Three.js)  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
│                     WebSocket/Realtime                       │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────┐
│                     Game Server                              │
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────────┐ │
│  │           WebSocket Server (ws)                        │ │
│  │  - Connection management                               │ │
│  │  - Username assignment                                 │ │
│  │  - Message routing                                     │ │
│  └─────────────┬──────────────────────┬───────────────────┘ │
│                │                      │                     │
│  ┌─────────────▼──────────┐  ┌────────▼──────────────────┐ │
│  │   Redis Pub/Sub        │  │   Redis Store             │ │
│  │  - Realtime broadcast  │  │  - World state            │ │
│  │  - Player positions    │  │  - Block modifications    │ │
│  │  - Game events         │  │  - Terrain seeds          │ │
│  └────────────────────────┘  │  - Player sessions        │ │
│                               └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Block Modification Flow (Optimistic)

```
1. Player clicks to place/remove block
   ↓
2. Client immediately updates local visual representation
   ↓
3. Client sends modification to server via WebSocket
   {
     type: "block-modify",
     username: "player123",
     position: { x: 10, y: 5, z: 3 },
     blockType: 1,
     action: "place",
     clientTimestamp: 1234567890
   }
   ↓
4. Server receives modification
   ↓
5. Server adds server timestamp and broadcasts immediately via Redis pub/sub
   {
     type: "block-modify",
     username: "player123",
     position: { x: 10, y: 5, z: 3 },
     blockType: 1,
     action: "place",
     clientTimestamp: 1234567890,
     serverTimestamp: 1234567891
   }
   ↓
6. All clients (including originator) receive broadcast
   ↓
7. Clients check if modification is from self (ignore) or other player (apply)
   ↓
8. Server persists to Redis asynchronously (with retry on failure)
```

#### Player Position Synchronization Flow

```
1. Client sends position update (10 times per second)
   {
     type: "player-position",
     username: "player123",
     position: { x: 10.45, y: 5.23, z: 3.67 },
     rotation: { x: 0.12, y: 1.57, z: 0 }
   }
   ↓
2. Server batches position updates
   ↓
3. Server broadcasts batched updates (10 times per second)
   {
     type: "player-positions",
     players: [
       { username: "player123", position: {...}, rotation: {...} },
       { username: "player456", position: {...}, rotation: {...} }
     ]
   }
   ↓
4. Clients receive and update other player entities with interpolation
```

## Components and Interfaces

### 1. Client-Side Components

#### 1.1 Multiplayer Manager (`src/client/multiplayer.ts`)

New component responsible for managing multiplayer state and communication.

```typescript
interface PlayerEntity {
  username: string;
  renderer: PlayerEntityRenderer; // Handles rendering and animation
}

class MultiplayerManager {
  private connection: RealtimeConnection | null;
  private username: string;
  private players: Map<string, PlayerEntity>;
  private terrain: Terrain;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    terrain: Terrain
  );

  // Connection management
  async connect(): Promise<void>;
  disconnect(): void;

  // Player management
  private createPlayerEntity(
    username: string,
    position: THREE.Vector3
  ): PlayerEntity;
  private removePlayerEntity(username: string): void;

  // Block synchronization
  sendBlockModification(
    position: THREE.Vector3,
    blockType: BlockType,
    action: "place" | "remove"
  ): void;
  private handleBlockModification(data: BlockModificationMessage): void;

  // Position synchronization
  sendPositionUpdate(position: THREE.Vector3, rotation: THREE.Euler): void;
  private handlePositionUpdate(data: PositionUpdateMessage): void;
  private handlePositionUpdates(data: PositionUpdatesBroadcast): void;

  // Update loop
  update(delta: number): void; // Update all player renderers and ensure labels face camera
}
```

#### 1.2 Modified Block Class (`src/client/mesh/block.ts`)

```typescript
class Block {
  x: number;
  y: number;
  z: number;
  type: BlockType;
  placed: boolean;
  username: string; // NEW: Track who modified this block
  timestamp: number; // NEW: Track when modification occurred

  constructor(
    x: number,
    y: number,
    z: number,
    type: BlockType,
    placed: boolean,
    username: string,
    timestamp: number
  );
}
```

#### 1.3 Modified Control Class (`src/client/control.ts`)

Add multiplayer integration to block placement/removal:

```typescript
class Control {
  // ... existing properties ...
  private multiplayer: MultiplayerManager; // NEW

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    player: Player,
    terrain: Terrain,
    audio: Audio,
    multiplayer: MultiplayerManager // NEW
  );

  // Modified mousedownHandler to send multiplayer events
  private mousedownHandler(e: MouseEvent): void {
    // ... existing block modification logic ...

    // NEW: Send to multiplayer
    this.multiplayer.sendBlockModification(position, blockType, action);
  }
}
```

#### 1.4 Modified Main Entry Point (`src/client/main.ts`)

```typescript
import MultiplayerManager from "./multiplayer";

// ... existing initialization ...

const multiplayer = new MultiplayerManager(scene, camera, terrain);
await multiplayer.connect();

const control = new Control(scene, camera, player, terrain, audio, multiplayer);

// Position update loop (10 times per second)
setInterval(() => {
  multiplayer.sendPositionUpdate(
    camera.position,
    new THREE.Euler(camera.rotation.x, camera.rotation.y, camera.rotation.z)
  );
}, 100);

// Animation loop
(function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  control.update();
  terrain.update();
  multiplayer.update(delta); // NEW: Update player interpolation

  renderer.render(scene, camera);
})();
```

### 2. Server-Side Components

#### 2.1 Enhanced Server (`src/server/index.ts`)

```typescript
interface ConnectedClient {
  ws: WebSocket;
  username: string;
  sessionId: string;
  position: { x: number; y: number; z: number };
  lastPositionUpdate: number;
}

interface BlockModificationMessage {
  type: "block-modify";
  username: string;
  position: { x: number; y: number; z: number };
  blockType: number;
  action: "place" | "remove";
  clientTimestamp: number;
}

interface PositionUpdateMessage {
  type: "player-position";
  username: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

class GameServer {
  private clients: Map<string, ConnectedClient>;
  private publisher: RedisClientType;
  private subscriber: RedisClientType;
  private redisStore: RedisClientType;

  // Connection handling
  private handleConnection(ws: WebSocket): void;
  private handleDisconnection(sessionId: string): void;
  private assignUsername(): string; // Generate random username for dev

  // Message routing
  private handleMessage(sessionId: string, message: string): void;
  private handleBlockModification(
    client: ConnectedClient,
    data: BlockModificationMessage
  ): void;
  private handlePositionUpdate(
    client: ConnectedClient,
    data: PositionUpdateMessage
  ): void;

  // Broadcasting
  private broadcastBlockModification(
    data: BlockModificationMessage
  ): Promise<void>;
  private broadcastPositionUpdates(): void; // Batched, called 10 times per second

  // Redis persistence
  private persistBlockModification(
    data: BlockModificationMessage
  ): Promise<void>;
  private getWorldState(chunkX: number, chunkZ: number): Promise<Block[]>;
  private getTerrainSeeds(): Promise<TerrainSeeds>;
}
```

#### 2.2 Redis Schema

**Keys Structure:**

```
# Block modifications (stored per chunk using Redis Hash)
chunk:{chunkX}:{chunkZ} -> HASH {
  "block:{x}:{y}:{z}": JSON {
    type: number,
    username: string,
    timestamp: number
  }
}

# Terrain seeds (initialized once per world)
terrain:seeds -> JSON {
  seed: number,
  treeSeed: number,
  stoneSeed: number,
  coalSeed: number
}

# Player sessions (for initial spawn point on join)
player:{username}:session -> JSON {
  sessionId: string,
  lastSeen: number,
  spawnPosition: { x, y, z }
}

# Active players list
players:active -> SET [username1, username2, ...]
```

**Redis Operations:**

```typescript
// Store block placement (add to chunk hash)
const chunkX = Math.floor(x / CHUNK_SIZE);
const chunkZ = Math.floor(z / CHUNK_SIZE);
await redis.hset(
  `chunk:${chunkX}:${chunkZ}`,
  `block:${x}:${y}:${z}`,
  JSON.stringify({
    type: blockType,
    username: username,
    timestamp: Date.now(),
  })
);

// Store block removal (delete from chunk hash)
const chunkX = Math.floor(x / CHUNK_SIZE);
const chunkZ = Math.floor(z / CHUNK_SIZE);
await redis.hdel(`chunk:${chunkX}:${chunkZ}`, `block:${x}:${y}:${z}`);

// Get all blocks in a chunk (extremely fast, O(N) where N is blocks in chunk)
const chunkData = await redis.hgetall(`chunk:${chunkX}:${chunkZ}`);
const blocks = Object.entries(chunkData).map(([key, value]) => {
  const [_, x, y, z] = key.split(":").map(Number);
  const data = JSON.parse(value);
  return { x, y, z, ...data };
});

// Initialize terrain seeds (if not exists)
await redis.setnx(
  "terrain:seeds",
  JSON.stringify({
    seed: Math.random(),
    treeSeed: Math.random(),
    stoneSeed: Math.random(),
    coalSeed: Math.random(),
  })
);

// Track active player (spawn position is set on initial join, not updated frequently)
await redis.sadd("players:active", username);
await redis.set(
  `player:${username}:session`,
  JSON.stringify({
    sessionId: sessionId,
    lastSeen: Date.now(),
    spawnPosition: { x, y, z }, // Initial spawn point only
  })
);
```

**Performance Notes:**

- Using Redis Hash per chunk (`HGETALL`) is O(N) where N is the number of blocks in that chunk, which is extremely fast
- This avoids the blocking `KEYS` command which would scan the entire database
- Chunk-based storage naturally aligns with the game's chunk system
- Deleting blocks from the hash prevents infinite growth of "removed" tombstone markers

## Data Models

### Message Types

#### Client → Server Messages

```typescript
// Initial connection
interface ConnectMessage {
  type: "connect";
  // No data needed, server assigns username
}

// Request world state for chunk
interface WorldStateRequest {
  type: "world-state-request";
  username: string;
  chunkX: number;
  chunkZ: number;
}

// Block modification
interface BlockModificationMessage {
  type: "block-modify";
  username: string;
  position: { x: number; y: number; z: number };
  blockType: number | null; // null for removal, number for placement
  action: "place" | "remove";
  clientTimestamp: number;
}

// Position update
interface PositionUpdateMessage {
  type: "player-position";
  username: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}
```

#### Server → Client Messages

```typescript
// Connection established
interface ConnectedMessage {
  type: "connected";
  username: string;
  terrainSeeds: {
    seed: number;
    treeSeed: number;
    stoneSeed: number;
    coalSeed: number;
  };
}

// World state response
interface WorldStateResponse {
  type: "world-state";
  chunkX: number;
  chunkZ: number;
  blocks: Array<{
    x: number;
    y: number;
    z: number;
    type: number; // Only placed blocks are returned (removed blocks are deleted from Redis)
    username: string;
    timestamp: number;
  }>;
  players: Array<{
    username: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }>;
}

// Block modification broadcast
interface BlockModificationBroadcast {
  type: "block-modify";
  username: string;
  position: { x: number; y: number; z: number };
  blockType: number | null; // null for removal, number for placement
  action: "place" | "remove";
  clientTimestamp: number;
  serverTimestamp: number;
}

// Batched position updates
interface PositionUpdatesBroadcast {
  type: "player-positions";
  players: Array<{
    username: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }>;
}

// Player joined
interface PlayerJoinedMessage {
  type: "player-joined";
  username: string;
  position: { x: number; y: number; z: number };
}

// Player left
interface PlayerLeftMessage {
  type: "player-left";
  username: string;
}
```

### Player Entity Visual Representation

The player entity uses a voxel-based humanoid character with procedural animation for walking, turning, and jumping.

#### PlayerEntityRenderer Class

```typescript
// src/client/playerEntityRenderer.ts
class PlayerEntityRenderer {
  // === Voxel Mesh ===
  public group: THREE.Group;
  public head: THREE.Mesh;
  public torso: THREE.Mesh;
  public leftArm: THREE.Mesh;
  public rightArm: THREE.Mesh;
  public leftLeg: THREE.Mesh;
  public rightLeg: THREE.Mesh;
  private label: THREE.Sprite;

  // === State for Interpolation & Responsiveness ===
  public targetPosition: THREE.Vector3; // Received from server
  public targetRotation: THREE.Euler; // Received from server
  private isTurning: boolean = false; // Flag for turn-before-move logic
  private lastPosition: THREE.Vector3; // For determining if character is moving
  private lastGroundY: number; // For jump detection
  private isGrounded: boolean = false; // Ground state detection
  private positionStableTime: number = 0; // Track Y-position stability
  private isJumping: boolean = false;

  // === Animation Timers ===
  private walkTime: number = 0; // Timer for leg/arm swing cycle
  private turningDuration: number = 0.15; // Time in seconds for a turn

  constructor(username: string, initialPosition: THREE.Vector3) {
    this.group = this.buildVoxelCharacter(username);
    this.group.position.copy(initialPosition);
    this.targetPosition = initialPosition.clone();
    this.lastPosition = initialPosition.clone();
    this.lastGroundY = initialPosition.y;
  }

  // --- Public Methods for MultiplayerManager ---

  public setTargetState(position: THREE.Vector3, rotation: THREE.Euler): void {
    this.targetPosition.copy(position);
    this.targetRotation.copy(rotation);
  }

  public update(deltaTime: number): void {
    const currentRotation = this.group.rotation.y;
    const targetRotation = this.targetRotation.y;
    const positionChanged =
      this.group.position.distanceTo(this.targetPosition) > 0.01;

    // Step A: Handle Turn-Before-Move Logic (for sideways movement)
    if (!this.isTurning && positionChanged) {
      if (Math.abs(currentRotation - targetRotation) > 0.1) {
        this.isTurning = true;
      }
    }

    // Step B: Interpolate Movement
    if (this.isTurning) {
      this.handleTurning(deltaTime, targetRotation);
    } else {
      this.handleMovement(deltaTime);
    }

    // Step C: Detect Ground State (position stable for 0.2s)
    const yPositionChange = Math.abs(
      this.targetPosition.y - this.lastPosition.y
    );
    if (yPositionChange < 0.01) {
      this.positionStableTime += deltaTime;
      if (this.positionStableTime > 0.2) {
        this.isGrounded = true;
        this.lastGroundY = this.targetPosition.y;
      }
    } else {
      this.positionStableTime = 0;
      this.isGrounded = false;
    }

    // Step D: Detect Jump
    if (this.isGrounded && this.targetPosition.y > this.lastGroundY + 0.5) {
      this.isJumping = true;
    } else if (this.isGrounded) {
      this.isJumping = false;
    }

    this.lastPosition.copy(this.targetPosition);

    // Step E: Apply Animation (Walk/Idle/Jump)
    this.applyAnimations(deltaTime, positionChanged);
  }

  // --- Private Animation & Kinematics ---

  private handleTurning(deltaTime: number, targetRotation: number): void {
    const newRotation = THREE.MathUtils.lerp(
      this.group.rotation.y,
      targetRotation,
      deltaTime / this.turningDuration
    );
    this.group.rotation.y = newRotation;

    if (Math.abs(this.group.rotation.y - targetRotation) < 0.05) {
      this.isTurning = false;
    }
  }

  private handleMovement(deltaTime: number): void {
    this.group.position.lerp(this.targetPosition, 0.2 * deltaTime * 60);
  }

  private applyAnimations(deltaTime: number, isMoving: boolean): void {
    if (this.isJumping) {
      // Jump animation: arms slightly tucked, legs straight
      this.leftArm.rotation.x = THREE.MathUtils.lerp(
        this.leftArm.rotation.x,
        -0.3,
        0.1
      );
      this.rightArm.rotation.x = THREE.MathUtils.lerp(
        this.rightArm.rotation.x,
        -0.3,
        0.1
      );
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.head.position.y = 1.6;
    } else if (isMoving) {
      // Walking animation: sinusoidal arm and leg swing
      this.walkTime += deltaTime * 10;

      // Arm swing (alternating)
      this.leftArm.rotation.x = Math.sin(this.walkTime) * 0.8;
      this.rightArm.rotation.x = Math.sin(this.walkTime + Math.PI) * 0.8;

      // Leg swing (alternating)
      this.leftLeg.rotation.x = Math.sin(this.walkTime + Math.PI) * 0.8;
      this.rightLeg.rotation.x = Math.sin(this.walkTime) * 0.8;

      // Head bob (slight vertical movement)
      this.head.position.y =
        1.6 + Math.abs(Math.sin(this.walkTime * 0.5)) * 0.1;
    } else {
      // Idle animation: return to rest position
      this.walkTime = 0;
      this.leftArm.rotation.x = THREE.MathUtils.lerp(
        this.leftArm.rotation.x,
        0,
        0.1
      );
      this.rightArm.rotation.x = THREE.MathUtils.lerp(
        this.rightArm.rotation.x,
        0,
        0.1
      );
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.head.position.y = 1.6;
    }
  }

  private buildVoxelCharacter(username: string): THREE.Group {
    const group = new THREE.Group();
    const color = hashStringToColor(username);
    const material = new THREE.MeshStandardMaterial({ color });

    // Torso (main body)
    const torsoGeometry = new THREE.BoxGeometry(0.6, 1.2, 0.4);
    this.torso = new THREE.Mesh(torsoGeometry, material);
    this.torso.position.set(0, 1.2, 0);
    group.add(this.torso);

    // Head
    const headGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.head = new THREE.Mesh(headGeometry, material);
    this.head.position.set(0, 1.6, 0);
    group.add(this.head);

    // Left Arm (pivot at shoulder)
    const armGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    this.leftArm = new THREE.Mesh(armGeometry, material);
    this.leftArm.position.set(-0.4, 1.2, 0);
    this.leftArm.geometry.translate(0, -0.4, 0); // Move pivot to top
    group.add(this.leftArm);

    // Right Arm (pivot at shoulder)
    this.rightArm = new THREE.Mesh(armGeometry, material);
    this.rightArm.position.set(0.4, 1.2, 0);
    this.rightArm.geometry.translate(0, -0.4, 0); // Move pivot to top
    group.add(this.rightArm);

    // Left Leg (pivot at hip)
    const legGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    this.leftLeg = new THREE.Mesh(legGeometry, material);
    this.leftLeg.position.set(-0.2, 0.6, 0);
    this.leftLeg.geometry.translate(0, -0.4, 0); // Move pivot to top
    group.add(this.leftLeg);

    // Right Leg (pivot at hip)
    this.rightLeg = new THREE.Mesh(legGeometry, material);
    this.rightLeg.position.set(0.2, 0.6, 0);
    this.rightLeg.geometry.translate(0, -0.4, 0); // Move pivot to top
    group.add(this.rightLeg);

    // Username label
    this.label = this.createUsernameLabel(username);
    group.add(this.label);

    return group;
  }

  private createUsernameLabel(username: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    canvas.width = 256;
    canvas.height = 64;

    context.fillStyle = "rgba(0, 0, 0, 0.6)";
    context.fillRect(0, 0, 256, 64);
    context.fillStyle = "white";
    context.font = "bold 32px Arial";
    context.textAlign = "center";
    context.fillText(username, 128, 42);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 0.5, 1);
    sprite.position.y = 2.5;

    return sprite;
  }
}

// Generate consistent color from username
function hashStringToColor(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash & 0x00ffffff;
}
```

#### Voxel Character Structure

| Part Name | Dimensions (units) | Position (x, y, z) | Pivot Point    |
| :-------- | :----------------- | :----------------- | :------------- |
| Torso     | 0.6 × 1.2 × 0.4    | 0, 1.2, 0          | Center         |
| Head      | 0.5 × 0.5 × 0.5    | 0, 1.6, 0          | Center         |
| Left Arm  | 0.3 × 0.8 × 0.3    | -0.4, 1.2, 0       | Top (shoulder) |
| Right Arm | 0.3 × 0.8 × 0.3    | 0.4, 1.2, 0        | Top (shoulder) |
| Left Leg  | 0.3 × 0.8 × 0.3    | -0.2, 0.6, 0       | Top (hip)      |
| Right Leg | 0.3 × 0.8 × 0.3    | 0.2, 0.6, 0        | Top (hip)      |
| Label     | 2 × 0.5 (sprite)   | 0, 2.5, 0          | Center         |

#### Animation System

**Walking Animation:**

- Uses `Math.sin()` for smooth, cyclical motion
- Arms swing in opposite phase (one forward, one back)
- Legs swing in opposite phase to arms
- Head bobs slightly with walk cycle
- Animation speed controlled by `walkTime` increment

**Turn-Before-Move:**

- Detects when target rotation differs significantly (> 0.1 radians)
- Smoothly interpolates rotation before moving
- Prevents sliding/skating effect during direction changes
- Turn duration: 0.15 seconds

**Jump Animation:**

- Detected when Y position exceeds ground level by > 0.5 units
- Arms tuck slightly (rotation.x = -0.3)
- Legs straighten (rotation.x = 0)
- Head bob disabled during jump
- Returns to walk/idle when landing detected

**Idle Animation:**

- Smoothly lerps arms back to rest position
- Legs return to straight position
- Head returns to default height
- Walk timer resets to 0

## Error Handling

### Client-Side Error Handling

```typescript
class MultiplayerManager {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  private queuedModifications: BlockModificationMessage[] = [];

  private async handleDisconnect(): Promise<void> {
    console.log("Disconnected from server");
    this.showReconnectingMessage();

    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      await this.sleep(this.reconnectDelay);

      try {
        await this.connect();
        console.log("Reconnected successfully");
        this.hideReconnectingMessage();

        // Send queued modifications for server validation
        if (this.queuedModifications.length > 0) {
          console.log(
            `Sending ${this.queuedModifications.length} queued modifications for validation`
          );
          for (const modification of this.queuedModifications) {
            this.connection?.ws.send(JSON.stringify(modification));
          }
          this.queuedModifications = [];
        }

        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        return;
      } catch (error) {
        console.error(`Reconnect attempt ${this.reconnectAttempts} failed`);
        this.reconnectDelay *= 2; // Exponential backoff
      }
    }

    this.showReconnectFailedMessage();
  }

  sendBlockModification(
    position: THREE.Vector3,
    blockType: BlockType | null,
    action: "place" | "remove"
  ): void {
    const message: BlockModificationMessage = {
      type: "block-modify",
      username: this.username,
      position: { x: position.x, y: position.y, z: position.z },
      blockType: blockType,
      action: action,
      clientTimestamp: Date.now(),
    };

    if (this.connection && this.connection.ws.readyState === WebSocket.OPEN) {
      this.connection.ws.send(JSON.stringify(message));
    } else {
      // Queue modification if disconnected
      console.log("Disconnected, queuing modification");
      this.queuedModifications.push(message);
    }
  }

  private handleConflict(data: BlockModificationBroadcast): void {
    // Check if we have a local modification at this position
    const localBlock = this.findLocalBlock(data.position);

    if (localBlock && localBlock.timestamp < data.serverTimestamp) {
      // Server timestamp is newer, override local change
      console.log("Conflict detected, applying server state");
      this.applyBlockModification(data);
    }
  }
}
```

### Server-Side Error Handling

```typescript
class GameServer {
  private async validateAndApplyBlockModification(
    data: BlockModificationMessage
  ): Promise<boolean> {
    const { position, blockType, action } = data;
    const chunkX = Math.floor(position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(position.z / CHUNK_SIZE);
    const blockKey = `block:${position.x}:${position.y}:${position.z}`;

    // Check current state in Redis
    const existingBlock = await this.redisStore.hget(
      `chunk:${chunkX}:${chunkZ}`,
      blockKey
    );

    if (action === "place") {
      if (existingBlock) {
        console.log("Validation failed: Block already exists at position");
        return false; // Position already occupied
      }
    } else if (action === "remove") {
      if (!existingBlock) {
        console.log("Validation failed: No block exists at position");
        return false; // No block to remove
      }
    }

    return true; // Validation passed
  }

  private async persistBlockModification(
    data: BlockModificationMessage,
    retries = 3
  ): Promise<void> {
    const { position, blockType, action, username } = data;
    const chunkX = Math.floor(position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(position.z / CHUNK_SIZE);
    const blockKey = `block:${position.x}:${position.y}:${position.z}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (action === "place") {
          // Add block to chunk hash
          await this.redisStore.hset(
            `chunk:${chunkX}:${chunkZ}`,
            blockKey,
            JSON.stringify({
              type: blockType,
              username: username,
              timestamp: Date.now(),
            })
          );
        } else {
          // Remove block from chunk hash
          await this.redisStore.hdel(`chunk:${chunkX}:${chunkZ}`, blockKey);
        }
        return; // Success
      } catch (error) {
        console.error(
          `Redis persistence failed (attempt ${attempt}/${retries}):`,
          error
        );

        if (attempt === retries) {
          // Log critical error for monitoring
          console.error(
            "CRITICAL: Failed to persist block modification after all retries",
            data
          );
          // Could send to error tracking service here
        } else {
          // Exponential backoff
          await this.sleep(Math.pow(2, attempt) * 100);
        }
      }
    }
  }

  private handleClientError(sessionId: string, error: Error): void {
    console.error(`Client ${sessionId} error:`, error);
    const client = this.clients.get(sessionId);

    if (client) {
      try {
        client.ws.send(
          JSON.stringify({
            type: "error",
            message: "An error occurred. Please refresh the page.",
          })
        );
      } catch (sendError) {
        console.error("Failed to send error message to client:", sendError);
      }
    }
  }
}
```

## Testing Strategy

### Unit Tests

1. **Message Serialization/Deserialization**

   - Test all message types can be correctly serialized to JSON
   - Test coordinate rounding works correctly
   - Test timestamp handling

2. **Conflict Resolution**

   - Test timestamp-based conflict resolution
   - Test handling of simultaneous modifications
   - Test client-side conflict detection

3. **Username Generation**
   - Test random username generation produces unique names
   - Test username format is valid

### Integration Tests

1. **Connection Flow**

   - Test client can connect and receive username
   - Test client receives terrain seeds
   - Test client receives initial world state

2. **Block Modification Flow**

   - Test client can place block and it appears for other clients
   - Test client can remove block and it disappears for other clients
   - Test modifications persist in Redis
   - Test modifications survive server restart

3. **Player Synchronization**

   - Test player positions are broadcast to other clients
   - Test player join/leave events are handled correctly
   - Test player entities are rendered correctly

4. **Reconnection**
   - Test client can reconnect after disconnect
   - Test queued modifications are sent after reconnection
   - Test world state is resynchronized after reconnection

### Performance Tests

1. **Message Throughput**

   - Test server can handle 100+ concurrent clients
   - Test position updates maintain 10 Hz rate under load
   - Test block modifications are broadcast within 100ms

2. **Redis Performance**
   - Test Redis can handle high write volume
   - Test chunk queries complete within 200ms
   - Test Redis pub/sub latency is acceptable

### Manual Testing Scenarios

1. **Multiplayer Gameplay**

   - Two players build structures together
   - Players move around and see each other
   - Players modify same blocks simultaneously

2. **Network Conditions**

   - Test with simulated latency (100ms, 500ms)
   - Test with packet loss
   - Test with intermittent disconnections

3. **Edge Cases**
   - Player places block where another player is standing
   - Player removes block they're standing on
   - Multiple players modify same block within 100ms

## Development vs Production

### Environment Detection

```typescript
// Server-side
const isDevelopment = process.env.NODE_ENV !== "production";

function assignUsername(context?: DevvitContext): string {
  if (isDevelopment) {
    // Generate random username for development
    return `Player${Math.floor(Math.random() * 10000)}`;
  } else {
    // Get username from Devvit context in production
    return context?.userId || "Anonymous";
  }
}
```

### Client-Side Connection

```typescript
// Client-side
const isDevelopment = import.meta.env.DEV;

async function connectToServer(): Promise<RealtimeConnection> {
  if (isDevelopment) {
    // Connect to local WebSocket server
    return await connectRealtime({
      channel: "game-channel",
      onConnect: handleConnect,
      onMessage: handleMessage,
    });
  } else {
    // Use Devvit realtime API in production
    const { useChannel } = await import("@devvit/web/client");
    return useChannel({
      name: "game-channel",
      onMessage: handleMessage,
    });
  }
}
```

## Migration Path

### Phase 1: Server Infrastructure

1. Enhance server to handle username assignment
2. Implement Redis persistence for blocks
3. Add terrain seed management
4. Test with single client

### Phase 2: Block Synchronization

1. Implement optimistic block updates on client
2. Add block modification broadcasting
3. Implement conflict resolution
4. Test with two clients

### Phase 3: Player Synchronization

1. Create player entity rendering
2. Implement position broadcasting
3. Add interpolation for smooth movement
4. Test with multiple clients

### Phase 4: Polish and Optimization

1. Add reconnection handling
2. Optimize message sizes
3. Add error handling and logging
4. Performance testing and tuning

### Phase 5: Production Deployment

1. Replace mock realtime with Devvit API
2. Add Devvit context integration
3. Deploy to Reddit platform
4. Monitor and iterate
