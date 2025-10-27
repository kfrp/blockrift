/** Multiplayer Manager - Handles all multiplayer synchronization **/
import * as THREE from "three";
import Terrain, { BlockType } from "./terrain";
import Block from "./mesh/block";
import PlayerEntityRenderer from "./playerEntityRenderer";
import { ChunkStateManager } from "./chunkStateManager";

/**
 * Represents another player in the multiplayer world
 */
interface PlayerEntity {
  username: string;
  renderer: PlayerEntityRenderer;
}
export type Rotation = { x: number; y: number };
/**
 * Chunk state data received from server
 */
interface ChunkStateData {
  chunkX: number;
  chunkZ: number;
  blocks: Array<{
    x: number;
    y: number;
    z: number;
    type?: number;
    username: string;
    timestamp: number;
    placed: boolean;
    removed?: boolean;
  }>;
}

/**
 * Message types for server communication
 */
interface BlockModificationMessage {
  type: "block-modify";
  username: string;
  position: { x: number; y: number; z: number };
  blockType: number | null;
  action: "place" | "remove";
  clientTimestamp: number;
  serverTimestamp?: number;
}

interface PositionUpdatesBroadcast {
  type: "player-positions";
  players: Array<{
    username: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }>;
}

/**
 * MultiplayerManager - Manages multiplayer state and communication
 *
 * Responsibilities:
 * - Connection management with server
 * - Player entity tracking and rendering
 * - Block modification synchronization
 * - Position update broadcasting and interpolation
 */
