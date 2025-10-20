# Three.js Voxel Game Tutorial

A comprehensive guide for TypeScript developers new to Three.js who want to understand and modify this Minecraft-inspired voxel game.

## Table of Contents

1. [Core Three.js Concepts](#core-threejs-concepts)
2. [Architecture Overview](#architecture-overview)
3. [The Rendering Pipeline](#the-rendering-pipeline)
4. [Voxel System Deep Dive](#voxel-system-deep-dive)
5. [Changing Block Size](#changing-block-size)
6. [Adding New Block Types](#adding-new-block-types)
7. [World Palettes](#world-palettes)

---

## Core Three.js Concepts

### The Three.js Trinity: Scene, Camera, Renderer

Every Three.js application needs these three components:

```typescript
// src/core/index.ts
this.scene = new THREE.Scene(); // Container for all 3D objects
this.camera = new THREE.PerspectiveCamera(); // Your viewpoint into the scene
this.renderer = new THREE.WebGLRenderer(); // Draws the scene to canvas
```

**Scene**: Think of it as a stage where all your 3D objects live. You add meshes, lights, and other objects to it.

**Camera**: Defines what part of the scene is visible. A `PerspectiveCamera` mimics human vision with depth perception.

**Renderer**: Takes the scene and camera, performs calculations, and draws pixels to the screen.

### Meshes: Geometry + Material

A mesh is a 3D object made of two parts:

```typescript
const mesh = new THREE.Mesh(geometry, material);
```

- **Geometry**: The shape (vertices, faces). A `BoxGeometry` is a cube.
- **Material**: How it looks (color, texture, how it reacts to light).

### InstancedMesh: The Performance Secret

This game uses `InstancedMesh` extensively - it's crucial for performance:

```typescript
const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
```

**Why it matters**: Instead of creating 10,000 separate cube meshes (expensive!), you create ONE `InstancedMesh` that can render 10,000 cubes with different positions/rotations. This is done via GPU instancing.

**How it works**:

```typescript
const matrix = new THREE.Matrix4();
matrix.setPosition(x, y, z);
instancedMesh.setMatrixAt(index, matrix); // Set position of instance #index
instancedMesh.instanceMatrix.needsUpdate = true; // Tell GPU to update
```

Each instance has a transformation matrix (4x4 = 16 floats) that defines its position, rotation, and scale.

### Raycasting: Detecting What You're Looking At

Raycasting shoots an invisible ray and detects what it hits:

```typescript
const raycaster = new THREE.Raycaster();
raycaster.setFromCamera({ x: 0, y: 0 }, camera); // Ray from screen center
const intersections = raycaster.intersectObjects(objects);
```

This is how the game knows which block you're pointing at for placement/removal.

---

## Architecture Overview

### File Structure

```
src/
├── main.ts              # Entry point, animation loop
├── core/                # Scene, camera, renderer, lighting setup
├── player/              # Player state (mode, speed, body dimensions)
├── terrain/             # The voxel world
│   ├── index.ts         # Terrain manager, chunk system
│   ├── mesh/            # Materials and block definitions
│   ├── noise/           # Perlin noise for terrain generation
│   ├── worker/          # Web worker for terrain generation
│   └── highlight/       # Block highlighting system
├── control/             # Input handling, collision detection
├── ui/                  # Menu, HUD, settings
└── audio/               # Sound effects
```

### The Main Loop

```typescript
// src/main.ts
function animate() {
  requestAnimationFrame(animate);

  control.update(); // Handle input, physics, collision
  terrain.update(); // Generate new chunks if needed
  ui.update(); // Update FPS counter

  renderer.render(scene, camera); // Draw everything
}
```

This runs ~60 times per second, creating smooth animation.

---

## The Rendering Pipeline

### 1. Initialization (src/core/index.ts)

```typescript
initScene() {
  // Sky color
  this.scene.background = new THREE.Color(0x87ceeb)
  this.scene.fog = new THREE.Fog(0x87ceeb, 1, 96)  // Distance fog

  // Lighting
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
}
```

**Lighting is critical**: `MeshStandardMaterial` (used for blocks) requires lights to be visible. Without proper lighting, everything appears black.

### 2. Terrain Generation (src/terrain/worker/generate.ts)

The terrain is generated in a **Web Worker** (separate thread) to avoid freezing the UI:

```typescript
// Main thread sends request
generateWorker.postMessage({
  distance, chunk, noiseSeed, customBlocks, ...
})

// Worker generates terrain
onmessage = (msg) => {
  // For each block position in the chunk...
  for (let x = ...; x < ...; x++) {
    for (let z = ...; z < ...; z++) {
      const yOffset = noise.get(x, z)  // Perlin noise for height

      // Decide block type based on height and noise
      if (stoneOffset > threshold) {
        blocks[BlockType.stone].setMatrixAt(index++, matrix)
      } else if (yOffset < -3) {
        blocks[BlockType.sand].setMatrixAt(index++, matrix)
      } else {
        blocks[BlockType.grass].setMatrixAt(index++, matrix)
      }
    }
  }

  // Send back the instance matrices
  postMessage({ arrays, blocksCount })
}
```

### 3. Chunk System (src/terrain/index.ts)

The world is divided into **chunks** (24x24 blocks by default):

```typescript
update() {
  this.chunk.set(
    Math.floor(this.camera.position.x / this.chunkSize),
    Math.floor(this.camera.position.z / this.chunkSize)
  )

  // Generate new terrain when entering a new chunk
  if (this.chunk.x !== this.previousChunk.x ||
      this.chunk.y !== this.previousChunk.y) {
    this.generate()
  }
}
```

Only chunks within `distance` (default 3) of the player are generated, creating an "infinite" world.

### 4. Materials and Textures (src/terrain/mesh/materials.ts)

Each block type has a material with a texture:

```typescript
materials = {
  grass: [
    new THREE.MeshStandardMaterial({ map: grassSide }),
    new THREE.MeshStandardMaterial({ map: grassSide }),
    new THREE.MeshStandardMaterial({ map: grassTop }), // Top face
    new THREE.MeshStandardMaterial({ map: dirt }), // Bottom face
    new THREE.MeshStandardMaterial({ map: grassSide }),
    new THREE.MeshStandardMaterial({ map: grassSide }),
  ],
  stone: new THREE.MeshStandardMaterial({ map: stoneTexture }),
  // ...
};
```

Grass uses an **array of materials** (one per cube face) to have different textures on top/bottom/sides.

---

## Voxel System Deep Dive

### Block Coordinates

Blocks exist on an integer grid:

- Position (5, 10, 3) means x=5, y=10, z=3
- Each block is a 1x1x1 cube (by default)
- Y-axis is vertical (up/down)

### The Instance Matrix System

Each block's position is stored as a 4x4 transformation matrix:

```typescript
const matrix = new THREE.Matrix4();
matrix.setPosition(x, y, z);
instancedMesh.setMatrixAt(blockIndex, matrix);
```

The matrix is stored as 16 floats in a flat array:

```typescript
instanceMatrix = new THREE.InstancedBufferAttribute(
  new Float32Array(maxCount * 16), // 16 floats per instance
  16
);
```

### Block Type Management

Blocks are organized by type into separate `InstancedMesh` objects:

```typescript
// src/terrain/index.ts
blocks: THREE.InstancedMesh[] = []  // One mesh per block type
blocksCount: number[] = []          // How many of each type exist

// BlockType enum maps to array indices
enum BlockType {
  grass = 0,
  sand = 1,
  tree = 2,
  // ...
}
```

**Why separate by type?** Each `InstancedMesh` can only have one material. Different block types need different textures, so they need separate meshes.

### Custom Blocks (Player-Modified Terrain)

```typescript
// src/terrain/mesh/block.ts
class Block {
  x: number;
  y: number;
  z: number;
  type: BlockType;
  placed: boolean; // true = player added, false = player removed
}
```

The `customBlocks` array tracks all player modifications. When regenerating chunks, these override the procedural terrain.

### Collision Detection

Collision uses raycasting in 6 directions (up, down, left, right, forward, back):

```typescript
// src/control/index.ts
collideCheck(side, position, noise, customBlocks) {
  // Create temporary mesh with blocks around player
  const tempMesh = new THREE.InstancedMesh(...)

  // Add nearby blocks to tempMesh
  for (const block of customBlocks) {
    if (block near player) {
      tempMesh.setMatrixAt(index++, matrix)
    }
  }

  // Raycast to detect collision
  const intersections = raycaster.intersectObject(tempMesh)
  this.frontCollide = intersections.length > 0
}
```

This is done every frame to prevent the player from walking through blocks.

---

## Changing Block Size

**Warning**: This is complex because block size affects many systems. Here's what you need to change:

### 1. Geometry Size

```typescript
// src/terrain/worker/generate.ts
const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5); // Change from (1,1,1)
```

Also update in:

- `src/terrain/index.ts` (initBlocks)
- `src/terrain/highlight/index.ts` (highlight box)
- `src/control/index.ts` (collision tempMesh)

### 2. Player Body Dimensions

```typescript
// src/player/index.ts
body = {
  height: 1.8, // Should be > block height
  width: 0.5, // Should be >= block width
};
```

### 3. Collision Detection Distances

```typescript
// src/control/index.ts
this.raycasterDown.far = this.player.body.height; // Adjust for block size
this.raycasterFront.far = this.player.body.width;
```

### 4. Terrain Generation Spacing

If blocks are 0.5 units, you need to adjust positions:

```typescript
// src/terrain/worker/generate.ts
for (let x = ...; x < ...; x += 0.5) {  // Step by block size
  for (let z = ...; z < ...; z += 0.5) {
    matrix.setPosition(x, y + yOffset, z)
  }
}
```

### 5. Chunk Size

```typescript
// src/terrain/index.ts
chunkSize = 24; // Number of blocks per chunk
// If blocks are 0.5 units, chunk is 12 world units wide
```

### 6. Camera Near/Far Planes

```typescript
// src/core/index.ts
this.camera.near = 0.01; // Should be < block size
this.camera.far = 500; // Adjust based on render distance
```

**Pro Tip**: Create a constant `BLOCK_SIZE = 0.5` and use it everywhere instead of hardcoding values.

---

## Adding New Block Types

### Step 1: Add to BlockType Enum

```typescript
// src/terrain/index.ts
export enum BlockType {
  grass = 0,
  sand = 1,
  // ... existing types
  copper = 12, // New type
  marble = 13,
}
```

### Step 2: Add Textures

```typescript
// src/terrain/mesh/materials.ts
import copper from "../../static/textures/block/copper.png";
import marble from "../../static/textures/block/marble.png";

const copperTexture = loader.load(copper);
const marbleTexture = loader.load(marble);

copperTexture.magFilter = THREE.NearestFilter; // Pixelated look
marbleTexture.magFilter = THREE.NearestFilter;
```

### Step 3: Add Materials

```typescript
// src/terrain/mesh/materials.ts
export enum MaterialType {
  // ... existing types
  copper = "copper",
  marble = "marble",
}

materials = {
  // ... existing materials
  copper: new THREE.MeshStandardMaterial({ map: copperTexture }),
  marble: new THREE.MeshStandardMaterial({ map: marbleTexture }),
};
```

### Step 4: Register in Terrain

```typescript
// src/terrain/index.ts
materialType = [
  MaterialType.grass,
  MaterialType.sand,
  // ... existing types
  MaterialType.copper,
  MaterialType.marble,
];

blocksFactor = [
  1,
  0.2,
  0.1,
  0.7,
  0.1,
  0.2,
  0.1,
  0.1,
  0.1,
  0.1,
  0.1,
  0.1,
  0.15, // copper - 15% as common as grass
  0.05, // marble - 5% as common as grass
];
```

**blocksFactor**: Determines how much memory to allocate for each block type. If copper is rare, use a smaller factor.

### Step 5: Add Generation Logic

```typescript
// src/terrain/worker/generate.ts
enum BlockType {
  // ... existing types
  copper = 12,
  marble = 13,
}

// In the generation loop:
const copperOffset = noise.get(x / 8, z / 8, noise.copperSeed) * 10;

if (y < 20 && copperOffset > 7) {
  // Generate copper underground
  blocks[BlockType.copper].setMatrixAt(blocksCount[BlockType.copper]++, matrix);
} else if (stoneOffset > threshold) {
  // Existing stone logic
}
```

### Step 6: Add to Player Inventory (Optional)

```typescript
// src/control/index.ts
holdingBlocks = [
  BlockType.grass,
  BlockType.stone,
  // ... existing types
  BlockType.copper,
  BlockType.marble,
  // ... fill to 10 slots
];
```

### Step 7: Add Sound (Optional)

```typescript
// src/audio/index.ts
playSound(type: BlockType) {
  switch(type) {
    case BlockType.copper:
      // Play metal sound
      break
    case BlockType.marble:
      // Play stone sound
      break
  }
}
```

---

## World Palettes

To create different "biomes" or world themes, you can modify the generation logic:

### Approach 1: Noise-Based Biomes

```typescript
// src/terrain/worker/generate.ts
const biomeNoise = noise.get(x / 100, z / 100, biomeSeed)

if (biomeNoise < -0.3) {
  // Desert biome - more sand, no trees
  if (yOffset < 5) {
    blocks[BlockType.sand].setMatrixAt(...)
  }
} else if (biomeNoise > 0.3) {
  // Forest biome - more trees, grass
  if (treeOffset > lowerThreshold) {
    // Generate tree
  }
} else {
  // Plains biome - normal generation
}
```

### Approach 2: Palette System

Create a palette configuration:

```typescript
// src/terrain/palette.ts
interface WorldPalette {
  surfaceBlock: BlockType;
  subsurfaceBlock: BlockType;
  stoneBlock: BlockType;
  treeBlock: BlockType;
  treeFrequency: number;
  colorTint: number;
}

const PALETTES = {
  overworld: {
    surfaceBlock: BlockType.grass,
    subsurfaceBlock: BlockType.dirt,
    stoneBlock: BlockType.stone,
    treeBlock: BlockType.tree,
    treeFrequency: 0.1,
    colorTint: 0xffffff,
  },
  nether: {
    surfaceBlock: BlockType.netherrack,
    subsurfaceBlock: BlockType.netherrack,
    stoneBlock: BlockType.blackstone,
    treeBlock: BlockType.none,
    treeFrequency: 0,
    colorTint: 0xff6666, // Reddish tint
  },
  end: {
    surfaceBlock: BlockType.endStone,
    subsurfaceBlock: BlockType.endStone,
    stoneBlock: BlockType.endStone,
    treeBlock: BlockType.none,
    treeFrequency: 0,
    colorTint: 0xccccff, // Purple tint
  },
};
```

Then use it in generation:

```typescript
// src/terrain/worker/generate.ts
const palette = PALETTES[currentDimension]

if (yOffset < -3) {
  blocks[palette.surfaceBlock].setMatrixAt(...)
} else {
  blocks[palette.subsurfaceBlock].setMatrixAt(...)
}

if (Math.random() < palette.treeFrequency) {
  // Generate tree
}
```

### Approach 3: Height-Based Palettes

```typescript
if (y < 10) {
  // Deep underground - bedrock, diamonds
} else if (y < 30) {
  // Underground - stone, coal, iron
} else if (y < 60) {
  // Surface - grass, trees
} else {
  // Mountains - stone, snow
}
```

---

## Key Takeaways

1. **InstancedMesh is essential** - It's what makes rendering thousands of blocks possible
2. **Block size affects everything** - Collision, generation, player dimensions, raycasting
3. **Separate mesh per block type** - Because each needs different materials
4. **Web Workers keep it smooth** - Terrain generation happens off the main thread
5. **Chunk system = infinite world** - Only generate what's near the player
6. **Raycasting for interaction** - How the game knows what you're looking at
7. **Custom blocks override procedural** - Player modifications are tracked separately

## Next Steps

1. Start by adding a simple new block type (e.g., copper)
2. Experiment with noise parameters to change terrain shape
3. Try creating a simple biome system
4. Once comfortable, attempt changing block size (start with 0.5)
5. Build a palette system for different dimensions

Good luck! The codebase is well-structured, so once you understand these concepts, modifications become straightforward.
