# Chunk State Synchronization Design Document

## Overview

This design document outlines the architecture for implementing robust chunk-based state synchronization in the multiplayer sandbox game. The system ensures all clients have consistent world state through:

1. **Initial state loading** via HTTP when connecting
2. **Incremental state loading** via HTTP as player moves
3. **Optimistic UI updates** with immediate visual feedback
4. **Debounced batch modifications** sent via HTTP fetch
5. **Server-side validation** with conflict resolution
6. **Regional pub/sub broadcasts** for real-time updates
7. **localStorage persistence** for offline resilience

### Key Design Principles

1. **Fetch for Modifications**: Use HTTP POST for sending block changes (not WebSocket)
2. **Regional Pub/Sub**: Subscribe only to relevant 5x5 chunk regions to reduce bandwidth
3. **Debounced Batching**: Collect modifications for 1 second before sending (configurable)
4. **Optimistic Updates**: Show changes immediately, validate asynchronously
5. **Offline Resilience**: Store changes in localStorage when disconnected
6. **Server Authority**: Server validates all changes and resolves conflicts
7. **Efficient Storage**: Redis Hash per chunk for O(1) retrieval

## Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Connection                        │
│                                                              │
│  1. Connect via WebSocket                                    │
│  2. Receive: seeds + spawn + initial chunks + players        │
│  3. Populate customBlocks from chunk states                  │
│  4. Generate terrain with loaded state                       │
│  5. Subscribe to regional pub/sub channels                   │
│  6. Start monitoring position for chunk/region changes       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  Block Modification Flow                     │
│                                                              │
│  CLIENT:                                                     │
│  1. User places/removes block                                │
│  2. Immediately update visual representation (optimistic)    │
│  3. Add to customBlocks array                                │
│  4. Add to pending batch with timestamp                      │
│  5. Wait for debounce interval (1 second)                    │
│  6. Send batch via HTTP POST /api/modifications              │
│                                                              │
│  SERVER:                                                     │
│  7. Receive batch, validate each modification sequentially   │
│  8. For each valid modification:                             │
│     a. Broadcast to regional pub/sub channel immediately     │
│     b. Queue for Redis persistence                           │
│  9. After all validations, persist batch to Redis (pipeline) │
│  10. Return response: { ok: true, failedAt: null }           │
│      or { ok: false, failedAt: index }                       │
│                                                              │
│  CLIENT (receiving broadcast):                               │
│  11. Receive modification via regional pub/sub               │
│  12. If from self, ignore (already applied optimistically)   │
│  13. If from other, apply to customBlocks and visual         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  Offline/Reconnect Flow                      │
│                                                              │
│  1. Client detects server unreachable (fetch fails)          │
│  2. Store modifications in localStorage                      │
│  3. Continue collecting modifications locally                │
│  4. On reconnect, send localStorage batch for validation     │
│  5. Server validates and returns failedAt index              │
│  6. Client clears localStorage up to failedAt                │
│  7. Client requests full state sync for affected chunks      │
└─────────────────────────────────────────────────────────────┘
```

### Regional Pub/Sub Architecture

```
World divided into 5x5 chunk regions:

Region (0,0): Chunks (0-4, 0-4)
Region (1,0): Chunks (5-9, 0-4)
Region (0,1): Chunks (0-4, 5-9)
...

For draw distance 3, state buffer 6:
- Player covers ~13x13 chunks = 169 chunks
- This spans ~3x3 regions = 9 regions
- Client subscribes to 9 regional channels
- As player moves, subscribe/unsubscribe regions

Channel naming: "region:${level}:${regionX}:${regionZ}"
Example: "region:default:0:0"
```

## Components and Interfaces

### 1. Server-Side Components

#### 1.1 Enhanced Connection Handler

```typescript
interface InitialStateResponse {
  type: "connected";
  channel: string;
  username: string;
  sessionId: string;
  level: string;
  terrainSeeds: TerrainSeeds;
  spawnPosition: { x: number; y: number; z: number };
  initialChunks: ChunkStateData[];
  players: PlayerData[];
}

interface ChunkStateData {
  chunkX: number;
  chunkZ: number;
  blocks: BlockData[];
}

interface BlockData {
  x: number;
  y: number;
  z: number;
  type: number;
  username: string;
  timestamp: number;
}