export default class MultiplayerManager {
  private username: string = "";
  private players: Map<string, PlayerEntity> = new Map();
  private playerLastSeen: Map<string, number> = new Map(); // Track when we last saw each player
  private terrain: Terrain;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private chunkStateManager: ChunkStateManager;
  private cleanupInterval: number | null = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    terrain: Terrain
  ) {
    this.scene = scene;
    this.camera = camera;
    this.terrain = terrain;
    this.chunkStateManager = new ChunkStateManager(terrain.distance);
  }

  /**
   * Connect to the multiplayer server
   * @param level - Optional level identifier (defaults to "default")
   */
  async connect(level: string = "default"): Promise<void> {
    try {
      const response = await fetch("http://localhost:3000/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });

      const data = await response.json();
      this.setUsername(data.username);

      // Apply terrain seeds
      if (data.terrainSeeds && data.terrainSeeds.seed !== undefined) {
        this.terrain.setSeeds(data.terrainSeeds.seed);
      } else throw new Error("No seed from server");

      // Load initial chunk states
      if (data.initialChunks && data.initialChunks.length > 0) {
        for (const chunkData of data.initialChunks) {
          this.loadChunkState(chunkData);
        }
        this.terrain.generate();
      }

      // Create initial player entities from the HTTP response
      if (data.players && Array.isArray(data.players)) {
        for (const playerData of data.players) {
          if (playerData.username !== this.username) {
            const position = new THREE.Vector3(
              playerData.position.x,
              playerData.position.y,
              playerData.position.z
            );
            this.createPlayerEntity(playerData.username, position);

            // Set initial rotation if provided
            if (playerData.rotation) {
              const player = this.players.get(playerData.username);
              if (player) {
                const rotation = {
                  x: playerData.rotation.x,
                  y: playerData.rotation.y,
                };
                player.renderer.setTargetState(
                  position,
                  rotation,
                  this.username
                );
              }
            }
          }
        }
      }

      // Set connection info in chunk state manager
      this.chunkStateManager.setConnection(data.username, level);

      // Subscribe to initial regional channels based on spawn position
      if (data.spawnPosition) {
        const spawnChunkX = Math.floor(
          data.spawnPosition.x / this.terrain.chunkSize
        );
        const spawnChunkZ = Math.floor(
          data.spawnPosition.z / this.terrain.chunkSize
        );

        await this.chunkStateManager.updateSubscriptions(
          spawnChunkX,
          spawnChunkZ,
          (broadcastData) => this.handleMessage(broadcastData)
        );
      }

      // Sync offline modifications on connect
      this.chunkStateManager.syncOfflineModifications();

      // Start cleanup interval for stale players
      this.cleanupInterval = window.setInterval(() => {
        this.cleanupStalePlayers();
      }, 5000); // Check every 5 seconds
    } catch (error) {
      console.error("MultiplayerManager: Failed to connect", error);
      throw error;
    }
  }

  /**
   * Disconnect from the multiplayer server
   */
  async disconnect(): Promise<void> {
    // Stop cleanup interval
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Call chunkStateManager.flushBatch before disconnect
    await this.chunkStateManager.flushBatch();

    // Notify server of disconnect via HTTP
    if (this.username) {
      try {
        await fetch("http://localhost:3000/api/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: this.username,
            level: this.chunkStateManager.getLevel(),
          }),
        });
      } catch (error) {
        console.error("MultiplayerManager: Failed to send disconnect", error);
      }
    }

    // Clean up all player entities
    for (const [username, _] of this.players) {
      this.removePlayerEntity(username);
    }
    this.players.clear();
    this.playerLastSeen.clear();

    // Call chunkStateManager.clear and disconnect all channels
    await this.chunkStateManager.clear();
  }

  /**
   * Get the current username
   */
  getUsername(): string {
    return this.username;
  }

  /**
   * Set the username (called when server assigns it)
   */
  setUsername(username: string): void {
    this.username = username;
  }

  /**
   * Route incoming messages to appropriate handlers
   */
  private handleMessage(data: any): void {
    if (!data || !data.type) {
      console.warn("MultiplayerManager: Received invalid message", data);
      return;
    }
    switch (data.type) {
      case "block-modify":
        this.handleBlockModification(data as BlockModificationMessage);
        break;
      case "player-positions":
        this.handlePositionUpdates(data as PositionUpdatesBroadcast);
        break;
      default:
        return;
    }
  }

  /**
   * Load chunk state data into terrain
   * Creates Block objects from blockData array and stores in chunk state manager
   */
  private loadChunkState(chunkData: ChunkStateData): void {
    const blocks: Block[] = [];

    // Create Block objects from blockData array
    for (const blockData of chunkData.blocks) {
      const block = new Block(
        blockData.x,
        blockData.y,
        blockData.z,
        blockData.type || 0, // Use 0 as default for removed blocks
        blockData.placed, // Use the placed field from server
        blockData.username,
        blockData.timestamp
      );
      blocks.push(block);

      // Add blocks to terrain.customBlocks array
      this.terrain.customBlocks.push(block);

      // If this is a removed block, generate adjacent blocks to fill the hole
      if (!blockData.placed) {
        this.terrain.generateAdjacentBlocks(
          new THREE.Vector3(blockData.x, blockData.y, blockData.z)
        );
      }
    }

    // Call chunkStateManager.storeChunk with blocks
    this.chunkStateManager.storeChunk(
      chunkData.chunkX,
      chunkData.chunkZ,
      blocks
    );
  }

  private handleBlockModification(data: BlockModificationMessage): void {
    // Check if modification is from self (ignore to prevent duplicate)
    // Requirement 6.4: Ignore self-originated modifications
    if (data.username === this.username) {
      console.log(
        "MultiplayerManager: Ignoring self-originated block modification"
      );
      return;
    }

    console.log(
      "MultiplayerManager: Applying block modification from",
      data.username,
      data
    );

    const position = new THREE.Vector3(
      data.position.x,
      data.position.y,
      data.position.z
    );

    // Requirement 6.1, 6.2, 6.3: Check for conflicts with local modifications
    const conflict = this.detectConflict(position);
    if (conflict) {
      // Requirement 6.5, 10.1: Log conflicts for monitoring
      console.warn(
        `MultiplayerManager: Conflict detected at position (${position.x}, ${position.y}, ${position.z})`,
        {
          localTimestamp: conflict.localTimestamp,
          serverTimestamp: data.serverTimestamp || data.clientTimestamp,
          localUsername: conflict.localUsername,
          remoteUsername: data.username,
          action: data.action,
        }
      );

      // Requirement 6.2: Override local changes if server timestamp is newer
      if (this.shouldOverrideLocal(conflict, data)) {
        console.log(
          "MultiplayerManager: Server timestamp is newer, overriding local change"
        );
        this.applyBlockModification(position, data);
      } else {
        console.log(
          "MultiplayerManager: Local timestamp is newer or equal, keeping local change"
        );
        // Don't apply the modification - local change wins
      }
    } else {
      // No conflict, apply the modification normally
      this.applyBlockModification(position, data);
    }
  }

  /**
   * Detect if there's a conflict between a received modification and local state
   * Requirement 6.1: Check if same position was modified locally
   */
  private detectConflict(
    position: THREE.Vector3
  ): { localTimestamp: number; localUsername: string } | null {
    // Check if we have a local modification at this position
    for (const customBlock of this.terrain.customBlocks) {
      if (
        customBlock.x === position.x &&
        customBlock.y === position.y &&
        customBlock.z === position.z &&
        customBlock.username === this.username
      ) {
        // Found a local modification at this position
        return {
          localTimestamp: customBlock.timestamp,
          localUsername: customBlock.username,
        };
      }
    }
    return null;
  }

  /**
   * Determine if local change should be overridden by server modification
   * Requirement 6.2: Override local changes if server timestamp is newer
   */
  private shouldOverrideLocal(
    conflict: { localTimestamp: number; localUsername: string },
    data: BlockModificationMessage
  ): boolean {
    const serverTimestamp = data.serverTimestamp || data.clientTimestamp;
    // Server timestamp is newer (or equal, in which case server wins)
    return serverTimestamp >= conflict.localTimestamp;
  }

  /**
   * Apply a block modification to the terrain
   * Extracted from handleBlockModification for reuse in conflict resolution
   */
  private applyBlockModification(
    position: THREE.Vector3,
    data: BlockModificationMessage
  ): void {
    const matrix = new THREE.Matrix4();

    if (data.action === "remove") {
      // Handle block removal
      // Find the block in the terrain and remove it
      const blockType = this.findAndRemoveBlock(position);

      if (blockType !== null) {
        // Update customBlocks array with received modification
        // Requirement 5.2, 5.3: Track username and timestamp
        let existed = false;
        for (const customBlock of this.terrain.customBlocks) {
          if (
            customBlock.x === position.x &&
            customBlock.y === position.y &&
            customBlock.z === position.z
          ) {
            existed = true;
            // Mark existing custom block as removed
            customBlock.placed = false;
            customBlock.username = data.username;
            customBlock.timestamp =
              data.serverTimestamp || data.clientTimestamp;
          }
        }

        // If this was a procedurally generated block, add it to custom blocks as removed
        if (!existed) {
          this.terrain.customBlocks.push(
            new Block(
              position.x,
              position.y,
              position.z,
              blockType,
              false, // placed = false means removed
              data.username,
              data.serverTimestamp || data.clientTimestamp
            )
          );
        }

        // Generate blocks beneath/around removed block (for infinite depth)
        this.terrain.generateAdjacentBlocks(position);
      }
    } else if (data.action === "place" && data.blockType !== null) {
      // Handle block placement
      // Update appropriate InstancedMesh for the block type
      // Requirement 8.5: Update InstancedMesh
      matrix.setPosition(position.x, position.y, position.z);

      this.terrain.blocks[data.blockType].setMatrixAt(
        this.terrain.getCount(data.blockType),
        matrix
      );
      this.terrain.setCount(data.blockType);

      // Mark for update
      this.terrain.blocks[data.blockType].instanceMatrix.needsUpdate = true;

      // Update customBlocks array with received modification
      // Requirement 5.2, 5.3: Track username and timestamp
      this.terrain.customBlocks.push(
        new Block(
          position.x,
          position.y,
          position.z,
          data.blockType,
          true, // placed = true
          data.username,
          data.serverTimestamp || data.clientTimestamp
        )
      );
    }
  }

  /**
   * Find and remove a block at the given position
   * Returns the block type that was removed, or null if no block found
   */
  private findAndRemoveBlock(position: THREE.Vector3): BlockType | null {
    // Search through all block types to find the block at this position
    for (
      let blockType = 0;
      blockType < this.terrain.blocks.length;
      blockType++
    ) {
      const blockMesh = this.terrain.blocks[blockType];
      const matrix = new THREE.Matrix4();

      // Check each instance in this block type's mesh
      for (let i = 0; i < blockMesh.count; i++) {
        blockMesh.getMatrixAt(i, matrix);
        const blockPosition = new THREE.Vector3().setFromMatrixPosition(matrix);

        // Check if this instance is at the target position
        if (
          Math.round(blockPosition.x) === position.x &&
          Math.round(blockPosition.y) === position.y &&
          Math.round(blockPosition.z) === position.z
        ) {
          // Remove the block by setting its matrix to zero
          blockMesh.setMatrixAt(
            i,
            new THREE.Matrix4().set(
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            )
          );
          blockMesh.instanceMatrix.needsUpdate = true;

          return blockType as BlockType;
        }
      }
    }

    return null; // No block found at this position
  }

  /**
   * Handle batched position updates for all players
   * Updates or creates player entities from the broadcast
   */
  private handlePositionUpdates(data: PositionUpdatesBroadcast): void {
    const now = Date.now();

    // Update or create players from the broadcast
    for (const playerData of data.players) {
      const { username, position, rotation } = playerData;

      // Ignore updates from self
      if (username === this.username) {
        continue;
      }

      // Mark that we've seen this player
      this.playerLastSeen.set(username, now);

      // Find or create player entity
      let player = this.players.get(username);
      if (!player) {
        // Player not in our map - create them
        const playerPosition = new THREE.Vector3(
          position.x,
          position.y,
          position.z
        );
        this.createPlayerEntity(username, playerPosition);
        player = this.players.get(username);

        if (!player) continue; // Safety check

        console.log(`MultiplayerManager: Player ${username} appeared`);
      }

      // Update player position and rotation
      const targetPosition = new THREE.Vector3(
        position.x,
        position.y,
        position.z
      );
      const targetRotation = new THREE.Euler(
        rotation.x,
        rotation.y,
        rotation.z
      );
      player.renderer.setTargetState(
        targetPosition,
        targetRotation,
        this.username
      );
    }
  }

  /**
   * Clean up players we haven't seen in any broadcast for a while
   * Called periodically to remove stale players
   */
  private cleanupStalePlayers(): void {
    const now = Date.now();
    const STALE_TIMEOUT = 10000; // 10 seconds - if we haven't seen a player in any broadcast

    for (const [username, lastSeen] of Array.from(
      this.playerLastSeen.entries()
    )) {
      if (now - lastSeen > STALE_TIMEOUT) {
        const player = this.players.get(username);
        if (player) {
          console.log(`MultiplayerManager: Removing stale player ${username}`);
          this.disposePlayerEntity(player);
          this.removePlayerEntity(username);
        }
        this.playerLastSeen.delete(username);
      }
    }
  }

  /**
   * Send block modification to server
   */
  sendBlockModification(
    position: THREE.Vector3,
    blockType: BlockType | null,
    action: "place" | "remove"
  ): void {
    if (!this.username) {
      console.warn(
        "MultiplayerManager: Cannot send block modification, not connected"
      );
      return;
    }

    // Use the new HTTP batching system via chunkStateManager
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

  /**
   * Send position update to server via HTTP
   */
  async sendPositionUpdate(
    position: THREE.Vector3,
    rotation: Rotation
  ): Promise<void> {
    if (!this.username) {
      return;
    }

    const body = {
      username: this.username,
      position: {
        x: Math.round(position.x * 100) / 100, // Round to 2 decimal places
        y: Math.round(position.y * 100) / 100,
        z: Math.round(position.z * 100) / 100,
      },
      rotation: {
        x: rotation.x,
        y: rotation.y,
      },
    };

    try {
      await fetch("http://localhost:3000/api/position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.error(
        "MultiplayerManager: Failed to send position update",
        error
      );
    }
  }

  /**
   * Create a visual representation for a player entity
   */
  private createPlayerEntity(
    username: string,
    position: THREE.Vector3
  ): PlayerEntity | undefined {
    // Instantiate PlayerEntityRenderer
    if (username === this.username) return;
    const renderer = new PlayerEntityRenderer(username, position);

    // Add renderer.group to scene
    this.scene.add(renderer.group);

    const playerEntity: PlayerEntity = {
      username,
      renderer,
    };

    this.players.set(username, playerEntity);
    console.log(`MultiplayerManager: Created player entity for ${username}`);

    return playerEntity;
  }

  /**
   * Dispose of all resources for a player entity
   * Properly cleans up meshes, geometries, materials, and textures by traversing the object tree.
   */
  private disposePlayerEntity(player: PlayerEntity): void {
    const renderer = player.renderer;

    // Helper function to recursively dispose of an object and its children
    const disposeRecursive = (object: THREE.Object3D) => {
      // Dispose of the object itself if it's a mesh
      if (object instanceof THREE.Mesh) {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          // Handle both single and arrays of materials
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      }
      // Recursively dispose of children
      object.children.forEach(disposeRecursive);
    };

    // Start disposal from the main group
    disposeRecursive(renderer.group);

    // Specifically handle the label's texture, as it's not a standard mesh material
    if (
      renderer.label &&
      renderer.label.material &&
      renderer.label.material.map
    ) {
      renderer.label.material.map.dispose();
    }

    console.log(
      `MultiplayerManager: Disposed resources for player ${player.username}`
    );
  }

  /**
   * Remove a player entity from the scene
   */
  private removePlayerEntity(username: string): void {
    const player = this.players.get(username);
    if (player) {
      // Remove renderer.group from scene
      this.scene.remove(player.renderer.group);
      this.players.delete(username);
      console.log(`MultiplayerManager: Removed player entity for ${username}`);
    }
  }

  /**
   * Update loop - called every frame for interpolation and visual effects.
   */
  update(delta: number): void {
    // Helper function to recursively set opacity on all meshes in an object
    const setOpacityRecursive = (object: THREE.Object3D, opacity: number) => {
      if (object instanceof THREE.Mesh) {
        const material = object.material as THREE.MeshStandardMaterial;
        // Ensure material exists and has an opacity property
        if (material && typeof material.opacity !== "undefined") {
          material.transparent = opacity < 1.0;
          material.opacity = opacity;
        }
      }
      // Recurse through all children
      for (const child of object.children) {
        setOpacityRecursive(child, opacity);
      }
    };

    for (const player of this.players.values()) {
      player.renderer.update(delta);

      const EYE_HEIGHT = 1.6;
      player.renderer.group.position.y =
        player.renderer.targetPosition.y - EYE_HEIGHT;

      const distanceToCamera = this.camera.position.distanceTo(
        player.renderer.group.position
      );

      // Scale down players when they are very close to the camera
      const minScaleDistance = 0.5;
      const maxScaleDistance = 5.0;
      let scale = 1.0;

      if (distanceToCamera < maxScaleDistance) {
        scale = Math.max(
          0.3,
          0.3 +
            (0.7 * (distanceToCamera - minScaleDistance)) /
              (maxScaleDistance - minScaleDistance)
        );
      }
      player.renderer.group.scale.setScalar(scale);

      // Reduce opacity when player is very close to the camera
      const minOpacityDistance = 0.5;
      const maxOpacityDistance = 3.0;
      let opacity = 1.0;

      if (distanceToCamera < maxOpacityDistance) {
        opacity = Math.max(
          0.2,
          0.2 +
            (0.8 * (distanceToCamera - minOpacityDistance)) /
              (maxOpacityDistance - minOpacityDistance)
        );
      }

      // Apply opacity to all meshes in the player model recursively
      setOpacityRecursive(player.renderer.group, opacity);

      // Also apply opacity to the username label sprite
      if (player.renderer.label.material) {
        player.renderer.label.material.opacity = opacity;
      }

      // Ensure username label always faces the camera
      player.renderer.label.lookAt(this.camera.position);
    }
  }
}
