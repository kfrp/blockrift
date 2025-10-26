import * as THREE from "three";
import Materials, { MaterialType } from "../mesh/materials";
import Block from "../mesh/block";
import Highlight from "../highlight";
import Noise from "./noise";

import Generator from "./worker?worker"; // Web Worker import

/**
 * BlockType enum defines all available block types
 * Each type has a corresponding material and mesh
 */
export enum BlockType {
  grass = 0,
  sand = 1,
  tree = 2,
  leaf = 3,
  dirt = 4,
  stone = 5,
  coal = 6,
  wood = 7,
  diamond = 8,
  quartz = 9,
  glass = 10,
  bedrock = 11,
}

/**
 * Terrain - Manages all terrain generation, rendering, and state
 *
 * Key responsibilities:
 * 1. Chunk-based infinite world generation
 * 2. Managing all block meshes (one InstancedMesh per block type)
 * 3. Coordinating with worker thread for generation
 * 4. Tracking custom blocks (player modifications)
 * 5. Highlighting system
 * 6. Cloud generation
 */
export default class Terrain {
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;

    // Calculate max blocks based on render distance
    this.maxCount =
      (this.distance * this.chunkSize * 2 + this.chunkSize) ** 2 + 500;

    this.initBlocks();
    // Initialize block highlighting
    this.highlight = new Highlight(scene, camera, this);

    // Add clouds to scene
    this.scene.add(this.cloud);