// Calculate initial chunks (2x draw distance buffer)
function calculateInitialChunks(
  spawnPosition: { x: number; y: number; z: number },
  drawDistance: number
): Array<{ chunkX: number; chunkZ: number }> {
  const chunks: Array<{ chunkX: number; chunkZ: number }> = [];
  const buffer = drawDistance * 2;

  const spawnChunkX = Math.floor(spawnPosition.x / CHUNK_SIZE);
  const spawnChunkZ = Math.floor(spawnPosition.z / CHUNK_SIZE);

  for (let x = spawnChunkX - buffer; x <= spawnChunkX + buffer; x++) {
    for (let z = spawnChunkZ - buffer; z <= spawnChunkZ + buffer; z++) {
      chunks.push({ chunkX: x, chunkZ: z });
    }
  }

  return chunks;
}
```

#### 1.2 HTTP Modification Endpoint

```typescript
interface ModificationBatchRequest {
  username: string;
  level: string;
  modifications: Array<{
    position: { x: number; y: number; z: number };
    blockType: number | null; // null for removal
    action: "place" | "remove";
    clientTimestamp: number;
  }>;
}

interface ModificationBatchResponse {
  ok: boolean;
  failedAt: number | null; // Index where validation failed, null if all succeeded
  message?: string;
}

