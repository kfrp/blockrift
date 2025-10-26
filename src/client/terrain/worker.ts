import * as THREE from "three";
import Block from "../mesh/block";
import Noise from "./noise";

/**
 * This file runs in a Web Worker (separate thread from main game)
 * It handles CPU-intensive terrain generation without blocking rendering
 *
 * The worker receives generation parameters, produces block instances,
 * and sends the results back to the main thread
 */

// BlockType enum must be duplicated here since workers don't share scope
enum BlockType {
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

// ===== WORKER-SCOPED VARIABLES =====
// These persist between worker calls for efficiency
const matrix = new THREE.Matrix4(); // Reusable matrix for positioning blocks
let noise: Noise | null = null; // Noise generator - initialized on first message with seeds
const blocks: THREE.InstancedMesh[] = []; // Array of meshes, one per block type

const geometry = new THREE.BoxGeometry(); // Shared geometry

let isFirstRun = true; // Flag to initialize blocks array on first call

/**
 * Main worker message handler
 * Receives terrain generation parameters and produces block instances
 */
onmessage = (
  msg: MessageEvent<{
    distance: number; // How many chunks away from player to generate
    chunk: THREE.Vector2; // Current chunk coordinates
    noiseSeed: number; // Seed for terrain height
    treeSeed: number; // Seed for tree placement
    stoneSeed: number; // Seed for stone regions
    coalSeed: number; // Seed for coal ore
    idMap: Map<string, number>; // Map of block positions to instance IDs
    blocksFactor: number[]; // Size multipliers for each block type
    blocksCount: number[]; // Current instance count for each block type
    customBlocks: Block[]; // Player-placed/removed blocks
    chunkSize: number; // Size of each chunk (e.g., 24 blocks)
  }>
) => {
  // Destructure all parameters from message
  const {
    distance,
    chunk,
    noiseSeed,
    idMap,
    blocksFactor,
    treeSeed,
    stoneSeed,
    coalSeed,
    customBlocks,
    blocksCount,
    chunkSize,
  } = msg.data;

  // Calculate maximum number of blocks we might need
  // (area of generation region + buffer)
  const maxCount = (distance * chunkSize * 2 + chunkSize) ** 2 + 500;

  // Initialize block meshes on first run
  if (isFirstRun) {
    for (let i = 0; i < blocksCount.length; i++) {
      let block = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshBasicMaterial(),
        maxCount * blocksFactor[i] // Allocate based on expected frequency
      );
      blocks.push(block);
    }
    isFirstRun = false;
  }

  // Initialize or update noise with seeds from terrain
  if (noise === null) {
    // First time - create Noise with server seed
    noise = new Noise(noiseSeed);
    console.log(`Worker: Initialized Noise with seed ${noiseSeed}`);
  } else {
    // Update existing noise seeds
    noise.seed = noiseSeed;
    noise.treeSeed = treeSeed;
    noise.stoneSeed = stoneSeed;
    noise.coalSeed = coalSeed;
  }

  // Safety check - noise must be initialized
  if (noise === null) {
    console.error("Worker: Noise not initialized, cannot generate terrain");
    return;
  }

