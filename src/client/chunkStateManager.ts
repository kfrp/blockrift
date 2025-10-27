import Block from "./mesh/block";
import { RealtimeConnection, connectRealtime } from "./realtime";

/**
 * Represents a loaded chunk with its blocks and metadata
 */
export interface LoadedChunk {
  chunkX: number;
  chunkZ: number;
  blocks: Block[];
  loadedAt: number;
}
function logInfo(_: any) {}
/**
 * Represents a pending block modification waiting to be sent to server
 */
export interface PendingModification {
  position: { x: number; y: number; z: number };
  blockType: number | null;
  action: "place" | "remove";
  clientTimestamp: number;
}

/**
 * ChunkStateManager - Manages chunk loading, regional subscriptions, and modification batching
 *
 * This class is responsible for:
 * - Tracking which chunks are loaded and their block data
 * - Managing regional pub/sub subscriptions (5x5 chunk regions)
 * - Batching block modifications with debouncing
 * - Handling offline persistence via localStorage
 * - Coordinating chunk loading and unloading based on player position
 */
export class ChunkStateManager {
  // ===== STATE TRACKING =====

  /**
   * Map of loaded chunks, keyed by "${chunkX}_${chunkZ}"
   */
  private loadedChunks: Map<string, LoadedChunk> = new Map();

  /**
   * Set of subscribed regional channels, keyed by "${regionX}_${regionZ}"
   */
  private subscribedRegions: Set<string> = new Set();

  /**
   * Set of chunks currently being requested, keyed by "${chunkX}_${chunkZ}"
   */
  private pendingRequests: Set<string> = new Set();

  // ===== MODIFICATION BATCHING =====

  /**
   * Array of modifications waiting to be sent to server
   */
  private pendingBatch: PendingModification[] = [];

  /**
   * Timer for debouncing batch sends
   */
  private batchTimer: number | null = null;

  // ===== CONFIGURATION CONSTANTS =====

  /**
   * Time to wait before sending a batch of modifications (milliseconds)
   */
  private readonly DEBOUNCE_INTERVAL = 1000;

  /**
   * Maximum number of modifications in a batch before sending immediately
   */
  private readonly MAX_BATCH_SIZE = 100;

  /**
   * Size of a region in chunks (5x5 chunks per region)
   */
  private readonly REGION_SIZE = 15;

  // ===== DERIVED CONFIGURATION =====

  /**
   * Draw distance in chunks (from terrain configuration)
   */
  private drawDistance: number;

  /**
   * State buffer in chunks (2x draw distance)
   * This is the area of chunks we keep loaded around the player
   */
  private stateBuffer: number;

  // ===== DEPENDENCIES =====

  /**
   * Current player username
   */
  private username: string = "";

  /**
   * Current game level/world identifier
   */
  private level: string = "";

  /**
   * Map of active regional channel connections
   */
  private activeConnections: Map<string, RealtimeConnection> = new Map();

  /**
   * Creates a new ChunkStateManager
   *
   * @param drawDistance - The draw distance in chunks from terrain configuration
   */
  constructor(drawDistance: number) {
    this.drawDistance = drawDistance;
    this.stateBuffer = drawDistance * 2;

    logInfo(
      `ChunkStateManager: Initialized with draw distance ${drawDistance}, state buffer ${this.stateBuffer}`
    );
  }

  // ===== CHUNK KEY HELPERS =====