// Express endpoint
app.post("/api/modifications", async (req, res) => {
  const batch: ModificationBatchRequest = req.body;

  console.log(
    `Received batch of ${batch.modifications.length} modifications from ${batch.username}`
  );

  const validatedMods: any[] = [];
  let failedAt: number | null = null;

  // Validate each modification sequentially
  for (let i = 0; i < batch.modifications.length; i++) {
    const mod = batch.modifications[i];

    const isValid = await validateModification(batch.level, mod);

    if (!isValid) {
      failedAt = i;
      console.log(`Validation failed at index ${i}`);
      break;
    }

    // Add server timestamp
    const serverMod = {
      ...mod,
      username: batch.username,
      serverTimestamp: Date.now(),
    };

    validatedMods.push(serverMod);

    // Immediately broadcast to regional channel
    const chunkX = Math.floor(mod.position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(mod.position.z / CHUNK_SIZE);
    const regionChannel = getRegionalChannel(batch.level, chunkX, chunkZ);

    await realtime.send(regionChannel, {
      type: "block-modify",
      ...serverMod,
    });
  }

  // Persist validated modifications to Redis (batched)
  if (validatedMods.length > 0) {
    await persistModificationBatch(batch.level, validatedMods);
  }

  // Send response
  res.json({
    ok: failedAt === null,
    failedAt: failedAt,
    message:
      failedAt === null
        ? `${validatedMods.length} modifications applied`
        : `Validation failed at modification ${failedAt}`,
  });
});

// Validate a single modification
async function validateModification(level: string, mod: any): Promise<boolean> {
  const { position, action, blockType } = mod;

  // Check bounds
  if (
    Math.abs(position.x) > 10000 * CHUNK_SIZE ||
    Math.abs(position.z) > 10000 * CHUNK_SIZE ||
    position.y < 0 ||
    position.y > 255
  ) {
    return false;
  }

  const chunkX = Math.floor(position.x / CHUNK_SIZE);
  const chunkZ = Math.floor(position.z / CHUNK_SIZE);
  const chunkKey = getChunkKey(level, chunkX, chunkZ);
  const blockKey = getBlockKey(position.x, position.y, position.z);

  const existingBlock = await redisStore.hGet(chunkKey, blockKey);

  if (action === "place") {
    // Can't place where block already exists
    if (existingBlock) {
      return false;
    }
  } else if (action === "remove") {
    // Can't remove non-existent block
    if (!existingBlock) {
      return false;
    }
  }

  return true;
}

// Persist batch to Redis using pipeline
async function persistModificationBatch(
  level: string,
  modifications: any[]
): Promise<void> {
  const pipeline = redisStore.pipeline();

  for (const mod of modifications) {
    const { position, action, blockType, username, serverTimestamp } = mod;
    const chunkX = Math.floor(position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(position.z / CHUNK_SIZE);
    const chunkKey = getChunkKey(level, chunkX, chunkZ);
    const blockKey = getBlockKey(position.x, position.y, position.z);

    if (action === "place") {
      pipeline.hSet(
        chunkKey,
        blockKey,
        JSON.stringify({
          type: blockType,
          username,
          timestamp: serverTimestamp,
        })
      );
    } else {
      pipeline.hDel(chunkKey, blockKey);
    }
  }

  await pipeline.exec();
  console.log(`Persisted ${modifications.length} modifications to Redis`);
}
```

#### 1.3 Regional Channel Helpers

```typescript
const REGION_SIZE = 5; // 5x5 chunks per region

function getRegionalChannel(
  level: string,
  chunkX: number,
  chunkZ: number
): string {
  const regionX = Math.floor(chunkX / REGION_SIZE);
  const regionZ = Math.floor(chunkZ / REGION_SIZE);
  return `region:${level}:${regionX}:${regionZ}`;
}

function getRegionCoordinates(
  chunkX: number,
  chunkZ: number
): { regionX: number; regionZ: number } {
  return {
    regionX: Math.floor(chunkX / REGION_SIZE),
    regionZ: Math.floor(chunkZ / REGION_SIZE),
  };
}
```

#### 1.4 Chunk State Request Handler (HTTP)

```typescript
interface ChunkStateRequest {
  username: string;
  level: string;
  chunks: Array<{ chunkX: number; chunkZ: number }>;
}

interface ChunkStateResponse {
  chunks: ChunkStateData[];
  requestTimestamp: number;
  responseTimestamp: number;
}

app.post("/api/chunk-state", async (req, res) => {
  const request: ChunkStateRequest = req.body;
  const { level, chunks } = request;

  console.log(
    `Chunk state request for ${chunks.length} chunks in level ${level}`
  );

  // Validate chunk coordinates
  const validChunks = chunks.filter(({ chunkX, chunkZ }) => {
    return Math.abs(chunkX) <= 10000 && Math.abs(chunkZ) <= 10000;
  });

  // Use Redis pipelining for parallel fetches
  const pipeline = redisStore.pipeline();

  for (const { chunkX, chunkZ } of validChunks) {
    const chunkKey = getChunkKey(level, chunkX, chunkZ);
    pipeline.hGetAll(chunkKey);
  }

  const results = await pipeline.exec();

  // Process results
  const chunkStates: ChunkStateData[] = [];
  for (let i = 0; i < validChunks.length; i++) {
    const { chunkX, chunkZ } = validChunks[i];
    const chunkData = results[i][1]; // [error, result]

    const blocks = parseChunkData(chunkData);
    chunkStates.push({ chunkX, chunkZ, blocks });
  }

  res.json({
    chunks: chunkStates,
    requestTimestamp: Date.now(),
    responseTimestamp: Date.now(),
  });
});

function parseChunkData(chunkData: any): BlockData[] {
  if (!chunkData) return [];

  return Object.entries(chunkData).map(([key, value]) => {
    const [_, xStr, yStr, zStr] = key.split(":");
    const data = JSON.parse(value as string);

    return {
      x: parseInt(xStr, 10),
      y: parseInt(yStr, 10),
      z: parseInt(zStr, 10),
      type: data.type,
      username: data.username,
      timestamp: data.timestamp,
    };
  });
}
```

### 2. Client-Side Components

#### 2.1 Chunk State Manager

```typescript
interface LoadedChunk {
  chunkX: number;
  chunkZ: number;
  blocks: Block[];
  loadedAt: number;
}

interface PendingModification {
  position: { x: number; y: number; z: number };
  blockType: number | null;
  action: "place" | "remove";
  clientTimestamp: number;
}

class ChunkStateManager {
  // State tracking
  private loadedChunks: Map<string, LoadedChunk> = new Map();
  private subscribedRegions: Set<string> = new Set();
  private pendingRequests: Set<string> = new Set();

  // Modification batching
  private pendingBatch: PendingModification[] = [];
  private batchTimer: number | null = null;
  private readonly DEBOUNCE_INTERVAL = 1000; // 1 second, configurable
  private readonly MAX_BATCH_SIZE = 100; // configurable

  // Configuration
  private drawDistance: number;
  private stateBuffer: number; // 2x draw distance
  private readonly REGION_SIZE = 5;

  // Dependencies
  private username: string = "";
  private level: string = "";
  private connection: RealtimeConnection | null = null;

  constructor(drawDistance: number) {
    this.drawDistance = drawDistance;
    this.stateBuffer = drawDistance * 2;
  }

  // ===== CHUNK KEY HELPERS =====

  private getChunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX}_${chunkZ}`;
  }

  private getRegionKey(regionX: number, regionZ: number): string {
    return `${regionX}_${regionZ}`;
  }

  private getRegionCoordinates(
    chunkX: number,
    chunkZ: number
  ): { regionX: number; regionZ: number } {
    return {
      regionX: Math.floor(chunkX / this.REGION_SIZE),
      regionZ: Math.floor(chunkZ / this.REGION_SIZE),
    };
  }

  private getRegionalChannel(chunkX: number, chunkZ: number): string {
    const { regionX, regionZ } = this.getRegionCoordinates(chunkX, chunkZ);
    return `region:${this.level}:${regionX}:${regionZ}`;
  }

  // ===== CHUNK LOADING =====

  isChunkLoaded(chunkX: number, chunkZ: number): boolean {
    return this.loadedChunks.has(this.getChunkKey(chunkX, chunkZ));
  }

  getChunkBlocks(chunkX: number, chunkZ: number): Block[] | null {
    const chunk = this.loadedChunks.get(this.getChunkKey(chunkX, chunkZ));
    return chunk ? chunk.blocks : null;
  }

  storeChunk(chunkX: number, chunkZ: number, blocks: Block[]): void {
    const key = this.getChunkKey(chunkX, chunkZ);
    this.loadedChunks.set(key, {
      chunkX,
      chunkZ,
      blocks,
      loadedAt: Date.now(),
    });
    this.pendingRequests.delete(key);

    console.log(
      `ChunkStateManager: Loaded chunk (${chunkX}, ${chunkZ}) with ${blocks.length} blocks`
    );
  }

  getRequiredChunks(
    playerChunkX: number,
    playerChunkZ: number
  ): Array<{ chunkX: number; chunkZ: number }> {
    const required: Array<{ chunkX: number; chunkZ: number }> = [];

    for (
      let x = playerChunkX - this.stateBuffer;
      x <= playerChunkX + this.stateBuffer;
      x++
    ) {
      for (
        let z = playerChunkZ - this.stateBuffer;
        z <= playerChunkZ + this.stateBuffer;
        z++
      ) {
        required.push({ chunkX: x, chunkZ: z });
      }
    }

    return required;
  }

  getMissingChunks(
    requiredChunks: Array<{ chunkX: number; chunkZ: number }>
  ): Array<{ chunkX: number; chunkZ: number }> {
    return requiredChunks.filter(({ chunkX, chunkZ }) => {
      const key = this.getChunkKey(chunkX, chunkZ);
      return !this.loadedChunks.has(key) && !this.pendingRequests.has(key);
    });
  }

  markPending(chunks: Array<{ chunkX: number; chunkZ: number }>): void {
    for (const { chunkX, chunkZ } of chunks) {
      this.pendingRequests.add(this.getChunkKey(chunkX, chunkZ));
    }
  }

  unloadDistantChunks(playerChunkX: number, playerChunkZ: number): void {
    const unloadDistance = this.stateBuffer + this.drawDistance; // 3x draw distance
    const toUnload: string[] = [];

    for (const [key, chunk] of this.loadedChunks.entries()) {
      const distX = Math.abs(chunk.chunkX - playerChunkX);
      const distZ = Math.abs(chunk.chunkZ - playerChunkZ);

      if (distX > unloadDistance || distZ > unloadDistance) {
        toUnload.push(key);
      }
    }

    for (const key of toUnload) {
      this.loadedChunks.delete(key);
      console.log(`ChunkStateManager: Unloaded distant chunk ${key}`);
    }
  }

  // ===== REGIONAL SUBSCRIPTIONS =====

  getRequiredRegions(
    playerChunkX: number,
    playerChunkZ: number
  ): Array<{ regionX: number; regionZ: number }> {
    const regions = new Set<string>();
    const requiredChunks = this.getRequiredChunks(playerChunkX, playerChunkZ);

    for (const { chunkX, chunkZ } of requiredChunks) {
      const { regionX, regionZ } = this.getRegionCoordinates(chunkX, chunkZ);
      regions.add(this.getRegionKey(regionX, regionZ));
    }

    return Array.from(regions).map((key) => {
      const [regionX, regionZ] = key.split("_").map(Number);
      return { regionX, regionZ };
    });
  }

  async updateSubscriptions(
    playerChunkX: number,
    playerChunkZ: number
  ): Promise<void> {
    if (!this.connection) return;

    const requiredRegions = this.getRequiredRegions(playerChunkX, playerChunkZ);
    const requiredKeys = new Set(
      requiredRegions.map(({ regionX, regionZ }) =>
        this.getRegionKey(regionX, regionZ)
      )
    );

    // Unsubscribe from regions no longer needed
    for (const regionKey of this.subscribedRegions) {
      if (!requiredKeys.has(regionKey)) {
        const [regionX, regionZ] = regionKey.split("_").map(Number);
        const channel = `region:${this.level}:${regionX}:${regionZ}`;

        this.connection.ws.send(
          JSON.stringify({
            type: "unsubscribe",
            channel,
          })
        );

        this.subscribedRegions.delete(regionKey);
        console.log(
          `ChunkStateManager: Unsubscribed from region (${regionX}, ${regionZ})`
        );
      }
    }

    // Subscribe to new regions
    for (const { regionX, regionZ } of requiredRegions) {
      const regionKey = this.getRegionKey(regionX, regionZ);

      if (!this.subscribedRegions.has(regionKey)) {
        const channel = `region:${this.level}:${regionX}:${regionZ}`;

        this.connection.ws.send(
          JSON.stringify({
            type: "subscribe",
            channel,
            level: this.level,
          })
        );

        this.subscribedRegions.add(regionKey);
        console.log(
          `ChunkStateManager: Subscribed to region (${regionX}, ${regionZ})`
        );
      }
    }
  }

  // ===== MODIFICATION BATCHING =====

  addModification(
    position: { x: number; y: number; z: number },
    blockType: number | null,
    action: "place" | "remove"
  ): void {
    const modification: PendingModification = {
      position,
      blockType,
      action,
      clientTimestamp: Date.now(),
    };

    this.pendingBatch.push(modification);
    console.log(
      `ChunkStateManager: Added modification to batch (${this.pendingBatch.length}/${this.MAX_BATCH_SIZE})`
    );

    // Send immediately if batch is full
    if (this.pendingBatch.length >= this.MAX_BATCH_SIZE) {
      console.log("ChunkStateManager: Batch full, sending immediately");
      this.flushBatch();
      return;
    }

    // Otherwise, debounce
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = window.setTimeout(() => {
      this.flushBatch();
    }, this.DEBOUNCE_INTERVAL);
  }

  async flushBatch(): Promise<void> {
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingBatch.length === 0) {
      return;
    }

    const batch = [...this.pendingBatch];
    this.pendingBatch = [];

    console.log(
      `ChunkStateManager: Flushing batch of ${batch.length} modifications`
    );

    try {
      const response = await fetch("http://localhost:3000/api/modifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username,
          level: this.level,
          modifications: batch,
        }),
      });

      const result: ModificationBatchResponse = await response.json();

      if (!result.ok) {
        console.error(`Batch validation failed at index ${result.failedAt}`);
        // TODO: Handle validation failure (revert changes, request state sync)
      } else {
        console.log(
          `Batch of ${batch.length} modifications validated successfully`
        );
      }
    } catch (error) {
      console.error("Failed to send modification batch:", error);
      // Store in localStorage for retry
      this.storeOfflineBatch(batch);
    }
  }

  // ===== OFFLINE PERSISTENCE =====

  private storeOfflineBatch(batch: PendingModification[]): void {
    const existing = this.getOfflineBatches();
    existing.push(...batch);
    localStorage.setItem(
      `offline_mods_${this.level}`,
      JSON.stringify(existing)
    );
    console.log(
      `ChunkStateManager: Stored ${batch.length} modifications offline`
    );
  }

  private getOfflineBatches(): PendingModification[] {
    const stored = localStorage.getItem(`offline_mods_${this.level}`);
    return stored ? JSON.parse(stored) : [];
  }

  async syncOfflineModifications(): Promise<void> {
    const offline = this.getOfflineBatches();

    if (offline.length === 0) {
      return;
    }

    console.log(
      `ChunkStateManager: Syncing ${offline.length} offline modifications`
    );

    try {
      const response = await fetch("http://localhost:3000/api/modifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username,
          level: this.level,
          modifications: offline,
        }),
      });

      const result: ModificationBatchResponse = await response.json();

      if (result.ok) {
        // All offline modifications validated, clear localStorage
        localStorage.removeItem(`offline_mods_${this.level}`);
        console.log(
          "ChunkStateManager: All offline modifications synced successfully"
        );
      } else {
        // Some modifications failed, keep the failed ones
        const failed = offline.slice(result.failedAt!);
        localStorage.setItem(
          `offline_mods_${this.level}`,
          JSON.stringify(failed)
        );
        console.log(
          `ChunkStateManager: ${failed.length} offline modifications failed validation`
        );

        // TODO: Request state sync for affected chunks
      }
    } catch (error) {
      console.error("Failed to sync offline modifications:", error);
      // Keep in localStorage for next attempt
    }
  }

  // ===== LIFECYCLE =====

  setConnection(
    connection: RealtimeConnection,
    username: string,
    level: string
  ): void {
    this.connection = connection;
    this.username = username;
    this.level = level;
  }

  clear(): void {
    this.loadedChunks.clear();
    this.subscribedRegions.clear();
    this.pendingRequests.clear();
    this.pendingBatch = [];

    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    console.log("ChunkStateManager: Cleared all state");
  }
}
```

#### 2.2 Enhanced Multiplayer Manager

```typescript
class MultiplayerManager {
  private chunkStateManager: ChunkStateManager;
  private currentChunk: { x: number; z: number } = { x: 0, z: 0 };
  private lastChunkCheckTime: number = 0;
  private chunkCheckInterval: number = 200; // Check every 200ms
  private maxConcurrentRequests: number = 5;
  private activeRequests: number = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    terrain: Terrain
  ) {
    // ... existing code ...
    this.chunkStateManager = new ChunkStateManager(terrain.distance);
  }

  async connect(level: string = "default"): Promise<void> {
    // ... existing connection code ...

    // Set connection in chunk state manager
    this.chunkStateManager.setConnection(
      this.connection!,
      this.username,
      level
    );
  }

  // Handle initial connection with chunk states
  private handleConnected(data: any): void {
    console.log(
      "MultiplayerManager: Received connected message with initial chunks"
    );

    this.setUsername(data.username);

    // Apply terrain seeds
    if (data.terrainSeeds) {
      this.terrain.setSeeds(data.terrainSeeds.seed);
    }

    // Load initial chunk states
    if (data.initialChunks && data.initialChunks.length > 0) {
      console.log(
        `MultiplayerManager: Loading ${data.initialChunks.length} initial chunks`
      );

      for (const chunkData of data.initialChunks) {
        this.loadChunkState(chunkData);
      }

      // Regenerate terrain with loaded state
      this.terrain.generate();
    }

    // Subscribe to initial regional channels
    const spawnChunkX = Math.floor(
      data.spawnPosition.x / this.terrain.chunkSize
    );
    const spawnChunkZ = Math.floor(
      data.spawnPosition.z / this.terrain.chunkSize
    );
    this.chunkStateManager.updateSubscriptions(spawnChunkX, spawnChunkZ);

    // Sync any offline modifications
    this.chunkStateManager.syncOfflineModifications();

    // Handle existing players
    if (data.players) {
      for (const playerData of data.players) {
        if (playerData.username !== this.username) {
          const position = new THREE.Vector3(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
          );
          this.createPlayerEntity(playerData.username, position);
        }
      }
    }
  }

  // Load chunk state into terrain
  private loadChunkState(chunkData: any): void {
    const blocks: Block[] = [];

    for (const blockData of chunkData.blocks) {
      const block = new Block(
        blockData.x,
        blockData.y,
        blockData.z,
        blockData.type,
        true, // placed = true
        blockData.username,
        blockData.timestamp
      );
      blocks.push(block);

      // Add to terrain's customBlocks array
      this.terrain.customBlocks.push(block);
    }

    // Store in chunk state manager
    this.chunkStateManager.storeChunk(
      chunkData.chunkX,
      chunkData.chunkZ,
      blocks
    );
  }

  // Request chunk states from server (HTTP)
  private async requestChunkStates(
    chunks: Array<{ chunkX: number; chunkZ: number }>
  ): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    // Limit concurrent requests
    if (this.activeRequests >= this.maxConcurrentRequests) {
      console.log(
        "MultiplayerManager: Max concurrent requests reached, deferring chunk request"
      );
      return;
    }

    // Sort by distance from player (closest first)
    const playerChunkX = this.currentChunk.x;
    const playerChunkZ = this.currentChunk.z;

    chunks.sort((a, b) => {
      const distA =
        Math.abs(a.chunkX - playerChunkX) + Math.abs(a.chunkZ - playerChunkZ);
      const distB =
        Math.abs(b.chunkX - playerChunkX) + Math.abs(b.chunkZ - playerChunkZ);
      return distA - distB;
    });

    // Take only what we can handle
    const toRequest = chunks.slice(
      0,
      this.maxConcurrentRequests - this.activeRequests
    );

    console.log(`MultiplayerManager: Requesting ${toRequest.length} chunks`);

    this.chunkStateManager.markPending(toRequest);
    this.activeRequests++;

    try {
      const response = await fetch("http://localhost:3000/api/chunk-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username,
          level: this.terrain.level || "default",
          chunks: toRequest,
        }),
      });

      const data = await response.json();
      this.handleChunkStateResponse(data);
    } catch (error) {
      console.error("Failed to request chunk states:", error);
      this.activeRequests--;
      // TODO: Retry logic
    }
  }

  // Handle chunk state response
  private handleChunkStateResponse(data: any): void {
    console.log(`MultiplayerManager: Received ${data.chunks.length} chunks`);

    this.activeRequests--;

    for (const chunkData of data.chunks) {
      this.loadChunkState(chunkData);
    }

    // Regenerate terrain if needed
    this.terrain.generate();
  }

  // Enhanced block modification handler (from pub/sub)
  private handleBlockModification(data: any): void {
    // Ignore self-originated modifications (already applied optimistically)
    if (data.username === this.username) {
      console.log(
        "MultiplayerManager: Ignoring self-originated block modification"
      );
      return;
    }

    const position = new THREE.Vector3(
      data.position.x,
      data.position.y,
      data.position.z
    );
    const chunkX = Math.floor(data.position.x / this.terrain.chunkSize);
    const chunkZ = Math.floor(data.position.z / this.terrain.chunkSize);

    // Check if chunk is loaded
    if (!this.chunkStateManager.isChunkLoaded(chunkX, chunkZ)) {
      console.log(
        `MultiplayerManager: Chunk (${chunkX}, ${chunkZ}) not loaded, ignoring modification`
      );
      return;
    }

    console.log(
      "MultiplayerManager: Applying block modification from",
      data.username
    );

    // Apply modification
    this.applyBlockModification(position, data);
  }

  // Send block modification (optimistic + batched)
  sendBlockModification(
    position: THREE.Vector3,
    blockType: BlockType | null,
    action: "place" | "remove"
  ): void {
    // Add to batch (will be sent after debounce interval)
    this.chunkStateManager.addModification(
      {
        x: position.x,
        y: position.y,
        z: position.z,
      },
      blockType,
      action
    );
  }

  // Monitor player position and load chunks/update subscriptions
  update(delta: number): void {
    // ... existing player update code ...

    // Check for chunk loading and subscription updates (debounced)
    const now = Date.now();
    if (now - this.lastChunkCheckTime > this.chunkCheckInterval) {
      this.lastChunkCheckTime = now;
      this.checkAndLoadChunks();
    }
  }

  // Check if new chunks need loading and update subscriptions
  private checkAndLoadChunks(): void {
    const playerChunkX = Math.floor(
      this.camera.position.x / this.terrain.chunkSize
    );
    const playerChunkZ = Math.floor(
      this.camera.position.z / this.terrain.chunkSize
    );

    // Update current chunk
    this.currentChunk = { x: playerChunkX, z: playerChunkZ };

    // Get required chunks
    const required = this.chunkStateManager.getRequiredChunks(
      playerChunkX,
      playerChunkZ
    );

    // Get missing chunks
    const missing = this.chunkStateManager.getMissingChunks(required);

    if (missing.length > 0) {
      console.log(`MultiplayerManager: ${missing.length} chunks need loading`);
      this.requestChunkStates(missing);
    }

    // Update regional subscriptions
    this.chunkStateManager.updateSubscriptions(playerChunkX, playerChunkZ);

    // Unload distant chunks
    this.chunkStateManager.unloadDistantChunks(playerChunkX, playerChunkZ);
  }

  // Enhanced disconnect handler
  disconnect(): void {
    // Flush any pending modifications before disconnect
    this.chunkStateManager.flushBatch();

    // ... existing disconnect code ...
    this.chunkStateManager.clear();
  }
}
```

## Data Models

### Redis Storage Schema

```
# Chunk-based storage (already implemented)
level:${level}:chunk:${chunkX}:${chunkZ} -> HASH {
  "block:${x}:${y}:${z}": JSON {
    type: number,
    username: string,
    timestamp: number
  }
}

# Example:
level:default:chunk:0:0 -> HASH {
  "block:5:25:10": '{"type":0,"username":"Player123","timestamp":1234567890}',
  "block:6:25:10": '{"type":1,"username":"Player456","timestamp":1234567891}'
}
```

### Client-Side Storage

```typescript
// ChunkStateManager internal storage
Map<string, LoadedChunk> where key = "${chunkX}_${chunkZ}"

// Regional subscriptions
Set<string> where each entry = "${regionX}_${regionZ}"

// localStorage for offline modifications
localStorage["offline_mods_${level}"] = JSON.stringify([
  {
    position: { x: 5, y: 25, z: 10 },
    blockType: 0,
    action: "place",
    clientTimestamp: 1234567890
  },
  ...
])
```

## Performance Considerations

### Initial Load Optimization

For draw distance = 3, state buffer = 6:

- Chunks to load: (6\*2+1)² = 169 chunks
- With Redis pipelining: ~50-100ms for all chunks
- Acceptable for initial load

### Regional Subscription Optimization

For draw distance = 3, state buffer = 6:

- Chunks covered: 13x13 = 169 chunks
- Regions covered: ~3x3 = 9 regions (5x5 chunks per region)
- 9 WebSocket subscriptions vs 169 if per-chunk
- Significant reduction in connection overhead

### Modification Batching Optimization

- Default debounce: 1 second
- Max batch size: 100 modifications
- Typical building: 5-10 blocks/second = 5-10 per batch
- Rapid building: 20+ blocks/second = sends at max batch size
- Reduces HTTP requests by 10-100x

### Memory Management

- Each chunk: ~100-1000 blocks average
- Each block: ~100 bytes
- 169 chunks _ 500 blocks _ 100 bytes = ~8.5 MB
- Acceptable for modern browsers
- Unloading distant chunks keeps memory bounded

## Error Handling

### Modification Batch Failure

```typescript
// In ChunkStateManager.flushBatch()
try {
  const response = await fetch("/api/modifications", { ... });
  const result = await response.json();

  if (!result.ok) {
    // Validation failed at specific index
    console.error(`Validation failed at index ${result.failedAt}`);

    // Request state sync for affected chunks
    const failedMod = batch[result.failedAt!];
    const chunkX = Math.floor(failedMod.position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(failedMod.position.z / CHUNK_SIZE);

    // TODO: Request chunk state and revert local changes
  }
} catch (error) {
  // Network error - store in localStorage
  this.storeOfflineBatch(batch);
}
```

### Chunk Request Retry

```typescript
private async requestChunkStatesWithRetry(
  chunks: Array<{ chunkX: number; chunkZ: number }>,
  retries: number = 3
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await this.requestChunkStates(chunks);
      return; // Success
    } catch (error) {
      console.error(`Chunk request failed (attempt ${attempt}/${retries}):`, error);

      if (attempt === retries) {
        console.error("CRITICAL: Failed to load chunks after all retries");
        // Show error to user
      } else {
        // Exponential backoff
        await this.sleep(Math.pow(2, attempt) * 100);
      }
    }
  }
}
```

## Testing Strategy

### Unit Tests

1. **ChunkStateManager**

   - Test chunk key generation
   - Test region coordinate calculation
   - Test getRequiredChunks calculation
   - Test getMissingChunks filtering
   - Test modification batching and debouncing
   - Test offline storage and retrieval

2. **Regional Channel Calculation**
   - Test getRegionalChannel for various chunk positions
   - Test getRequiredRegions for various player positions
   - Test edge cases (negative coordinates, region boundaries)

### Integration Tests

1. **Initial Load Flow**

   - Connect client and verify initial chunks are loaded
   - Verify customBlocks array is populated
   - Verify terrain generates with loaded state
   - Verify regional subscriptions are created

2. **Incremental Load Flow**

   - Move player to new chunk
   - Verify missing chunks are requested
   - Verify chunks are loaded and applied
   - Verify regional subscriptions update

3. **Modification Batching**

   - Place multiple blocks rapidly
   - Verify modifications are batched
   - Verify batch is sent after debounce interval
   - Verify batch is sent immediately when full

4. **Offline Resilience**

   - Disconnect client
   - Place blocks while offline
   - Verify blocks stored in localStorage
   - Reconnect client
   - Verify offline modifications are validated and synced

5. **Regional Broadcasting**
   - Connect two clients in same region
   - Have one client place blocks
   - Verify other client receives updates
   - Move second client to different region
   - Verify they no longer receive updates from first region

### Performance Tests

1. **Initial Load Performance**

   - Measure time to load 169 chunks
   - Verify < 1 second for typical world

2. **Modification Batch Performance**

   - Measure time to send and validate 100-modification batch
   - Verify < 200ms

3. **Regional Subscription Performance**

   - Measure time to subscribe/unsubscribe from 9 regions
   - Verify < 100ms

4. **Memory Usage**
   - Monitor memory with 169 loaded chunks
   - Verify unloading works correctly

## Migration Path

1. **Phase 1: Server-Side Infrastructure**

   - Add HTTP endpoints for modifications and chunk state
   - Implement validation logic
   - Implement regional broadcasting
   - Test with single client

2. **Phase 2: Client-Side State Manager**

   - Implement ChunkStateManager class
   - Implement modification batching
   - Implement offline storage
   - Test batching and offline logic

3. **Phase 3: Initial Load Integration**

   - Handle initial chunks in connection flow
   - Populate customBlocks before terrain generation
   - Subscribe to initial regional channels
   - Test with multiple clients

4. **Phase 4: Incremental Load Integration**

   - Implement position monitoring
   - Implement chunk request batching
   - Implement regional subscription updates
   - Test while moving around world

5. **Phase 5: Modification Flow Integration**

   - Integrate optimistic updates with batching
   - Handle validation responses
   - Test with multiple clients building simultaneously

6. **Phase 6: Offline Resilience**

   - Implement localStorage persistence
   - Implement offline sync on reconnect
   - Test disconnect/reconnect scenarios

7. **Phase 7: Optimization and Polish**
   - Implement retry logic and error handling
   - Add loading indicators
   - Performance testing and tuning
   - Comprehensive integration testing