  // Reset instance matrices for all block types
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].instanceMatrix = new THREE.InstancedBufferAttribute(
      new Float32Array(maxCount * blocksFactor[i] * 16),
      16
    );
  }

  // ===== MAIN GENERATION LOOP =====
  // Iterate over all X,Z positions in the generation area
  for (
    let x = -chunkSize * distance + chunkSize * chunk.x;
    x < chunkSize * distance + chunkSize + chunkSize * chunk.x;
    x++
  ) {
    for (
      let z = -chunkSize * distance + chunkSize * chunk.y;
      z < chunkSize * distance + chunkSize + chunkSize * chunk.y;
      z++
    ) {
      // Base Y level (sea level)
      const y = 30;

      // Calculate terrain height variation using Perlin noise
      // noise.get() returns a value roughly between -1 and 1
      // We divide by gap to control frequency, multiply by amp to control height
      const yOffset = Math.floor(
        noise.get(x / noise.gap, z / noise.gap, noise.seed) * noise.amp
      );

      // Position the ground block at calculated height
      matrix.setPosition(x, y + yOffset, z);

      // ===== BLOCK TYPE DETERMINATION =====

      // Check if this location should be stone
      const stoneOffset =
        noise.get(x / noise.stoneGap, z / noise.stoneGap, noise.stoneSeed) *
        noise.stoneAmp;

      // Check if this location should have coal (only in stone regions)
      const coalOffset =
        noise.get(x / noise.coalGap, z / noise.coalGap, noise.coalSeed) *
        noise.coalAmp;

      // Determine block type based on noise values
      if (stoneOffset > noise.stoneThreshold) {
        // Stone region
        if (coalOffset > noise.coalThreshold) {
          // Coal ore within stone
          idMap.set(`${x}_${y + yOffset}_${z}`, blocksCount[BlockType.coal]);
          blocks[BlockType.coal].setMatrixAt(
            blocksCount[BlockType.coal]++,
            matrix
          );
        } else {
          // Regular stone
          idMap.set(`${x}_${y + yOffset}_${z}`, blocksCount[BlockType.stone]);
          blocks[BlockType.stone].setMatrixAt(
            blocksCount[BlockType.stone]++,
            matrix
          );
        }
      } else {
        // Non-stone region
        if (yOffset < -3) {
          // Below sea level: sand (beach/underwater)
          idMap.set(`${x}_${y + yOffset}_${z}`, blocksCount[BlockType.sand]);
          blocks[BlockType.sand].setMatrixAt(
            blocksCount[BlockType.sand]++,
            matrix
          );
        } else {
          // Above sea level: grass
          idMap.set(`${x}_${y + yOffset}_${z}`, blocksCount[BlockType.grass]);
          blocks[BlockType.grass].setMatrixAt(
            blocksCount[BlockType.grass]++,
            matrix
          );
        }
      }

      // ===== TREE GENERATION =====

      // Check if a tree should grow at this location
      const treeOffset =
        noise.get(x / noise.treeGap, z / noise.treeGap, noise.treeSeed) *
        noise.treeAmp;

      // Tree placement rules:
      // 1. Tree noise above threshold (sparse distribution)
      // 2. Not underwater (yOffset >= -3)
      // 3. Not in stone regions
      if (
        treeOffset > noise.treeThreshold &&
        yOffset >= -3 &&
        stoneOffset < noise.stoneThreshold
      ) {
        // Generate tree trunk (vertical log blocks)
        for (let i = 1; i <= noise.treeHeight; i++) {
          idMap.set(
            `${x}_${y + yOffset + i}_${z}`,
            blocksCount[BlockType.tree]
          );

          matrix.setPosition(x, y + yOffset + i, z);

          blocks[BlockType.tree].setMatrixAt(
            blocksCount[BlockType.tree]++,
            matrix
          );
        }

        // Generate leaf canopy (cube of potential leaf blocks around tree top)
        for (let i = -3; i < 3; i++) {
          for (let j = -3; j < 3; j++) {
            for (let k = -3; k < 3; k++) {
              // Skip center column (where trunk is)
              if (i === 0 && k === 0) {
                continue;
              }

              // Use noise to create irregular leaf distribution
              const leafOffset =
                noise.get(
                  (x + i + j) / noise.leafGap,
                  (z + k) / noise.leafGap,
                  noise.leafSeed
                ) * noise.leafAmp;

              // Only place leaf if above threshold (creates gaps in foliage)
              if (leafOffset > noise.leafThreshold) {
                idMap.set(
                  `${x + i}_${y + yOffset + noise.treeHeight + j}_${z + k}`,
                  blocksCount[BlockType.leaf]
                );
                matrix.setPosition(
                  x + i,
                  y + yOffset + noise.treeHeight + j,
                  z + k
                );
                blocks[BlockType.leaf].setMatrixAt(
                  blocksCount[BlockType.leaf]++,
                  matrix
                );
              }
            }
          }
        }
      }
    }
  }

  // ===== APPLY CUSTOM BLOCKS =====
  // These are blocks placed or removed by the player
  for (const block of customBlocks) {
    // Only process blocks within current generation area
    if (
      block.x > -chunkSize * distance + chunkSize * chunk.x &&
      block.x < chunkSize * distance + chunkSize + chunkSize * chunk.x &&
      block.z > -chunkSize * distance + chunkSize * chunk.y &&
      block.z < chunkSize * distance + chunkSize + chunkSize * chunk.y
    ) {
      if (block.placed) {
        // Player placed this block - add instance
        matrix.setPosition(block.x, block.y, block.z);
        blocks[block.type].setMatrixAt(blocksCount[block.type]++, matrix);
      } else {
        // Player removed this block - zero out its matrix
        const id = idMap.get(`${block.x}_${block.y}_${block.z}`);

        blocks[block.type].setMatrixAt(
          id!,
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
      }
    }
  }

  // ===== SEND RESULTS BACK TO MAIN THREAD =====
  // Extract the raw array data from each block's instance matrix
  const arrays = blocks.map((block) => block.instanceMatrix.array);

  // Post message with all generated data
  postMessage({ idMap, arrays, blocksCount });
};