    // ===== WEB WORKER SETUP =====
    // The worker handles CPU-intensive terrain generation in a separate thread
    this.generatorWorker.onmessage = (
      msg: MessageEvent<{
        idMap: Map<string, number>; // Block position to instance ID map
        arrays: ArrayLike<number>[]; // Instance matrix arrays for each block type
        blocksCount: number[]; // Instance counts for each block type
      }>
    ) => {
      // Reset all block meshes
      this.resetBlocks();

      // Update terrain state with worker results
      this.idMap = msg.data.idMap;
      this.blocksCount = msg.data.blocksCount;

      // Apply the generated instance matrices to each block mesh
      for (let i = 0; i < msg.data.arrays.length; i++) {
        this.blocks[i].instanceMatrix = new THREE.InstancedBufferAttribute(
          (this.blocks[i].instanceMatrix.array = msg.data.arrays[
            i
          ] as THREE.TypedArray),
          16 // 16 floats per 4x4 matrix
        );
        // Set instance count for proper rendering and raycasting
        this.blocks[i].count = this.blocksCount[i];
      }

      // Mark all block meshes as needing updates
      for (const block of this.blocks) {
        block.instanceMatrix.needsUpdate = true;
        // Compute bounding sphere is REQUIRED for raycasting to work
        block.computeBoundingSphere();
      }
    };
    // Don't generate terrain yet - wait for server to send seeds
    // this.generate() will be called by setSeeds() when server responds
  }

  // ===== CORE PROPERTIES =====
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  distance = 3; // Render distance in chunks (3 = 3 chunks in each direction)
  chunkSize = 24; // Size of each chunk in blocks

  // ===== TERRAIN PROPERTIES =====
  maxCount: number; // Maximum number of blocks to allocate
  chunk = new THREE.Vector2(0, 0); // Current chunk player is in
  previousChunk = new THREE.Vector2(0, 0); // Previous chunk (for change detection)
  noise!: Noise; // Noise generator - will be initialized when server sends seeds

  // ===== MATERIALS =====
  materials = new Materials(); // Manages textures and materials
  // Map each BlockType to its MaterialType
  materialType = [
    MaterialType.grass,
    MaterialType.sand,
    MaterialType.tree,
    MaterialType.leaf,
    MaterialType.dirt,
    MaterialType.stone,
    MaterialType.coal,
    MaterialType.wood,
    MaterialType.diamond,
    MaterialType.quartz,
    MaterialType.glass,
    MaterialType.bedrock,
  ];

  // ===== BLOCK MANAGEMENT =====
  blocks: THREE.InstancedMesh[] = []; // One InstancedMesh per block type
  blocksCount: number[] = []; // Current instance count for each type
  // Allocation factors: controls how much memory to reserve for each type
  // Based on expected frequency (grass is common, diamonds are rare)
  blocksFactor = [1, 0.2, 0.1, 0.7, 0.1, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];

  // ===== CUSTOM BLOCKS =====
  // This array is THE SOURCE OF TRUTH for player modifications
  // It persists across chunk regenerations and is used for save/load
  customBlocks: Block[] = [];

  highlight: Highlight; // Block highlighting system

  // ===== WORKER COMMUNICATION =====
  idMap = new Map<string, number>(); // Maps "x_y_z" to instance ID
  generatorWorker = new Generator(); // Web Worker instance

  // ===== CLOUD SYSTEM =====
  // Clouds are rendered as large flat boxes with transparency
  cloud = (() => {
    const cloudMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1), // Wide, flat boxes
      new THREE.MeshBasicMaterial({
        transparent: true,
        color: 0xffffff, // Pure white
        opacity: 0.9, // A slightly higher opacity often looks better
      }),
      10000 // Max 1000 cloud instances
    );
    cloudMesh.frustumCulled = false;
    return cloudMesh;
  })();
  cloudCount = 0; // Current number of clouds
  cloudGap = 5; // Counter for cloud regeneration throttling

  /**
   * Update terrain seeds from server
   * This ensures all players see the same world
   */
  setSeeds(seed: number): void {
    this.noise = new Noise(seed);
    // Regenerate terrain with new seeds
    this.generate();
  }

  /**
   * Get current instance count for a block type
   */
  getCount = (type: BlockType) => {
    return this.blocksCount[type];
  };

  /**
   * Increment instance count for a block type
   * Also updates the mesh's count property for rendering/raycasting
   */
  setCount = (type: BlockType) => {
    this.blocksCount[type] = this.blocksCount[type] + 1;
    // Update instance count for raycasting to work properly
    this.blocks[type].count = this.blocksCount[type];
    // Recompute bounding sphere for frustum culling and raycasting
    this.blocks[type].computeBoundingSphere();
  };

  /**
   * Initialize or reset all block meshes
   * Creates one InstancedMesh per block type
   */
  initBlocks = () => {
    // Remove old meshes from scene
    for (const block of this.blocks) {
      this.scene.remove(block);
    }
    this.blocks = [];

    // Create new meshes
    const geometry = new THREE.BoxGeometry();

    for (let i = 0; i < this.materialType.length; i++) {
      let block = new THREE.InstancedMesh(
        geometry,
        this.materials.get(this.materialType[i]),
        this.maxCount * this.blocksFactor[i] // Allocate based on expected frequency
      );
      // Name used for identifying block type during raycasting
      block.name = BlockType[i];
      // Disable frustum culling for instanced meshes with dynamic instances
      block.frustumCulled = false;
      this.blocks.push(block);
      this.scene.add(block);
    }

    // Initialize instance counters to zero
    this.blocksCount = new Array(this.materialType.length).fill(0);
  };

  /**
   * Reset instance matrices without recreating meshes
   * Called before each generation cycle
   */
  resetBlocks = () => {
    for (let i = 0; i < this.blocks.length; i++) {
      this.blocks[i].instanceMatrix = new THREE.InstancedBufferAttribute(
        new Float32Array(this.maxCount * this.blocksFactor[i] * 16),
        16
      );
    }
  };

  /**
   * Trigger terrain generation for current chunk
   * Sends work to the web worker thread
   */
  generate = () => {
    // Reset instance counters
    this.blocksCount = new Array(this.blocks.length).fill(0);

    // Send generation job to worker
    this.generatorWorker.postMessage({
      distance: this.distance,
      chunk: this.chunk,
      noiseSeed: this.noise.seed, // For terrain height
      treeSeed: this.noise.treeSeed, // For tree placement
      stoneSeed: this.noise.stoneSeed, // For stone regions
      coalSeed: this.noise.coalSeed, // For coal ore
      idMap: new Map<string, number>(), // Fresh ID map
      blocksFactor: this.blocksFactor,
      blocksCount: this.blocksCount,
      customBlocks: this.customBlocks, // Player modifications
      chunkSize: this.chunkSize,
    });

    // ===== CLOUD GENERATION =====
    // Regenerate clouds every few terrain generations to reduce overhead
    if (this.cloudGap++ > 5) {
      this.cloudGap = 0;
      this.cloud.instanceMatrix = new THREE.InstancedBufferAttribute(
        new Float32Array(10000 * 16),
        16
      );
      this.cloudCount = 0;

      // This outer loop now determines the CENTER of a cloud CLUSTER
      for (
        let x =
          -this.chunkSize * this.distance * 3 + this.chunkSize * this.chunk.x;
        x <
        this.chunkSize * this.distance * 3 +
          this.chunkSize +
          this.chunkSize * this.chunk.x;
        x += 50
      ) {
        for (
          let z =
            -this.chunkSize * this.distance * 3 + this.chunkSize * this.chunk.y;
          z <
          this.chunkSize * this.distance * 3 +
            this.chunkSize +
            this.chunkSize * this.chunk.y;
          z += 50
        ) {
          if (Math.random() > 0.5) {
            const cloudCenterX = x + (Math.random() - 0.5) * 25;
            const cloudCenterY = 80 + (Math.random() - 0.5) * 15;
            const cloudCenterZ = z + (Math.random() - 0.5) * 25;

            // 3. Drastically increase the number of pieces that form one cloud
            const piecesPerCloud = 50 + Math.random() * 25; // 50 to 75 pieces!

            for (let i = 0; i < piecesPerCloud; i++) {
              if (this.cloudCount >= 10000) break; // Safety break

              const matrix = new THREE.Matrix4();
              const scale = new THREE.Vector3();

              // 4. Make each piece much smaller for a finer, more detailed look
              const sx = 2 + Math.random() * 2.5; // Scale between 2.0 and 4.5
              const sy = 1 + Math.random() * 2;
              const sz = 2 + Math.random() * 2.5;
              scale.set(sx, sy, sz);

              // 5. Pack the pieces into a denser, smaller area
              const px = cloudCenterX + (Math.random() - 0.5) * 12; // Tighter radius
              const py = cloudCenterY + (Math.random() - 0.5) * 6;
              const pz = cloudCenterZ + (Math.random() - 0.5) * 12;

              matrix.compose(
                new THREE.Vector3(px, py, pz),
                new THREE.Quaternion(),
                scale
              );
              this.cloud.setMatrixAt(this.cloudCount++, matrix);
            }
          }
        }
      }

      this.cloud.count = this.cloudCount;
      this.cloud.instanceMatrix.needsUpdate = true;
    }
  };

  /**
   * Generate adjacent blocks after removing a block
   * This creates "infinite depth" - new blocks appear below removed ones
   *
   * This is called when a block is removed to fill in the space beneath it
   */
  generateAdjacentBlocks = (position: THREE.Vector3) => {
    const { x, y, z } = position;
    const noise = this.noise;

    // Calculate natural terrain height at this position
    const yOffset = Math.floor(
      noise.get(x / noise.gap, z / noise.gap, noise.seed) * noise.amp
    );

    // Don't generate above natural terrain height
    if (y > 30 + yOffset) {
      return;
    }

    // Determine what block type should exist here
    const stoneOffset =
      noise.get(x / noise.stoneGap, z / noise.stoneGap, noise.stoneSeed) *
      noise.stoneAmp;

    let type: BlockType;

    if (stoneOffset > noise.stoneThreshold || y < 23) {
      type = BlockType.stone; // Stone region or deep underground
    } else {
      if (yOffset < -3) {
        type = BlockType.sand; // Underwater
      } else {
        type = BlockType.dirt; // Normal underground
      }
    }

    // Place blocks in all 6 adjacent positions
    this.buildBlock(new THREE.Vector3(x, y - 1, z), type); // Below
    this.buildBlock(new THREE.Vector3(x, y + 1, z), type); // Above
    this.buildBlock(new THREE.Vector3(x - 1, y, z), type); // Front
    this.buildBlock(new THREE.Vector3(x + 1, y, z), type); // Back
    this.buildBlock(new THREE.Vector3(x, y, z - 1), type); // Left
    this.buildBlock(new THREE.Vector3(x, y, z + 1), type); // Right

    // Update the mesh
    this.blocks[type].instanceMatrix.needsUpdate = true;
  };

  /**
   * Build a single block at a position
   * Used for generating adjacent blocks and manual placement
   */
  buildBlock = (position: THREE.Vector3, type: BlockType) => {
    const noise = this.noise;

    // Check if this would be above natural terrain
    const yOffset = Math.floor(
      noise.get(position.x / noise.gap, position.z / noise.gap, noise.seed) *
        noise.amp
    );
    if (position.y >= 30 + yOffset || position.y < 0) {
      return; // Don't build above ground or below void
    }

    // Bedrock at y=0 (unbreakable bottom layer)
    position.y === 0 && (type = BlockType.bedrock);

    // Check if a custom block already exists here
    for (const block of this.customBlocks) {
      if (
        block.x === position.x &&
        block.y === position.y &&
        block.z === position.z
      ) {
        return; // Don't overwrite existing custom blocks
      }
    }

    // Add to custom blocks list (this is the state that persists)
    this.customBlocks.push(
      new Block(position.x, position.y, position.z, type, true)
    );

    // Add instance to appropriate mesh
    const matrix = new THREE.Matrix4();
    matrix.setPosition(position);
    this.blocks[type].setMatrixAt(this.getCount(type), matrix);
    this.blocks[type].instanceMatrix.needsUpdate = true;
    this.setCount(type);
  };

  /**
   * Main update loop called every frame
   * Handles chunk changes and highlighting
   */
  update = () => {
    // Calculate which chunk the player is currently in
    this.chunk.set(
      Math.floor(this.camera.position.x / this.chunkSize),
      Math.floor(this.camera.position.z / this.chunkSize)
    );

    // Regenerate terrain when player moves to a new chunk
    // This is how the infinite world works: regenerate visible area as player moves
    if (
      this.chunk.x !== this.previousChunk.x ||
      this.chunk.y !== this.previousChunk.y
    ) {
      this.generate();
    }

    // Store current chunk for next frame comparison
    this.previousChunk.copy(this.chunk);

    // Update block highlighting
    this.highlight.update();
  };
}
