/** Multiplayer Manager - Handles all multiplayer synchronization **/
import * as THREE from "three";
import { connectRealtime, RealtimeConnection } from "./realtime";
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

interface PositionUpdateMessage {
  type: "player-position";
  username: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

interface PositionUpdatesBroadcast {
  type: "player-positions";
  players: Array<{
    username: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }>;
}

interface PlayerJoinedMessage {
  type: "player-joined";
  username: string;
  position: { x: number; y: number; z: number };
}

interface PlayerLeftMessage {
  type: "player-left";
  username: string;
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
  private connection: RealtimeConnection | null = null;
  private username: string = "";
  private players: Map<string, PlayerEntity> = new Map();
  private terrain: Terrain;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private chunkStateManager: ChunkStateManager;

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
      console.log("data", data);
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
                const rotation = new THREE.Euler(
                  playerData.rotation.x,
                  playerData.rotation.y,
                  playerData.rotation.z
                );
                player.renderer.setTargetState(position, rotation);
              }
            }
          }
        }
      }

      // Step 2: Connect to WebSocket for broadcasts
      // Use level-specific channel to prevent cross-level player visibility
      const gameChannel = `game-channel:${level}`;

      this.connection = await connectRealtime({
        channel: gameChannel,
        level: level,
        onConnect: () => {
          this.handleConnected(data, level);
        },
        onDisconnect: () => {
          this.handleDisconnect();
        },
        onMessage: (broadcastData) => {
          this.handleMessage(broadcastData);
        },
      });
    } catch (error) {
      console.error("MultiplayerManager: Failed to connect", error);
      throw error;
    }
  }

  /**
   * Disconnect from the multiplayer server
   */
  disconnect(): void {
    // Call chunkStateManager.flushBatch before disconnect
    this.chunkStateManager.flushBatch();

    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }

    // Clean up all player entities
    for (const [username, _] of this.players) {
      this.removePlayerEntity(username);
    }
    this.players.clear();

    // Call chunkStateManager.clear in disconnect method
    this.chunkStateManager.clear();
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
    if (!this.connection) {
      setTimeout(() => this.handleMessage(data), 500);
      return;
    }
    switch (data.type) {
      case "block-modify":
        this.handleBlockModification(data as BlockModificationMessage);
        break;
      case "player-positions":
        this.handlePositionUpdates(data as PositionUpdatesBroadcast);
        break;
      case "player-joined":
        this.handlePlayerJoined(data as PlayerJoinedMessage);
        break;
      case "player-left":
        this.handlePlayerLeft(data as PlayerLeftMessage);
        break;
      default:
        return;
    }
  }

  /**
   * Handle WebSocket connection confirmation
   * This is called after the WebSocket connects, but initial data has already been processed
   */
  private handleConnected(data: any, level: string): void {
    if (!this.connection) {
      setTimeout(() => this.handleConnected(data, level), 500);
      return;
    }

    // Set connection in chunk state manager for regional subscriptions
    this.chunkStateManager.setConnection(
      this.connection!,
      data.username,
      level
    );

    // Subscribe to initial regional channels
    // Calculate spawn chunk coordinates from spawn position
    if (data.spawnPosition) {
      const spawnChunkX = Math.floor(
        data.spawnPosition.x / this.terrain.chunkSize
      );
      const spawnChunkZ = Math.floor(
        data.spawnPosition.z / this.terrain.chunkSize
      );
      // Call chunkStateManager.updateSubscriptions with spawn chunk
      this.chunkStateManager.updateSubscriptions(spawnChunkX, spawnChunkZ);
    }

    // Sync offline modifications on connect
    this.chunkStateManager.syncOfflineModifications();

    console.log(
      "MultiplayerManager: WebSocket connected and subscriptions initialized"
    );
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
    const conflict = this.detectConflict(position, data);
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
    position: THREE.Vector3,
    data: BlockModificationMessage
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
   * Handle single position update from a player
   * Requirement 4.3: Update player entity position
   */
  private handlePositionUpdate(data: PositionUpdateMessage): void {
    // Extract username, position, and rotation from message
    const { username, position, rotation } = data;

    // Ignore updates from self
    if (username === this.username) {
      return;
    }

    // Find player entity in players map
    const player = this.players.get(username);
    if (!player) {
      console.warn(
        `MultiplayerManager: Received position update for unknown player: ${username}`
      );
      return;
    }

    // Call player.renderer.setTargetState with new position and rotation
    const targetPosition = new THREE.Vector3(
      position.x,
      position.y,
      position.z
    );
    const targetRotation = new THREE.Euler(rotation.x, rotation.y, rotation.z);
    player.renderer.setTargetState(targetPosition, targetRotation);
  }

  /**
   * Handle batched position updates for all players
   * Requirements: 4.3, 11.1
   */
  private handlePositionUpdates(data: PositionUpdatesBroadcast): void {
    // Iterate through players array in message
    for (const playerData of data.players) {
      const { username, position, rotation } = playerData;

      // Ignore updates from self
      if (username === this.username) {
        continue;
      }

      // Find player entity in players map
      const player = this.players.get(username);
      if (!player) {
        // Player not yet in our map - they may have just joined
        // This will be handled by player-joined event
        continue;
      }

      // Call setTargetState for each player's renderer
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
      player.renderer.setTargetState(targetPosition, targetRotation);
    }
  }

  /**
   * Handle player joined event
   * Requirements: 4.5, 7.3
   */
  private handlePlayerJoined(data: PlayerJoinedMessage): void {
    const { username, position } = data;

    // Ignore if this is our own username
    if (username === this.username) {
      console.log(
        "MultiplayerManager: Ignoring player-joined for self:",
        username
      );
      return;
    }

    // Check if player already exists (shouldn't happen, but handle gracefully)
    if (this.players.has(username)) {
      console.warn(
        `MultiplayerManager: Player ${username} already exists, skipping creation`
      );
      return;
    }

    // Create new PlayerEntityRenderer when player joins
    const playerPosition = new THREE.Vector3(
      position.x,
      position.y,
      position.z
    );
    this.createPlayerEntity(username, playerPosition);

    console.log(
      `MultiplayerManager: Player ${username} joined at position (${position.x}, ${position.y}, ${position.z})`
    );
  }

  /**
   * Handle player left event
   * Requirements: 4.5, 7.3
   */
  private handlePlayerLeft(data: PlayerLeftMessage): void {
    const { username } = data;

    // Ignore if this is our own username
    if (username === this.username) {
      return;
    }

    // Check if player exists
    if (!this.players.has(username)) {
      return;
    }

    // Remove player entity and cleanup resources when player leaves
    const player = this.players.get(username);
    if (player) {
      // Dispose of all meshes and materials properly
      this.disposePlayerEntity(player);
    }

    // Remove from players map
    this.removePlayerEntity(username);

    console.log(`MultiplayerManager: Player ${username} left the game`);
  }

  /**
   * Handle disconnection from server
   */
  private handleDisconnect(): void {
    // TODO: Implement reconnection logic in task 16
    console.log(
      "MultiplayerManager: Disconnected, reconnection not yet implemented"
    );
  }

  /**
   * Send block modification to server
   */
  sendBlockModification(
    position: THREE.Vector3,
    blockType: BlockType | null,
    action: "place" | "remove"
  ): void {
    if (!this.connection || !this.username) {
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
   * Send position update to server
   */
  sendPositionUpdate(position: THREE.Vector3, rotation: THREE.Euler): void {
    if (!this.connection || !this.username) {
      return;
    }

    const message: PositionUpdateMessage = {
      type: "player-position",
      username: this.username,
      position: {
        x: Math.round(position.x * 100) / 100, // Round to 2 decimal places
        y: Math.round(position.y * 100) / 100,
        z: Math.round(position.z * 100) / 100,
      },
      rotation: {
        x: Math.round(rotation.x * 100) / 100,
        y: Math.round(rotation.y * 100) / 100,
        z: Math.round(rotation.z * 100) / 100,
      },
    };

    try {
      this.connection.ws.send(JSON.stringify(message));
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
  ): PlayerEntity {
    // Instantiate PlayerEntityRenderer
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
   * Properly cleans up meshes, geometries, materials, and textures
   */
  private disposePlayerEntity(player: PlayerEntity): void {
    const renderer = player.renderer;

    // Dispose of all body part meshes
    const bodyParts = [
      renderer.head,
      renderer.torso,
      renderer.leftArm,
      renderer.rightArm,
      renderer.leftLeg,
      renderer.rightLeg,
    ];

    for (const mesh of bodyParts) {
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    }

    // Dispose of username label sprite
    if (renderer.label) {
      if (renderer.label.material) {
        // Dispose of the texture used by the sprite
        if (renderer.label.material.map) {
          renderer.label.material.map.dispose();
        }
        renderer.label.material.dispose();
      }
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
   * Update loop - called every frame for interpolation
   * Requirements: 4.3, 11.1
   */
  update(delta: number): void {
    // Iterate through all players in the map
    for (const [username, player] of this.players) {
      // Call player.renderer.update(deltaTime) for each player
      player.renderer.update(delta);

      // Adjust player position so feet are on the ground
      // The targetPosition is the camera/eye position, which is ~1.6 units above feet
      // So we offset the group down by 1.6 to place feet on the ground
      const EYE_HEIGHT = 1.6;
      player.renderer.group.position.y =
        player.renderer.targetPosition.y - EYE_HEIGHT;

      // Calculate distance from camera to player (using adjusted position)
      const distanceToCamera = this.camera.position.distanceTo(
        player.renderer.group.position
      );

      // Debug: log distance for very close players
      if (distanceToCamera < 5) {
        console.log(
          `Player ${username} distance: ${distanceToCamera.toFixed(2)}`
        );
      }

      // Scale down players when they are very close to camera (within 5 blocks)
      // This prevents giant body parts from blocking the view
      const minScaleDistance = 0.5; // Start scaling at 0.5 blocks
      const maxScaleDistance = 5.0; // Normal scale at 5 blocks
      let scale = 1.0;

      if (distanceToCamera < maxScaleDistance) {
        // Scale from 0.3 to 1.0 based on distance
        scale = Math.max(
          0.3,
          0.3 +
            (0.7 * (distanceToCamera - minScaleDistance)) /
              (maxScaleDistance - minScaleDistance)
        );
      }

      player.renderer.group.scale.setScalar(scale);

      // Reduce opacity when player is very close to camera (within 3 blocks)
      const minOpacityDistance = 0.5; // Start fading at 0.5 blocks
      const maxOpacityDistance = 3.0; // Full opacity at 3 blocks
      let opacity = 1.0;

      if (distanceToCamera < maxOpacityDistance) {
        // Linear fade from 0.2 to 1.0 based on distance
        opacity = Math.max(
          0.2,
          0.2 +
            (0.8 * (distanceToCamera - minOpacityDistance)) /
              (maxOpacityDistance - minOpacityDistance)
        );
      }

      // Apply opacity to all body parts
      const bodyParts = [
        player.renderer.head,
        player.renderer.torso,
        player.renderer.leftArm,
        player.renderer.rightArm,
        player.renderer.leftLeg,
        player.renderer.rightLeg,
      ];

      for (const mesh of bodyParts) {
        if (mesh.material) {
          const material = mesh.material as THREE.MeshStandardMaterial;
          material.transparent = true;
          material.opacity = opacity;
        }
      }

      // Also apply opacity to username label
      if (player.renderer.label.material) {
        player.renderer.label.material.opacity = opacity;
      }

      // Ensure username label sprite always faces camera using lookAt
      player.renderer.label.lookAt(this.camera.position);
    }
  }
}
