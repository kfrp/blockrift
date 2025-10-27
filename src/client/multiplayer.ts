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

  async connect(level: string = "default"): Promise<void> {
    try {
      const response = await fetch("http://localhost:3000/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });

      const data = await response.json();
      this.setUsername(data.username);

      if (data.terrainSeeds && data.terrainSeeds.seed !== undefined) {
        this.terrain.setSeeds(data.terrainSeeds.seed);
      } else throw new Error("No seed from server");

      if (data.initialChunks && data.initialChunks.length > 0) {
        for (const chunkData of data.initialChunks) {
          this.loadChunkState(chunkData);
        }
        this.terrain.generate();
      }

      if (data.players && Array.isArray(data.players)) {
        for (const playerData of data.players) {
          if (playerData.username !== this.username) {
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

      this.chunkStateManager.syncOfflineModifications();

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
      this.terrain.blocks[data.blockType].setMatrixAt(
        this.terrain.getCount(data.blockType),
        matrix
      );
      this.terrain.setCount(data.blockType);
      this.terrain.blocks[data.blockType].instanceMatrix.needsUpdate = true;
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
  }

  private findAndRemoveBlock(position: THREE.Vector3): BlockType | null {
    for (
      let blockType = 0;
      blockType < this.terrain.blocks.length;
      blockType++
    ) {
      const blockMesh = this.terrain.blocks[blockType];
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < blockMesh.count; i++) {
        blockMesh.getMatrixAt(i, matrix);
        const blockPosition = new THREE.Vector3().setFromMatrixPosition(matrix);
        if (
          Math.round(blockPosition.x) === position.x &&
          Math.round(blockPosition.y) === position.y &&
          Math.round(blockPosition.z) === position.z
        ) {
          blockMesh.setMatrixAt(i, new THREE.Matrix4().identity());
          blockMesh.instanceMatrix.needsUpdate = true;
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
    this.chunkStateManager.addModification(
      { x: position.x, y: position.y, z: position.z },
      blockType,
      action
    );
  }

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
        x: Math.round(position.x * 100) / 100,
        y: Math.round(position.y * 100) / 100,
        z: Math.round(position.z * 100) / 100,
      },
      rotation: { x: rotation.x, y: rotation.y },
    };
    try {
      await fetch("http://localhost:3000/api/position", {
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
}