  /**
   * Generates a unique key for a chunk based on its coordinates
   *
   * @param chunkX - The X coordinate of the chunk
   * @param chunkZ - The Z coordinate of the chunk
   * @returns A string key in the format "${chunkX}_${chunkZ}"
   */
  private getChunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX}_${chunkZ}`;
  }

  /**
   * Generates a unique key for a region based on its coordinates
   *
   * @param regionX - The X coordinate of the region
   * @param regionZ - The Z coordinate of the region
   * @returns A string key in the format "${regionX}_${regionZ}"
   */
  private getRegionKey(regionX: number, regionZ: number): string {
    return `${regionX}_${regionZ}`;
  }

  /**
   * Calculates the region coordinates for a given chunk
   * Regions are 5x5 chunks in size
   *
   * @param chunkX - The X coordinate of the chunk
   * @param chunkZ - The Z coordinate of the chunk
   * @returns An object containing regionX and regionZ coordinates
   */
  private getRegionCoordinates(
    chunkX: number,
    chunkZ: number
  ): { regionX: number; regionZ: number } {
    return {
      regionX: Math.floor(chunkX / this.REGION_SIZE),
      regionZ: Math.floor(chunkZ / this.REGION_SIZE),
    };
  }

  // ===== CHUNK LOADING METHODS =====

  /**
   * Checks if a chunk is currently loaded
   *
   * @param chunkX - The X coordinate of the chunk
   * @param chunkZ - The Z coordinate of the chunk
   * @returns true if the chunk is loaded, false otherwise
   */
  isChunkLoaded(chunkX: number, chunkZ: number): boolean {
    return this.loadedChunks.has(this.getChunkKey(chunkX, chunkZ));
  }

  /**
   * Retrieves the blocks for a loaded chunk
   *
   * @param chunkX - The X coordinate of the chunk
   * @param chunkZ - The Z coordinate of the chunk
   * @returns The array of blocks in the chunk, or null if the chunk is not loaded
   */
  getChunkBlocks(chunkX: number, chunkZ: number): Block[] | null {
    const chunk = this.loadedChunks.get(this.getChunkKey(chunkX, chunkZ));
    return chunk ? chunk.blocks : null;
  }

  /**
   * Stores a chunk's blocks in the loaded chunks map
   * Also removes the chunk from pending requests
   *
   * @param chunkX - The X coordinate of the chunk
   * @param chunkZ - The Z coordinate of the chunk
   * @param blocks - The array of blocks in the chunk
   */
  storeChunk(chunkX: number, chunkZ: number, blocks: Block[]): void {
    const key = this.getChunkKey(chunkX, chunkZ);
    this.loadedChunks.set(key, {
      chunkX,
      chunkZ,
      blocks,
      loadedAt: Date.now(),
    });
    this.pendingRequests.delete(key);

    logInfo(
      `ChunkStateManager: Loaded chunk (${chunkX}, ${chunkZ}) with ${blocks.length} blocks`
    );
  }

  /**
   * Calculates all chunks that should be loaded based on player position
   * Returns chunks within the state buffer (2x draw distance) around the player
   *
   * @param playerChunkX - The X coordinate of the player's current chunk
   * @param playerChunkZ - The Z coordinate of the player's current chunk
   * @returns An array of chunk coordinates that should be loaded
   */
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

  /**
   * Filters a list of required chunks to find which ones need to be loaded
   * Excludes chunks that are already loaded or currently being requested
   *
   * @param requiredChunks - Array of chunk coordinates that should be loaded
   * @returns Array of chunk coordinates that need to be loaded
   */
  getMissingChunks(
    requiredChunks: Array<{ chunkX: number; chunkZ: number }>
  ): Array<{ chunkX: number; chunkZ: number }> {
    return requiredChunks.filter(({ chunkX, chunkZ }) => {
      const key = this.getChunkKey(chunkX, chunkZ);
      return !this.loadedChunks.has(key) && !this.pendingRequests.has(key);
    });
  }

  /**
   * Marks chunks as pending (currently being requested)
   * This prevents duplicate requests for the same chunks
   *
   * @param chunks - Array of chunk coordinates to mark as pending
   */
  markPending(chunks: Array<{ chunkX: number; chunkZ: number }>): void {
    for (const { chunkX, chunkZ } of chunks) {
      this.pendingRequests.add(this.getChunkKey(chunkX, chunkZ));
    }
  }

  /**
   * Unloads chunks that are too far from the player
   * Chunks beyond 3x draw distance are removed to free memory
   *
   * @param playerChunkX - The X coordinate of the player's current chunk
   * @param playerChunkZ - The Z coordinate of the player's current chunk
   */
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
      logInfo(`ChunkStateManager: Unloaded distant chunk ${key}`);
    }
  }

  // ===== REGIONAL SUBSCRIPTION MANAGEMENT =====

  /**
   * Calculates all regions that should be subscribed based on player position
   * Returns unique regions covering all required chunks within the state buffer
   *
   * @param playerChunkX - The X coordinate of the player's current chunk
   * @param playerChunkZ - The Z coordinate of the player's current chunk
   * @returns An array of unique region coordinates that should be subscribed
   */
  getRequiredRegions(
    playerChunkX: number,
    playerChunkZ: number
  ): Array<{ regionX: number; regionZ: number }> {
    const regions = new Set<string>();
    const requiredChunks = this.getRequiredChunks(playerChunkX, playerChunkZ);

    // Calculate region for each required chunk and deduplicate
    for (const { chunkX, chunkZ } of requiredChunks) {
      const { regionX, regionZ } = this.getRegionCoordinates(chunkX, chunkZ);
      regions.add(this.getRegionKey(regionX, regionZ));
    }

    // Convert Set back to array of region coordinates
    return Array.from(regions).map((key) => {
      const [regionX, regionZ] = key.split("_").map(Number);
      return { regionX, regionZ };
    });
  }

  /**
   * Updates regional pub/sub subscriptions based on player position
   * Unsubscribes from regions no longer needed and subscribes to new regions
   *
   * @param playerChunkX - The X coordinate of the player's current chunk
   * @param playerChunkZ - The Z coordinate of the player's current chunk
   * @param onMessage - Callback for handling messages from subscribed channels
   */
  async updateSubscriptions(
    playerChunkX: number,
    playerChunkZ: number,
    onMessage: (data: any) => void
  ): Promise<void> {
    const requiredRegions = this.getRequiredRegions(playerChunkX, playerChunkZ);
    const requiredKeys = new Set(
      requiredRegions.map(({ regionX, regionZ }) =>
        this.getRegionKey(regionX, regionZ)
      )
    );

    // Unsubscribe from regions no longer needed
    for (const regionKey of this.subscribedRegions) {
      if (!requiredKeys.has(regionKey)) {
        const connection = this.activeConnections.get(regionKey);
        if (connection) {
          await connection.disconnect();
          this.activeConnections.delete(regionKey);
        }

        this.subscribedRegions.delete(regionKey);
        logInfo(`ChunkStateManager: Unsubscribed from region ${regionKey}`);
      }
    }

    // Subscribe to new regions
    for (const { regionX, regionZ } of requiredRegions) {
      const regionKey = this.getRegionKey(regionX, regionZ);

      if (!this.subscribedRegions.has(regionKey)) {
        const channel = `region:${this.level}:${regionX}:${regionZ}`;

        const connection = await connectRealtime({
          channel,
          onConnect: (ch) => {
            logInfo(`ChunkStateManager: Connected to ${ch}`);
          },
          onDisconnect: (ch) => {
            logInfo(`ChunkStateManager: Disconnected from ${ch}`);
          },
          onMessage,
        });

        this.activeConnections.set(regionKey, connection);
        this.subscribedRegions.add(regionKey);
        logInfo(
          `ChunkStateManager: Subscribed to region (${regionX}, ${regionZ})`
        );
      }
    }
  }

  // ===== MODIFICATION BATCHING METHODS =====

  /**
   * Adds a block modification to the pending batch
   * Modifications are debounced and sent in batches to reduce server load
   *
   * @param position - The world position of the block
   * @param blockType - The type of block (or null for removal)
   * @param action - Whether this is a "place" or "remove" action
   */
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
    logInfo(
      `ChunkStateManager: Added modification to batch (${this.pendingBatch.length}/${this.MAX_BATCH_SIZE})`
    );

    // Send immediately if batch is full
    if (this.pendingBatch.length >= this.MAX_BATCH_SIZE) {
      logInfo("ChunkStateManager: Batch full, sending immediately");
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

  /**
   * Flushes the pending batch of modifications to the server
   * Sends via HTTP POST and handles validation responses
   */
  async flushBatch(): Promise<void> {
    // Clear the debounce timer
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Return early if no modifications to send
    if (this.pendingBatch.length === 0) {
      return;
    }

    // Copy and clear the pending batch
    const batch = [...this.pendingBatch];
    this.pendingBatch = [];

    logInfo(
      `ChunkStateManager: Flushing batch of ${batch.length} modifications (username="${this.username}", level="${this.level}")`
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

      const result = await response.json();

      if (!result.ok) {
        console.error(
          `ChunkStateManager: Batch validation failed at index ${result.failedAt}`
        );
        // TODO: Handle validation failure (revert changes, request state sync)
      } else {
        logInfo(
          `ChunkStateManager: Batch of ${batch.length} modifications validated successfully`
        );
      }
    } catch (error) {
      console.error(
        "ChunkStateManager: Failed to send modification batch:",
        error
      );
      // Store in localStorage for retry
      this.storeOfflineBatch(batch);
    }
  }

  /**
   * Stores a batch of modifications in localStorage for offline persistence
   *
   * @param batch - The array of modifications to store
   */
  private storeOfflineBatch(batch: PendingModification[]): void {
    const existing = this.getOfflineBatches();
    existing.push(...batch);
    localStorage.setItem(
      `offline_mods_${this.level}`,
      JSON.stringify(existing)
    );
    logInfo(`ChunkStateManager: Stored ${batch.length} modifications offline`);
  }

  /**
   * Retrieves offline modifications from localStorage
   *
   * @returns Array of pending modifications stored offline
   */
  private getOfflineBatches(): PendingModification[] {
    const stored = localStorage.getItem(`offline_mods_${this.level}`);
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * Syncs offline modifications to the server on reconnect
   * Validates all offline modifications and clears localStorage on success
   * If validation fails, keeps only the failed modifications in localStorage
   */
  async syncOfflineModifications(): Promise<void> {
    const offline = this.getOfflineBatches();

    // Return early if no offline modifications
    if (offline.length === 0) {
      return;
    }

    logInfo(
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

      const result = await response.json();

      if (result.ok) {
        // All offline modifications validated successfully, clear localStorage
        localStorage.removeItem(`offline_mods_${this.level}`);
        logInfo(
          "ChunkStateManager: All offline modifications synced successfully"
        );
      } else {
        // Some modifications failed validation, keep only the failed ones
        const failed = offline.slice(result.failedAt!);
        localStorage.setItem(
          `offline_mods_${this.level}`,
          JSON.stringify(failed)
        );
        logInfo(
          `ChunkStateManager: ${failed.length} offline modifications failed validation at index ${result.failedAt}`
        );

        // TODO: Request state sync for affected chunks
      }
    } catch (error) {
      console.error(
        "ChunkStateManager: Failed to sync offline modifications:",
        error
      );
      // Keep in localStorage for next attempt
    }
  }

  // ===== LIFECYCLE METHODS =====

  /**
   * Sets the user context for the chunk state manager
   *
   * @param username - The current player's username
   * @param level - The current game level/world identifier
   */
  setConnection(username: string, level: string): void {
    this.username = username;
    this.level = level;
    logInfo(
      `ChunkStateManager: setConnection called with username="${username}", level="${level}"`
    );
  }

  /**
   * Gets the current level
   */
  getLevel(): string {
    return this.level;
  }

  /**
   * Clears all state from the chunk state manager
   * Called on disconnect or when resetting the game state
   */
  async clear(): Promise<void> {
    // Disconnect all active regional connections
    for (const [regionKey, connection] of this.activeConnections.entries()) {
      await connection.disconnect();
      logInfo(`ChunkStateManager: Disconnected from region ${regionKey}`);
    }
    this.activeConnections.clear();

    this.loadedChunks.clear();
    this.subscribedRegions.clear();
    this.pendingRequests.clear();
    this.pendingBatch = [];

    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    logInfo("ChunkStateManager: Cleared all state");
  }
}
