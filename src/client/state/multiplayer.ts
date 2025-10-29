/** Multiplayer Manager - Handles all multiplayer synchronization **/
import * as THREE from "three";
import Terrain, { BlockType } from "../terrain";
import Block from "../mesh/block";
import PlayerEntityRenderer from "../player/playerEntityRenderer";
import { ChunkStateManager } from "./chunkStateManager";
import { PlayerModeManager } from "../player/playerModeManager";
import { BuilderRecognitionManager } from "../ui/builderRecognitionManager";
import { UpvoteManager } from "../upvote/upvoteManager";
import { ChatManager } from "../ui/chatManager";
import { connectRealtime, type RealtimeConnection } from "../realtime";

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
 */
export default class MultiplayerManager {
  private username: string = "";
  private players: Map<string, PlayerEntity> = new Map();
  private playerLastSeen: Map<string, number> = new Map();
  private terrain: Terrain;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private chunkStateManager: ChunkStateManager;
  private cleanupInterval: number | null = null;
  private playerModeManager: PlayerModeManager;
  private builderRecognitionManager: BuilderRecognitionManager;
  private upvoteManager: UpvoteManager;
  private chatManager: ChatManager;
  private uiUpdateCallback: (() => void) | null = null;
  private blockRemovalFeedbackCallback: ((message: string) => void) | null =
    null;
  private friendshipNotificationCallback:
    | ((username: string, action: "added" | "removed") => void)
    | null = null;
  private currentPlayerChunk: { x: number; z: number } = { x: 0, z: 0 };
  private playerCount: number = 0;
  private level: string = "default";
  private gameLevelConnection: RealtimeConnection | null = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    terrain: Terrain,
    chatManager: ChatManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.terrain = terrain;
    this.chatManager = chatManager;
    this.chunkStateManager = new ChunkStateManager(terrain.distance);
    this.playerModeManager = new PlayerModeManager();
    this.builderRecognitionManager = new BuilderRecognitionManager(
      terrain,
      this.playerModeManager,
      scene
    );
    this.upvoteManager = new UpvoteManager("default", this.playerModeManager);
  }

  async connect(
    level: string = "default",
    connectionData?: any
  ): Promise<void> {
    try {
      let data = connectionData;

      // If no connection data provided, fetch it (backward compatibility)
      if (!data) {
        const response = await fetch(window.ENDPOINTS.CONNECT_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level }),
        });
        data = await response.json();
      }

      // Initialize player mode from connection response
      this.playerModeManager.initialize(data);
      this.setUsername(data.username);
      this.level = level;

      // Store initial player count
      if (data.playerCount !== undefined) {
        this.playerCount = data.playerCount;
        this.triggerUIUpdate();
      }

      // Recreate upvote manager with correct level
      this.upvoteManager = new UpvoteManager(level, this.playerModeManager);

      // Process terrain seeds
      if (data.terrainSeeds && data.terrainSeeds.seed !== undefined) {
        this.terrain.setSeeds(data.terrainSeeds.seed);
      } else throw new Error("No seed from server");

      // Process initial chunks
      if (data.initialChunks && data.initialChunks.length > 0) {
        for (const chunkData of data.initialChunks) {
          this.loadChunkState(chunkData);
        }
        this.terrain.generate();
      }

      // Create player entities for other players (never for self in any mode)
      if (data.players && Array.isArray(data.players)) {
        for (const playerData of data.players) {
          if (playerData.username !== data.username) {
            const position = new THREE.Vector3(
              playerData.position.x,
              playerData.position.y,
              playerData.position.z
            );
            this.createPlayerEntity(playerData.username, position);

            if (playerData.rotation) {
              const player = this.players.get(playerData.username);
              if (player) {
                const rotation = {
                  x: playerData.rotation.x,
                  y: playerData.rotation.y,
                };
                player.renderer.setTargetState(position, rotation);
              }
            }
          }
        }
      }

      this.chunkStateManager.setConnection(data.username, level);

      // Apply spawn position to camera
      if (data.spawnPosition) {
        this.camera.position.set(
          data.spawnPosition.x,
          data.spawnPosition.y,
          data.spawnPosition.z
        );
        console.log(
          `Set camera position to spawn: (${data.spawnPosition.x}, ${data.spawnPosition.y}, ${data.spawnPosition.z})`
        );
      }

      // Subscribe to regional channels in both modes
      if (data.spawnPosition) {
        const spawnChunkX = Math.floor(
          data.spawnPosition.x / this.terrain.chunkSize
        );
        const spawnChunkZ = Math.floor(
          data.spawnPosition.z / this.terrain.chunkSize
        );

        // Initialize current player chunk
        this.currentPlayerChunk = { x: spawnChunkX, z: spawnChunkZ };

        await this.chunkStateManager.updateSubscriptions(
          spawnChunkX,
          spawnChunkZ,
          (broadcastData) => this.handleMessage(broadcastData)
        );

        // Update builders list after subscription changes
        this.builderRecognitionManager.updateBuilders();
        this.triggerUIUpdate();
      }

      // Subscribe to game-level channel for friendship updates and player count
      // Disconnect existing connection first to prevent duplicate subscriptions
      if (this.gameLevelConnection) {
        console.log(
          `[DEBUG] Disconnecting existing game-level connection before reconnecting`
        );
        await this.gameLevelConnection.disconnect();
        this.gameLevelConnection = null;
      }

      const gameLevelChannel = `game:${level}`;
      this.gameLevelConnection = await connectRealtime({
        channel: gameLevelChannel,
        onConnect: (ch) => {
          console.log(
            `MultiplayerManager: Connected to game-level channel ${ch}`
          );
        },
        onDisconnect: (ch) => {
          console.log(
            `MultiplayerManager: Disconnected from game-level channel ${ch}`
          );
        },
        onMessage: (data) => this.handleMessage(data),
      });

      // Only sync offline modifications in player mode
      if (this.playerModeManager.isPlayerMode()) {
        this.chunkStateManager.syncOfflineModifications();
      }

      // Update builders list after initial chunks are loaded
      this.builderRecognitionManager.updateBuilders();

      this.cleanupInterval = window.setInterval(() => {
        this.cleanupStalePlayers();
      }, 5000);
    } catch (error) {
      console.error("MultiplayerManager: Failed to connect", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    await this.chunkStateManager.flushBatch();

    // Disconnect from game-level channel
    if (this.gameLevelConnection) {
      await this.gameLevelConnection.disconnect();
      this.gameLevelConnection = null;
    }

    if (this.username) {
      try {
        await fetch(window.ENDPOINTS.DISCONNECT_API, {
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

    for (const [username, _] of this.players) {
      this.removePlayerEntity(username);
    }
    this.players.clear();
    this.playerLastSeen.clear();

    await this.chunkStateManager.clear();
  }

  getUsername(): string {
    return this.username;
  }

  setUsername(username: string): void {
    this.username = username;
  }

  private handleMessage(data: any): void {
    if (!data || !data.type) {
      console.warn("MultiplayerManager: Received invalid message", data);
      return;
    }
    console.log(
      `[DEBUG] MultiplayerManager.handleMessage called with type: ${data.type}`
    );
    switch (data.type) {
      case "chat-message":
        this.chatManager.handleChatBroadcast({
          username: data.username,
          message: data.message,
          timestamp: data.timestamp,
        });
        return;
      case "block-modify":
        this.handleBlockModification(data as BlockModificationMessage);
        break;
      case "player-positions":
        this.handlePositionUpdates(data as PositionUpdatesBroadcast);
        break;
      case "friendship-added":
      case "friendship-removed":
        console.log(
          `[DEBUG] MultiplayerManager.handleMessage: Received ${data.type} broadcast for ${data.targetUsername} by ${data.byUsername}`
        );
        this.playerModeManager.handleFriendshipBroadcast(data);

        // Show UI notification if this player is the target
        if (data.targetUsername === this.username) {
          console.log(
            `[DEBUG] MultiplayerManager: Target matches current user (${this.username}), calling showFriendshipNotification`
          );
          this.showFriendshipNotification(
            data.byUsername,
            data.type === "friendship-added" ? "added" : "removed"
          );
        }
        break;
      case "player-count-update":
        console.log(
          `MultiplayerManager: Player count updated to ${data.count} for level ${data.level}`
        );
        this.playerCount = data.count;
        this.triggerUIUpdate();
        break;
      default:
        return;
    }
  }

  private loadChunkState(chunkData: ChunkStateData): void {
    const blocks: Block[] = [];
    for (const blockData of chunkData.blocks) {
      const block = new Block(
        blockData.x,
        blockData.y,
        blockData.z,
        blockData.type || 0,
        blockData.placed,
        blockData.username,
        blockData.timestamp
      );
      blocks.push(block);
      this.terrain.customBlocks.push(block);

      if (!blockData.placed) {
        this.terrain.generateAdjacentBlocks(
          new THREE.Vector3(blockData.x, blockData.y, blockData.z)
        );
      }
    }
    this.chunkStateManager.storeChunk(
      chunkData.chunkX,
      chunkData.chunkZ,
      blocks
    );

    // Update builders list when chunks are loaded
    this.builderRecognitionManager.updateBuilders();
    this.triggerUIUpdate();
  }

  private handleBlockModification(data: BlockModificationMessage): void {
    if (data.username === this.username) {
      return;
    }

    const position = new THREE.Vector3(
      data.position.x,
      data.position.y,
      data.position.z
    );

    const conflict = this.detectConflict(position);
    if (conflict) {
      console.warn(
        `MultiplayerManager: Conflict detected at position (${position.x}, ${position.y}, ${position.z})`
      );
      if (this.shouldOverrideLocal(conflict, data)) {
        this.applyBlockModification(position, data);
      }
    } else {
      this.applyBlockModification(position, data);
    }
  }

  private detectConflict(
    position: THREE.Vector3
  ): { localTimestamp: number; localUsername: string } | null {
    for (const customBlock of this.terrain.customBlocks) {
      if (
        customBlock.x === position.x &&
        customBlock.y === position.y &&
        customBlock.z === position.z &&
        customBlock.username === this.username
      ) {
        return {
          localTimestamp: customBlock.timestamp,
          localUsername: customBlock.username,
        };
      }
    }
    return null;
  }

  private shouldOverrideLocal(
    conflict: { localTimestamp: number; localUsername: string },
    data: BlockModificationMessage
  ): boolean {
    const serverTimestamp = data.serverTimestamp || data.clientTimestamp;
    return serverTimestamp >= conflict.localTimestamp;
  }

  private applyBlockModification(
    position: THREE.Vector3,
    data: BlockModificationMessage
  ): void {
    const matrix = new THREE.Matrix4();
    if (data.action === "remove") {
      const blockType = this.findAndRemoveBlock(position);
      if (blockType !== null) {
        let existed = false;
        for (const customBlock of this.terrain.customBlocks) {
          if (
            customBlock.x === position.x &&
            customBlock.y === position.y &&
            customBlock.z === position.z
          ) {
            existed = true;
            customBlock.placed = false;
            customBlock.username = data.username;
            customBlock.timestamp =
              data.serverTimestamp || data.clientTimestamp;
          }
        }
        if (!existed) {
          this.terrain.customBlocks.push(
            new Block(
              position.x,
              position.y,
              position.z,
              blockType,
              false,
              data.username,
              data.serverTimestamp || data.clientTimestamp
            )
          );
        }
        this.terrain.generateAdjacentBlocks(position);
      }
    } else if (data.action === "place" && data.blockType !== null) {
      matrix.setPosition(position.x, position.y, position.z);
      this.terrain.blocks[data.blockType]!.setMatrixAt(
        this.terrain.getCount(data.blockType)!,
        matrix
      );
      this.terrain.setCount(data.blockType);
      this.terrain.blocks[data.blockType]!.instanceMatrix.needsUpdate = true;
      this.terrain.customBlocks.push(
        new Block(
          position.x,
          position.y,
          position.z,
          data.blockType,
          true,
          data.username,
          data.serverTimestamp || data.clientTimestamp
        )
      );
    }

    // Update builders list when blocks are modified
    this.builderRecognitionManager.updateBuilders();
    this.triggerUIUpdate();

    // Refresh highlights if a builder is currently highlighted
    this.builderRecognitionManager.refreshHighlightsIfActive();
  }

  private findAndRemoveBlock(position: THREE.Vector3): BlockType | null {
    for (
      let blockType = 0;
      blockType < this.terrain.blocks.length;
      blockType++
    ) {
      const blockMesh = this.terrain.blocks[blockType];
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < blockMesh!.count; i++) {
        blockMesh!.getMatrixAt(i, matrix);
        const blockPosition = new THREE.Vector3().setFromMatrixPosition(matrix);
        if (
          Math.round(blockPosition.x) === position.x &&
          Math.round(blockPosition.y) === position.y &&
          Math.round(blockPosition.z) === position.z
        ) {
          blockMesh!.setMatrixAt(i, new THREE.Matrix4().identity());
          blockMesh!.instanceMatrix.needsUpdate = true;
          return blockType as BlockType;
        }
      }
    }
    return null;
  }

  private handlePositionUpdates(data: PositionUpdatesBroadcast): void {
    const now = Date.now();
    for (const playerData of data.players) {
      const { username, position, rotation } = playerData;
      if (username === this.username) {
        continue;
      }
      this.playerLastSeen.set(username, now);
      let player = this.players.get(username);
      if (!player) {
        const playerPosition = new THREE.Vector3(
          position.x,
          position.y,
          position.z
        );
        this.createPlayerEntity(username, playerPosition);
        player = this.players.get(username);
        if (!player) continue;
      }
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

  private cleanupStalePlayers(): void {
    const now = Date.now();
    const STALE_TIMEOUT = 10000;
    for (const [username, lastSeen] of this.playerLastSeen.entries()) {
      if (now - lastSeen > STALE_TIMEOUT) {
        const player = this.players.get(username);
        if (player) {
          this.disposePlayerEntity(player);
          this.removePlayerEntity(username);
        }
        this.playerLastSeen.delete(username);
      }
    }
  }

  sendBlockModification(
    position: THREE.Vector3,
    blockType: BlockType | null,
    action: "place" | "remove"
  ): void {
    if (!this.username) {
      return;
    }

    // Check if modifications are allowed
    if (!this.playerModeManager.canModifyBlocks()) {
      console.warn("Block modifications not allowed in current mode");
      return;
    }

    // For removal, check ownership permissions
    if (action === "remove") {
      const block = this.findBlockAt(position);
      if (block) {
        const check = this.playerModeManager.canRemoveBlock(block);
        if (!check.allowed) {
          console.warn(`Block removal prevented: ${check.reason}`);
          this.showBlockRemovalFeedback(
            check.reason || "Cannot remove this block"
          );
          return;
        }
      }
    }

    this.chunkStateManager.addModification(
      { x: position.x, y: position.y, z: position.z },
      blockType,
      action
    );

    // Refresh highlights if a builder is currently highlighted
    this.builderRecognitionManager.refreshHighlightsIfActive();
  }

  private findBlockAt(position: THREE.Vector3): Block | null {
    for (const block of this.terrain.customBlocks) {
      if (
        block.x === position.x &&
        block.y === position.y &&
        block.z === position.z &&
        block.placed
      ) {
        return block;
      }
    }
    return null;
  }

  async sendPositionUpdate(
    position: THREE.Vector3,
    rotation: Rotation
  ): Promise<void> {
    // Check mode before sending position updates
    if (!this.playerModeManager.shouldSendPositionUpdates()) {
      return;
    }

    if (!this.username) {
      return;
    }

    // Check if player moved to a new chunk and update subscriptions
    const playerChunkX = Math.floor(position.x / this.terrain.chunkSize);
    const playerChunkZ = Math.floor(position.z / this.terrain.chunkSize);

    if (
      playerChunkX !== this.currentPlayerChunk.x ||
      playerChunkZ !== this.currentPlayerChunk.z
    ) {
      this.currentPlayerChunk = { x: playerChunkX, z: playerChunkZ };

      // Update subscriptions and builders list
      await this.chunkStateManager.updateSubscriptions(
        playerChunkX,
        playerChunkZ,
        (broadcastData) => this.handleMessage(broadcastData)
      );

      // Update builders list after subscription changes
      this.builderRecognitionManager.updateBuilders();
      this.triggerUIUpdate();
    }

    const body = {
      username: this.username,
      position: {
        x: Math.round(position.x * 100) / 100,
        y: Math.round(position.y * 100) / 100,
        z: Math.round(position.z * 100) / 100,
      },
      rotation: { x: rotation.x, y: rotation.y },
    };
    try {
      await fetch(window.ENDPOINTS.POSITION_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.error("Failed to send position update", error);
    }
  }

  private createPlayerEntity(
    username: string,
    position: THREE.Vector3
  ): PlayerEntity | undefined {
    if (username === this.username) return;
    const renderer = new PlayerEntityRenderer(username, position);
    this.scene.add(renderer.group);
    const playerEntity: PlayerEntity = { username, renderer };
    this.players.set(username, playerEntity);
    return playerEntity;
  }

  private disposePlayerEntity(player: PlayerEntity): void {
    const renderer = player.renderer;
    const disposeRecursive = (object: THREE.Object3D) => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      }
      object.children.forEach(disposeRecursive);
    };
    disposeRecursive(renderer.group);
    if (
      renderer.label &&
      renderer.label.material &&
      renderer.label.material.map
    ) {
      renderer.label.material.map.dispose();
    }
  }

  private removePlayerEntity(username: string): void {
    const player = this.players.get(username);
    if (player) {
      this.scene.remove(player.renderer.group);
      this.players.delete(username);
    }
  }

  /**
   * Update loop - called every frame for interpolation and visual effects.
   */
  update(delta: number): void {
    const setOpacityRecursive = (object: THREE.Object3D, opacity: number) => {
      if (object instanceof THREE.Mesh) {
        const material = object.material as THREE.MeshStandardMaterial;
        if (material && typeof material.opacity !== "undefined") {
          material.transparent = opacity < 1.0;
          material.opacity = opacity;
        }
      }
      for (const child of object.children) {
        setOpacityRecursive(child, opacity);
      }
    };

    for (const player of this.players.values()) {
      // The renderer now handles its own positioning logic entirely.
      player.renderer.update(delta);

      // Calculate distance from camera (eye level) to other player's eye level for proper effects
      const playerEyePosition = player.renderer.targetPosition.clone();
      const distanceToCamera =
        this.camera.position.distanceTo(playerEyePosition);

      // Reset scale each frame to ensure it doesn't get stuck from previous logic
      player.renderer.group.scale.setScalar(1.0);

      // Reduce opacity when player is very close to the camera.
      // This is a better effect than scaling, which caused the player to shrink.
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
      setOpacityRecursive(player.renderer.group, opacity);
      if (player.renderer.label.material) {
        player.renderer.label.material.opacity = opacity;
      }
      player.renderer.label.lookAt(this.camera.position);
    }
  }

  /**
   * Get player mode manager for UI access
   */
  getPlayerModeManager(): PlayerModeManager {
    return this.playerModeManager;
  }

  /**
   * Get builder recognition manager for UI access
   */
  getBuilderRecognitionManager(): BuilderRecognitionManager {
    return this.builderRecognitionManager;
  }

  /**
   * Get upvote manager for UI access
   */
  getUpvoteManager(): UpvoteManager {
    return this.upvoteManager;
  }

  /**
   * Get current player count for the level
   */
  getPlayerCount(): number {
    return this.playerCount;
  }

  /**
   * Set UI update callback to refresh UI when data changes
   */
  setUIUpdateCallback(callback: () => void): void {
    this.uiUpdateCallback = callback;
  }

  /**
   * Set block removal feedback callback
   */
  setBlockRemovalFeedbackCallback(callback: (message: string) => void): void {
    this.blockRemovalFeedbackCallback = callback;
  }

  /**
   * Set friendship notification callback
   */
  setFriendshipNotificationCallback(
    callback: (username: string, action: "added" | "removed") => void
  ): void {
    this.friendshipNotificationCallback = callback;
  }

  /**
   * Optimistically update builders list (called when player places/removes block)
   */
  updateBuildersListOptimistically(): void {
    this.builderRecognitionManager.updateBuilders();
    this.triggerUIUpdate();
  }

  /**
   * Trigger UI update
   */
  private triggerUIUpdate(): void {
    if (this.uiUpdateCallback) {
      this.uiUpdateCallback();
    }
  }

  /**
   * Show block removal feedback
   */
  private showBlockRemovalFeedback(message: string): void {
    if (this.blockRemovalFeedbackCallback) {
      this.blockRemovalFeedbackCallback(message);
    }
  }

  /**
   * Show friendship notification
   */
  private showFriendshipNotification(
    username: string,
    action: "added" | "removed"
  ): void {
    console.log(
      `[DEBUG] MultiplayerManager.showFriendshipNotification: ${username} ${action}, callback exists: ${!!this
        .friendshipNotificationCallback}`
    );
    if (this.friendshipNotificationCallback) {
      this.friendshipNotificationCallback(username, action);
    }
  }

  /**
   * Show block removal error (public method for control.ts)
   */
  showBlockRemovalError(message: string): void {
    this.showBlockRemovalFeedback(message);
  }
}
