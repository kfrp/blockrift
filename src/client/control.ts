/** Movement, Collision Detection, and Block Interaction **/
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";
import Player, { Mode } from "./player";
import Terrain, { BlockType } from "./terrain";

import Block from "./mesh/block";
import Noise from "./terrain/noise";
import Audio from "./ui/audio";
import { isMobile } from "./utils";

// Enum representing the 6 possible collision directions in 3D space
enum Side {
  front, // Positive X direction
  back, // Negative X direction
  left, // Negative Z direction
  right, // Positive Z direction
  down, // Negative Y direction (gravity/ground)
  up, // Positive Y direction (ceiling)
}

import MultiplayerManager from "./multiplayer";
import { ChatUI } from "./ui/chatUI";

export default class Control {
  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    player: Player,
    terrain: Terrain,
    audio: Audio,
    multiplayer: MultiplayerManager,
    chatUI: ChatUI
  ) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.terrain = terrain;
    // PointerLockControls handles mouse-look camera rotation
    this.control = new PointerLockControls(camera, document.body);
    this.audio = audio;
    this.multiplayer = multiplayer;
    this.chatUI = chatUI;

    this.far = this.player.body.height; // Used for downward collision detection

    this.initRayCaster();
    this.initEventListeners();
  }

  // ===== CORE PROPERTIES =====
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  player: Player;
  terrain: Terrain;
  control: PointerLockControls;
  audio: Audio;
  multiplayer: MultiplayerManager;
  chatUI: ChatUI;
  // Current velocity in 3D space (x=forward/back, y=up/down, z=left/right)
  velocity = new THREE.Vector3(0, 0, 0);

  // ===== COLLISION STATE FLAGS =====
  // These track whether the player is currently colliding with blocks in each direction
  frontCollide = false; // Collision in positive X
  backCollide = false; // Collision in negative X
  leftCollide = false; // Collision in negative Z
  rightCollide = false; // Collision in positive Z
  downCollide = true; // Collision below (ground) - starts true
  upCollide = false; // Collision above (ceiling)
  isJumping = false; // Tracks if player is mid-jump

  // ===== COLLISION RAYCASTERS =====
  // Six raycasters, one for each direction, used for collision detection
  // These are separate from the main raycaster used for block interaction
  raycasterDown = new THREE.Raycaster();
  raycasterUp = new THREE.Raycaster();
  raycasterFront = new THREE.Raycaster();
  raycasterBack = new THREE.Raycaster();
  raycasterRight = new THREE.Raycaster();
  raycasterLeft = new THREE.Raycaster();

  // ===== TEMPORARY COLLISION MESH =====
  // This invisible mesh is used to simulate blocks for collision detection
  // Instead of raycasting against all terrain blocks (expensive), we create
  // a temporary instanced mesh with only nearby blocks that could collide
  tempMesh = (() => {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      100 // Max 100 instances for collision checking
    );
    mesh.frustumCulled = false; // Always process, even if off-screen
    return mesh;
  })();
  tempMeshMatrix = new THREE.InstancedBufferAttribute(
    new Float32Array(100 * 16), // 16 floats per matrix (4x4)
    16
  );

  // ===== TIMING AND PERFORMANCE =====
  p1 = performance.now(); // Current frame time
  p2 = performance.now(); // Previous frame time
  far: number; // Dynamic raycast distance for downward collision

  // ===== BLOCK SELECTION (HOTBAR) =====
  holdingBlock = BlockType.wood; // Currently selected block type
  // Array of 10 blocks available in hotbar (keys 1-9, 0)
  holdingBlocks = [
    BlockType.wood,
    BlockType.glass,
    BlockType.grass,
    BlockType.stone,
    BlockType.tree,
    BlockType.diamond,
    BlockType.quartz,
    BlockType.coal,
  ];
  holdingIndex = 0; // Current hotbar slot (0-9)
  wheelGap = false; // Debounce flag for mouse wheel
  clickInterval?: ReturnType<typeof setInterval>; // For continuous block breaking
  jumpInterval?: ReturnType<typeof setInterval>; // For continuous jump in flying mode
  mouseHolding = false; // Tracks if mouse button is held
  spaceHolding = false; // Tracks if space is held

  /**
   * Initialize all six directional raycasters for collision detection
   * Each raycaster shoots in one direction from the player's position
   */
  initRayCaster = () => {
    // Set the direction each raycaster points
    this.raycasterUp.ray.direction = new THREE.Vector3(0, 1, 0);
    this.raycasterDown.ray.direction = new THREE.Vector3(0, -1, 0);
    this.raycasterFront.ray.direction = new THREE.Vector3(1, 0, 0);
    this.raycasterBack.ray.direction = new THREE.Vector3(-1, 0, 0);
    this.raycasterLeft.ray.direction = new THREE.Vector3(0, 0, -1);
    this.raycasterRight.ray.direction = new THREE.Vector3(0, 0, 1);

    // Set maximum distance each raycaster can detect
    this.raycasterUp.far = 1.2; // Slightly more than player height for ceiling detection
    this.raycasterDown.far = this.player.body.height; // Detects ground beneath player
    // Horizontal raycasters use player width for side collision
    this.raycasterFront.far = this.player.body.width;
    this.raycasterBack.far = this.player.body.width;
    this.raycasterLeft.far = this.player.body.width;
    this.raycasterRight.far = this.player.body.width;
  };

  // ===== MOVEMENT STATE TRACKING =====
  // Tracks which WASD keys are currently pressed
  downKeys = {
    a: false,
    d: false,
    w: false,
    s: false,
  };

  /**
   * Handles keydown events for movement and mode changes
   * This sets velocity based on key presses and player mode
   */
  setMovementHandler = (e: KeyboardEvent) => {
    // Check if chat input is active
    if (this.chatUI.isInputActive()) {
      // Only handle Escape key to close chat
      if (e.key === "Escape") {
        this.chatUI.hideInputAndRelock();
      }
      // Let all other keys go to the input field
      return;
    }

    // Ignore repeated keydown events (holding key)
    if (e.repeat) {
      return;
    }

    switch (e.key) {
      case "c":
      case "C":
        // Open chat input and prevent default to avoid typing 'c'
        e.preventDefault();
        this.chatUI.showInput();
        return;
      case "q":
        // Toggle between walking and flying mode
        if (this.player.mode === Mode.walking) {
          this.player.setMode(Mode.flying);
        } else {
          this.player.setMode(Mode.walking);
        }
        // Reset all velocity when changing modes
        this.velocity.y = 0;
        this.velocity.x = 0;
        this.velocity.z = 0;
        break;
      case "w":
      case "W":
        // Move forward (positive X in camera space)
        this.downKeys.w = true;
        this.velocity.x = this.player.speed;
        break;
      case "s":
      case "S":
        // Move backward (negative X in camera space)
        this.downKeys.s = true;
        this.velocity.x = -this.player.speed;
        break;
      case "a":
      case "A":
        // Move left (negative Z in camera space)
        this.downKeys.a = true;
        this.velocity.z = -this.player.speed;
        break;
      case "d":
      case "D":
        // Move right (positive Z in camera space)
        this.downKeys.d = true;
        this.velocity.z = this.player.speed;
        break;
      case " ":
        // Space bar: jump in walking mode, move up in flying mode
        if (this.player.mode === Mode.sneaking && !this.isJumping) {
          return; // Can't jump while sneaking
        }
        if (this.player.mode === Mode.walking) {
          // Jump: apply upward velocity once
          if (!this.isJumping) {
            this.velocity.y = 8; // Initial jump velocity
            this.isJumping = true;
            this.downCollide = false;
            // Temporarily disable downward collision detection during jump start
            this.far = 0;
            setTimeout(() => {
              this.far = this.player.body.height;
            }, 300);
          }
        } else {
          // Flying mode: continuous upward movement
          this.velocity.y += this.player.speed;
        }
        // Enable continuous jumping in walking mode when space is held
        if (this.player.mode === Mode.walking && !this.spaceHolding) {
          this.spaceHolding = true;
          this.jumpInterval = setInterval(() => {
            this.setMovementHandler(e);
          }, 10);
        }
        break;
      case "Shift":
        // Shift: sneak in walking mode, move down in flying mode
        if (this.player.mode === Mode.walking) {
          if (!this.isJumping) {
            // Enter sneak mode (slower, prevents falling off edges)
            this.player.setMode(Mode.sneaking);
            // Update velocities to sneak speed
            if (this.downKeys.w) {
              this.velocity.x = this.player.speed;
            }
            if (this.downKeys.s) {
              this.velocity.x = -this.player.speed;
            }
            if (this.downKeys.a) {
              this.velocity.z = -this.player.speed;
            }
            if (this.downKeys.d) {
              this.velocity.z = this.player.speed;
            }
            // Lower camera slightly for sneak
            this.camera.position.setY(this.camera.position.y - 0.2);
          }
        } else {
          // Flying mode: move downward
          this.velocity.y -= this.player.speed;
        }
        break;
      default:
        break;
    }
  };

  /**
   * Handles keyup events to stop movement
   */
  resetMovementHandler = (e: KeyboardEvent) => {
    // Don't process keyup events when chat is active (except Escape which is handled in setMovementHandler)
    if (this.chatUI.isInputActive()) {
      return;
    }

    if (e.repeat) {
      return;
    }

    switch (e.key) {
      case "w":
      case "W":
        this.downKeys.w = false;
        this.velocity.x = 0;
        break;
      case "s":
      case "S":
        this.downKeys.s = false;
        this.velocity.x = 0;
        break;
      case "a":
      case "A":
        this.downKeys.a = false;
        this.velocity.z = 0;
        break;
      case "d":
      case "D":
        this.downKeys.d = false;
        this.velocity.z = 0;
        break;
      case " ":
        if (this.player.mode === Mode.sneaking && !this.isJumping) {
          return;
        }
        // Stop continuous jumping
        this.jumpInterval && clearInterval(this.jumpInterval);
        this.spaceHolding = false;
        if (this.player.mode === Mode.walking) {
          return; // Gravity handles downward movement
        }
        this.velocity.y = 0; // Stop vertical movement in flying mode
        break;
      case "Shift":
        if (this.player.mode === Mode.sneaking) {
          if (!this.isJumping) {
            // Exit sneak mode back to walking
            this.player.setMode(Mode.walking);
            // Update velocities to walking speed
            if (this.downKeys.w) {
              this.velocity.x = this.player.speed;
            }
            if (this.downKeys.s) {
              this.velocity.x = -this.player.speed;
            }
            if (this.downKeys.a) {
              this.velocity.z = -this.player.speed;
            }
            if (this.downKeys.d) {
              this.velocity.z = this.player.speed;
            }
            // Raise camera back up
            this.camera.position.setY(this.camera.position.y + 0.2);
          }
        }
        if (this.player.mode === Mode.walking) {
          return;
        }
        this.velocity.y = 0; // Stop vertical movement in flying mode
        break;
      default:
        break;
    }
  };

  /**
   * Handles mouse clicks for block interaction (add/remove)
   * It uses the block already identified by the Highlight system.
   */
  mousedownHandler = (e: MouseEvent) => {
    // Don't process mouse clicks when chat is active
    if (this.chatUI.isInputActive()) {
      return;
    }

    // Don't allow block modifications in viewer mode
    if (!this.multiplayer.getPlayerModeManager().canModifyBlocks()) {
      console.warn("Block modifications not allowed in viewer mode");
      return;
    }

    e.preventDefault();

    // Get the intersection result directly from the highlight system.
    const block = this.terrain.highlight.block;
    const matrix = new THREE.Matrix4();

    switch (e.button) {
      // LEFT CLICK: Remove block
      case 0:
        {
          // We only need to check if a block was successfully highlighted.
          if (
            block &&
            block.object instanceof THREE.InstancedMesh &&
            typeof block.instanceId === "number" // Ensure instanceId is valid
          ) {
            // Get the position of the clicked block instance
            block.object.getMatrixAt(block.instanceId, matrix);
            const position = new THREE.Vector3().setFromMatrixPosition(matrix);

            // (Prevent removing bedrock, setMatrixAt to zero, play sound, etc.)

            // Prevent removing bedrock (bottom layer)
            if (
              (BlockType[block.object.name as any] as unknown as BlockType) ===
              BlockType.bedrock
            ) {
              // Still generate adjacent blocks to handle edge cases
              this.terrain.generateAdjacentBlocks(position);
              return;
            }

            // Check permissions BEFORE removing the block visually
            // Find the block in customBlocks to check ownership
            let blockToCheck: Block | null = null;
            for (const customBlock of this.terrain.customBlocks) {
              if (
                customBlock.x === position.x &&
                customBlock.y === position.y &&
                customBlock.z === position.z &&
                customBlock.placed
              ) {
                blockToCheck = customBlock;
                break;
              }
            }

            // If this is a custom block, check permissions
            if (blockToCheck) {
              const permissionCheck = this.multiplayer
                .getPlayerModeManager()
                .canRemoveBlock(blockToCheck);
              if (!permissionCheck.allowed) {
                console.warn(
                  `Block removal prevented: ${permissionCheck.reason}`
                );
                return;
              }
            }

            // Remove the block by setting its matrix to zero
            block.object.setMatrixAt(
              block.instanceId,
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

            // Play sound effect based on block type
            this.audio.playSound(
              BlockType[block.object.name as any] as unknown as BlockType
            );

            // Create temporary shrinking mesh for visual feedback
            const mesh = new THREE.Mesh(
              new THREE.BoxGeometry(1, 1, 1),
              this.terrain.materials.get(
                this.terrain.materialType[
                  parseInt(BlockType[block.object.name as any])
                ]
              )
            );
            mesh.position.set(position.x, position.y, position.z);
            this.scene.add(mesh);
            const time = performance.now();
            let raf = 0;
            // Animate block breaking
            const animate = () => {
              if (performance.now() - time > 250) {
                this.scene.remove(mesh);
                cancelAnimationFrame(raf);
                return;
              }
              raf = requestAnimationFrame(animate);
              mesh.geometry.scale(0.85, 0.85, 0.85); // Shrink
            };
            animate();

            // Mark instance matrix as needing update
            block.object.instanceMatrix.needsUpdate = true;

            // Update custom blocks list (for save/load and regeneration)
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
                customBlock.username = this.multiplayer.getUsername();
                customBlock.timestamp = Date.now();
              }
            }

            // If this was a procedurally generated block, add it to custom blocks as removed
            if (!existed) {
              this.terrain.customBlocks.push(
                new Block(
                  position.x,
                  position.y,
                  position.z,
                  BlockType[block.object.name as any] as unknown as BlockType,
                  false, // placed = false means removed
                  this.multiplayer.getUsername(),
                  Date.now()
                )
              );
            }

            // Send block modification to server with the block type
            const blockType = BlockType[
              block.object.name as any
            ] as unknown as BlockType;
            this.multiplayer.sendBlockModification(
              position,
              blockType,
              "remove"
            );

            // Optimistically update builders list
            this.multiplayer.updateBuildersListOptimistically();

            // Generate blocks beneath/around removed block (for infinite depth)
            this.terrain.generateAdjacentBlocks(position);
          }
        }
        break;

      // RIGHT CLICK: Place block
      case 2:
        {
          if (
            block &&
            block.object instanceof THREE.InstancedMesh &&
            typeof block.instanceId === "number"
          ) {
            // (Get face normal, get position, prevent placing in player, etc.)

            // Get face normal to determine where to place new block
            const normal = block.face!.normal;
            block.object.getMatrixAt(block.instanceId, matrix);
            const position = new THREE.Vector3().setFromMatrixPosition(matrix);

            // Prevent placing block inside player (check both head and feet)
            if (
              position.x + normal.x === Math.round(this.camera.position.x) &&
              position.z + normal.z === Math.round(this.camera.position.z) &&
              (position.y + normal.y === Math.round(this.camera.position.y) ||
                position.y + normal.y ===
                  Math.round(this.camera.position.y - 1))
            ) {
              return;
            }

            // Place block adjacent to clicked face
            matrix.setPosition(
              normal.x + position.x,
              normal.y + position.y,
              normal.z + position.z
            );

            // Add instance to the appropriate block type mesh
            console.log(
              "Placing block - holdingBlock:",
              this.holdingBlock,
              "holdingIndex:",
              this.holdingIndex,
              "holdingBlocks[holdingIndex]:",
              this.holdingBlocks[this.holdingIndex]
            );
            this.terrain.blocks[this.holdingBlock].setMatrixAt(
              this.terrain.getCount(this.holdingBlock),
              matrix
            );
            this.terrain.setCount(this.holdingBlock);

            // Play placement sound
            this.audio.playSound(this.holdingBlock);

            // Mark for update
            this.terrain.blocks[this.holdingBlock].instanceMatrix.needsUpdate =
              true;

            // Add to custom blocks list
            this.terrain.customBlocks.push(
              new Block(
                normal.x + position.x,
                normal.y + position.y,
                normal.z + position.z,
                this.holdingBlock,
                true, // placed = true
                this.multiplayer.getUsername(),
                Date.now()
              )
            );

            // Send block modification to server
            this.multiplayer.sendBlockModification(
              new THREE.Vector3(
                normal.x + position.x,
                normal.y + position.y,
                normal.z + position.z
              ),
              this.holdingBlock,
              "place"
            );

            // Optimistically update builders list
            this.multiplayer.updateBuildersListOptimistically();
          }
        }
        break;
      default:
        break;
    }

    // Enable continuous block breaking/placing on mobile
    if (!isMobile && !this.mouseHolding) {
      this.mouseHolding = true;
      this.clickInterval = setInterval(() => {
        this.mousedownHandler(e);
      }, 333);
    }
  };
  /**
   * Stop continuous block interaction on mouse up
   */
  mouseupHandler = () => {
    this.clickInterval && clearInterval(this.clickInterval);
    this.mouseHolding = false;
  };

  /**
   * Handle number key presses to change selected block (hotbar)
   */
  changeHoldingBlockHandler = (e: KeyboardEvent) => {
    // Don't change hotbar when chat is active
    if (this.chatUI.isInputActive()) {
      return;
    }

    if (
      isNaN(parseInt(e.key)) ||
      e.key === "0" ||
      parseInt(e.key) > this.holdingBlocks.length
    ) {
      return;
    }
    this.holdingIndex = parseInt(e.key) - 1; // Keys 1-8 map to indices 0-7

    this.holdingBlock =
      this.holdingBlocks[this.holdingIndex] ?? BlockType.grass;
    console.log(
      "Key pressed:",
      e.key,
      "holdingIndex:",
      this.holdingIndex,
      "holdingBlock:",
      this.holdingBlock
    );
  };

  /**
   * Handle mouse wheel for scrolling through hotbar
   */
  wheelHandler = (e: WheelEvent) => {
    // Don't change hotbar when chat is active
    if (this.chatUI.isInputActive()) {
      return;
    }

    // Debounce wheel events
    if (!this.wheelGap) {
      this.wheelGap = true;
      setTimeout(() => {
        this.wheelGap = false;
      }, 100);

      if (e.deltaY > 0) {
        // Scroll down: next block
        this.holdingIndex++;
        this.holdingIndex > 9 && (this.holdingIndex = 0);
      } else if (e.deltaY < 0) {
        // Scroll up: previous block
        this.holdingIndex--;
        this.holdingIndex < 0 && (this.holdingIndex = 9);
      }

      this.holdingBlock =
        this.holdingBlocks[this.holdingIndex] ?? BlockType.grass;
      console.log(
        "Wheel scrolled - holdingIndex:",
        this.holdingIndex,
        "holdingBlock:",
        this.holdingBlock
      );
    }
  };

  /**
   * Set up event listeners that are only active when pointer is locked
   */
  initEventListeners = () => {
    // Add/remove event listeners based on pointer lock state
    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement) {
        // Pointer locked: game is active
        document.body.addEventListener(
          "keydown",
          this.changeHoldingBlockHandler
        );
        document.body.addEventListener("wheel", this.wheelHandler);
        document.body.addEventListener("keydown", this.setMovementHandler);
        document.body.addEventListener("keyup", this.resetMovementHandler);
        document.body.addEventListener("mousedown", this.mousedownHandler);
        document.body.addEventListener("mouseup", this.mouseupHandler);
      } else {
        // Pointer unlocked: game is paused
        document.body.removeEventListener(
          "keydown",
          this.changeHoldingBlockHandler
        );
        document.body.removeEventListener("wheel", this.wheelHandler);
        document.body.removeEventListener("keydown", this.setMovementHandler);
        document.body.removeEventListener("keyup", this.resetMovementHandler);
        document.body.removeEventListener("mousedown", this.mousedownHandler);
        document.body.removeEventListener("mouseup", this.mouseupHandler);
        // Stop all movement
        this.velocity = new THREE.Vector3(0, 0, 0);
      }
    });
  };

  /**
   * Move camera along X axis (forward/backward in camera space)
   */
  moveX(distance: number, delta: number) {
    this.camera.position.x +=
      distance * (this.player.speed / Math.PI) * 2 * delta;
  }

  /**
   * Move camera along Z axis (left/right in camera space)
   */
  moveZ = (distance: number, delta: number) => {
    this.camera.position.z +=
      distance * (this.player.speed / Math.PI) * 2 * delta;
  };

  /**
   * Check collisions in all 6 directions
   * This is called every frame to update collision state
   */
  collideCheckAll = (
    position: THREE.Vector3,
    noise: Noise,
    customBlocks: Block[],
    far: number
  ) => {
    this.collideCheck(Side.down, position, noise, customBlocks, far);
    this.collideCheck(Side.front, position, noise, customBlocks);
    this.collideCheck(Side.back, position, noise, customBlocks);
    this.collideCheck(Side.left, position, noise, customBlocks);
    this.collideCheck(Side.right, position, noise, customBlocks);
    this.collideCheck(Side.up, position, noise, customBlocks);
  };

  /**
   * Check collision in a specific direction
   * This is the core collision detection logic:
   * 1. Calculate which block position to check based on direction
   * 2. Use procedural generation to determine if a block exists there
   * 3. Account for custom blocks (placed/removed by player)
   * 4. Build a temporary mesh with those blocks
   * 5. Raycast against the temporary mesh
   * 6. Update collision flags
   */
  collideCheck = (
    side: Side,
    position: THREE.Vector3,
    noise: Noise,
    customBlocks: Block[],
    far: number = this.player.body.width
  ) => {
    if (!this.terrain.noise) return;

    const matrix = new THREE.Matrix4();

    // Reset temporary collision mesh
    let index = 0;
    this.tempMesh.instanceMatrix = new THREE.InstancedBufferAttribute(
      new Float32Array(100 * 16),
      16
    );
    this.tempMesh.count = 0;
    // Track which blocks have been removed by player
    let removed = false;
    let treeRemoved = new Array<boolean>(
      this.terrain.noise.treeHeight + 1
    ).fill(false);

    // Calculate block position to check based on direction
    let x = Math.round(position.x);
    let z = Math.round(position.z);

    // Adjust position and set raycaster origin based on direction
    switch (side) {
      case Side.front:
        x++; // Check block in front (positive X)
        this.raycasterFront.ray.origin = position;
        break;
      case Side.back:
        x--; // Check block behind (negative X)
        this.raycasterBack.ray.origin = position;
        break;
      case Side.left:
        z--; // Check block to left (negative Z)
        this.raycasterLeft.ray.origin = position;
        break;
      case Side.right:
        z++; // Check block to right (positive Z)
        this.raycasterRight.ray.origin = position;
        break;
      case Side.down:
        // Check block below
        this.raycasterDown.ray.origin = position;
        this.raycasterDown.far = far; // Dynamic distance for jump handling
        break;
      case Side.up:
        // Check block above (offset down by 1 since camera is at head height)
        this.raycasterUp.ray.origin = new THREE.Vector3().copy(position);
        this.raycasterUp.ray.origin.y--;
        break;
    }

    // Calculate procedural terrain height at this X,Z position
    let y =
      Math.floor(
        noise.get(x / noise.gap, z / noise.gap, noise.seed) * noise.amp
      ) + 30;

    // Check if player has modified blocks at this position
    for (const block of customBlocks) {
      if (block.x === x && block.z === z) {
        if (block.placed) {
          // Player placed a block here - add to collision mesh
          matrix.setPosition(block.x, block.y, block.z);
          this.tempMesh.setMatrixAt(index++, matrix);
        } else if (block.y === y) {
          // Player removed the terrain block - mark as removed
          removed = true;
        } else {
          // Check if player removed part of a tree
          for (let i = 1; i <= this.terrain.noise.treeHeight; i++) {
            if (block.y === y + i) {
              treeRemoved[i] = true;
            }
          }
        }
      }
    }

    // Add procedural terrain block to collision mesh (if not removed)
    if (!removed) {
      matrix.setPosition(x, y, z);
      this.tempMesh.setMatrixAt(index++, matrix);
    }

    // Add tree blocks to collision mesh (if tree exists here)
    for (let i = 1; i <= this.terrain.noise.treeHeight; i++) {
      if (!treeRemoved[i]) {
        // Check if tree should exist at this position
        let treeOffset =
          noise.get(x / noise.treeGap, z / noise.treeGap, noise.treeSeed) *
          noise.treeAmp;

        let stoneOffset =
          noise.get(x / noise.stoneGap, z / noise.stoneGap, noise.stoneSeed) *
          noise.stoneAmp;

        // Tree generation rules: above threshold, not underwater, not in stone area
        if (
          treeOffset > noise.treeThreshold &&
          y >= 27 &&
          stoneOffset < noise.stoneThreshold
        ) {
          matrix.setPosition(x, y + i, z);
          this.tempMesh.setMatrixAt(index++, matrix);
        }
      }
    }

    // Special case: when sneaking, add invisible collision block at edge
    // This prevents player from falling off edges while sneaking
    if (
      this.player.mode === Mode.sneaking &&
      y < Math.floor(this.camera.position.y - 2) &&
      side !== Side.down &&
      side !== Side.up
    ) {
      matrix.setPosition(x, Math.floor(this.camera.position.y - 1), z);
      this.tempMesh.setMatrixAt(index++, matrix);
    }

    // Finalize temporary mesh
    this.tempMesh.count = index;
    this.tempMesh.instanceMatrix.needsUpdate = true;
    // Compute bounding sphere is required for raycasting to work
    this.tempMesh.computeBoundingSphere();

    // Perform raycasting to detect collision
    // Check both at head level and feet level (hence origin and origin-1)
    const origin = new THREE.Vector3(position.x, position.y - 1, position.z);
    switch (side) {
      case Side.front: {
        const c1 = this.raycasterFront.intersectObject(this.tempMesh).length;
        this.raycasterFront.ray.origin = origin;
        const c2 = this.raycasterFront.intersectObject(this.tempMesh).length;
        // Collision if either head or feet hit something
        c1 || c2 ? (this.frontCollide = true) : (this.frontCollide = false);
        break;
      }
      case Side.back: {
        const c1 = this.raycasterBack.intersectObject(this.tempMesh).length;
        this.raycasterBack.ray.origin = origin;
        const c2 = this.raycasterBack.intersectObject(this.tempMesh).length;
        c1 || c2 ? (this.backCollide = true) : (this.backCollide = false);
        break;
      }
      case Side.left: {
        const c1 = this.raycasterLeft.intersectObject(this.tempMesh).length;
        this.raycasterLeft.ray.origin = origin;
        const c2 = this.raycasterLeft.intersectObject(this.tempMesh).length;
        c1 || c2 ? (this.leftCollide = true) : (this.leftCollide = false);
        break;
      }
      case Side.right: {
        const c1 = this.raycasterRight.intersectObject(this.tempMesh).length;
        this.raycasterRight.ray.origin = origin;
        const c2 = this.raycasterRight.intersectObject(this.tempMesh).length;
        c1 || c2 ? (this.rightCollide = true) : (this.rightCollide = false);
        break;
      }
      case Side.down: {
        const c1 = this.raycasterDown.intersectObject(this.tempMesh).length;
        c1 ? (this.downCollide = true) : (this.downCollide = false);
        break;
      }
      case Side.up: {
        const c1 = this.raycasterUp.intersectObject(this.tempMesh).length;
        c1 ? (this.upCollide = true) : (this.upCollide = false);
        break;
      }
    }
  };

  /**
   * Main update loop called every frame
   * Handles movement, collision, and physics
   */
  update = () => {
    // Calculate delta time for frame-rate independent movement
    this.p1 = performance.now();
    const delta = (this.p1 - this.p2) / 1000; // Convert to seconds

    if (this.player.mode === Mode.flying) {
      // FLYING MODE: Simple movement without collision or gravity
      this.control.moveForward(this.velocity.x * delta);
      this.control.moveRight(this.velocity.z * delta);
      this.camera.position.y += this.velocity.y * delta;
    } else {
      // WALKING/SNEAKING MODE: Full physics and collision

      // Check collisions in all directions
      this.collideCheckAll(
        this.camera.position,
        this.terrain.noise,
        this.terrain.customBlocks,
        this.far - this.velocity.y * delta // Adjust downward check during jumps
      );

      // Apply gravity (capped at terminal velocity)
      if (Math.abs(this.velocity.y) < this.player.falling) {
        this.velocity.y -= 25 * delta; // Gravity acceleration
      }

      // Handle ceiling collision
      if (this.upCollide) {
        this.velocity.y = -225 * delta; // Push down
        this.far = this.player.body.height;
      }

      // Handle ground collision and landing
      if (this.downCollide && !this.isJumping) {
        this.velocity.y = 0; // Stop falling
      } else if (this.downCollide && this.isJumping) {
        this.isJumping = false; // Land
      }

      // Calculate camera facing direction for collision-aware movement
      let vector = new THREE.Vector3(0, 0, -1).applyQuaternion(
        this.camera.quaternion
      );
      let direction = Math.atan2(vector.x, vector.z); // Angle in radians

      // COMPLEX COLLISION HANDLING:
      // When colliding with walls, allow sliding along them based on camera angle
      // This entire section handles all combinations of collision directions
      // and camera angles to provide smooth wall sliding
      if (
        this.frontCollide ||
        this.backCollide ||
        this.leftCollide ||
        this.rightCollide
      ) {
        // The following blocks handle collision response for each direction
        // They allow player to slide along walls at angles rather than stopping completely
        // Each block checks: collision direction, camera direction, and movement input
        // Then applies partial movement perpendicular to the wall if possible

        // FRONT COLLISION (positive X)
        if (this.frontCollide) {
          // Camera facing forward (+X), trying to move forward
          if (direction < Math.PI && direction > 0 && this.velocity.x > 0) {
            if (
              (!this.leftCollide && direction > Math.PI / 2) ||
              (!this.rightCollide && direction < Math.PI / 2)
            ) {
              // Slide along wall in Z direction
              this.moveZ(Math.PI / 2 - direction, delta);
            }
          } else if (
            !this.leftCollide &&
            !this.rightCollide &&
            this.velocity.x > 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          }

          // Camera facing backward (-X), trying to move backward
          if (direction < 0 && direction > -Math.PI && this.velocity.x < 0) {
            if (
              (!this.leftCollide && direction > -Math.PI / 2) ||
              (!this.rightCollide && direction < -Math.PI / 2)
            ) {
              this.moveZ(-Math.PI / 2 - direction, delta);
            }
          } else if (
            !this.leftCollide &&
            !this.rightCollide &&
            this.velocity.x < 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          }

          // Strafing left/right while front-collided
          if (
            direction < Math.PI / 2 &&
            direction > -Math.PI / 2 &&
            this.velocity.z < 0
          ) {
            if (
              (!this.rightCollide && direction < 0) ||
              (!this.leftCollide && direction > 0)
            ) {
              this.moveZ(-direction, delta);
            }
          } else if (
            !this.leftCollide &&
            !this.rightCollide &&
            this.velocity.z < 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          }

          if (
            (direction < -Math.PI / 2 || direction > Math.PI / 2) &&
            this.velocity.z > 0
          ) {
            if (!this.rightCollide && direction > 0) {
              this.moveZ(Math.PI - direction, delta);
            }
            if (!this.leftCollide && direction < 0) {
              this.moveZ(-Math.PI - direction, delta);
            }
          } else if (
            !this.leftCollide &&
            !this.rightCollide &&
            this.velocity.z > 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          }
        }

        // BACK COLLISION (negative X)
        if (this.backCollide) {
          // Similar logic as front collision, but for back direction
          if (direction < 0 && direction > -Math.PI && this.velocity.x > 0) {
            if (
              (!this.leftCollide && direction < -Math.PI / 2) ||
              (!this.rightCollide && direction > -Math.PI / 2)
            ) {
              this.moveZ(Math.PI / 2 + direction, delta);
            }
          } else if (
            !this.leftCollide &&
            !this.rightCollide &&
            this.velocity.x > 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          }

          if (direction < Math.PI && direction > 0 && this.velocity.x < 0) {
            if (
              (!this.leftCollide && direction < Math.PI / 2) ||
              (!this.rightCollide && direction > Math.PI / 2)
            ) {
              this.moveZ(direction - Math.PI / 2, delta);
            }
          } else if (
            !this.leftCollide &&
            !this.rightCollide &&
            this.velocity.x < 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          }

          if (
            (direction < -Math.PI / 2 || direction > Math.PI / 2) &&
            this.velocity.z < 0
          ) {
            if (!this.leftCollide && direction > 0) {
              this.moveZ(-Math.PI + direction, delta);
            }
            if (!this.rightCollide && direction < 0) {
              this.moveZ(Math.PI + direction, delta);
            }
          } else if (
            !this.leftCollide &&
            !this.rightCollide &&
            this.velocity.z < 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          }

          if (
            direction < Math.PI / 2 &&
            direction > -Math.PI / 2 &&
            this.velocity.z > 0
          ) {
            if (
              (!this.leftCollide && direction < 0) ||
              (!this.rightCollide && direction > 0)
            ) {
              this.moveZ(direction, delta);
            }
          } else if (
            !this.leftCollide &&
            !this.rightCollide &&
            this.velocity.z > 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          }
        }

        // LEFT COLLISION (negative Z)
        if (this.leftCollide) {
          // Similar logic for left direction
          if (
            (direction < -Math.PI / 2 || direction > Math.PI / 2) &&
            this.velocity.x > 0
          ) {
            if (!this.frontCollide && direction > 0) {
              this.moveX(Math.PI - direction, delta);
            }
            if (!this.backCollide && direction < 0) {
              this.moveX(-Math.PI - direction, delta);
            }
          } else if (
            !this.frontCollide &&
            !this.backCollide &&
            this.velocity.x > 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (
            this.frontCollide &&
            direction < 0 &&
            direction > -Math.PI / 2 &&
            this.velocity.x > 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (
            this.backCollide &&
            direction < Math.PI / 2 &&
            direction > 0 &&
            this.velocity.x > 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          }

          if (
            direction < Math.PI / 2 &&
            direction > -Math.PI / 2 &&
            this.velocity.x < 0
          ) {
            if (
              (!this.frontCollide && direction < 0) ||
              (!this.backCollide && direction > 0)
            ) {
              this.moveX(-direction, delta);
            }
          } else if (
            !this.frontCollide &&
            !this.backCollide &&
            this.velocity.x < 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (
            this.frontCollide &&
            direction < Math.PI &&
            direction > Math.PI / 2 &&
            this.velocity.x < 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (
            this.backCollide &&
            direction > -Math.PI &&
            direction < -Math.PI / 2 &&
            this.velocity.x < 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          }

          if (direction > 0 && direction < Math.PI && this.velocity.z < 0) {
            if (
              (!this.backCollide && direction > Math.PI / 2) ||
              (!this.frontCollide && direction < Math.PI / 2)
            ) {
              this.moveX(Math.PI / 2 - direction, delta);
            }
          } else if (
            !this.frontCollide &&
            !this.backCollide &&
            this.velocity.z < 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (
            this.frontCollide &&
            direction > -Math.PI &&
            direction < -Math.PI / 2 &&
            this.velocity.z < 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (
            this.backCollide &&
            direction > -Math.PI / 2 &&
            direction < 0 &&
            this.velocity.z < 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          }

          if (direction < 0 && direction > -Math.PI && this.velocity.z > 0) {
            if (
              (!this.backCollide && direction > -Math.PI / 2) ||
              (!this.frontCollide && direction < -Math.PI / 2)
            ) {
              this.moveX(-Math.PI / 2 - direction, delta);
            }
          } else if (
            !this.frontCollide &&
            !this.backCollide &&
            this.velocity.z > 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (
            this.frontCollide &&
            direction < Math.PI / 2 &&
            direction > 0 &&
            this.velocity.z > 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (
            this.backCollide &&
            direction < Math.PI &&
            direction > Math.PI / 2 &&
            this.velocity.z > 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          }
        }

        // RIGHT COLLISION (positive Z)
        if (this.rightCollide) {
          // Similar logic for right direction
          if (
            direction < Math.PI / 2 &&
            direction > -Math.PI / 2 &&
            this.velocity.x > 0
          ) {
            if (
              (!this.backCollide && direction < 0) ||
              (!this.frontCollide && direction > 0)
            ) {
              this.moveX(direction, delta);
            }
          } else if (
            !this.frontCollide &&
            !this.backCollide &&
            this.velocity.x > 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (
            this.frontCollide &&
            direction < -Math.PI / 2 &&
            direction > -Math.PI &&
            this.velocity.x > 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (
            this.backCollide &&
            direction < Math.PI &&
            direction > Math.PI / 2 &&
            this.velocity.x > 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          }

          if (
            (direction < -Math.PI / 2 || direction > Math.PI / 2) &&
            this.velocity.x < 0
          ) {
            if (!this.backCollide && direction > 0) {
              this.moveX(-Math.PI + direction, delta);
            }
            if (!this.frontCollide && direction < 0) {
              this.moveX(Math.PI + direction, delta);
            }
          } else if (
            !this.frontCollide &&
            !this.backCollide &&
            this.velocity.x < 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (
            this.frontCollide &&
            direction < Math.PI / 2 &&
            direction > 0 &&
            this.velocity.x < 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          } else if (
            this.backCollide &&
            direction < 0 &&
            direction > -Math.PI / 2 &&
            this.velocity.x < 0
          ) {
            this.control.moveForward(this.velocity.x * delta);
          }

          if (direction < 0 && direction > -Math.PI && this.velocity.z < 0) {
            if (
              (!this.frontCollide && direction > -Math.PI / 2) ||
              (!this.backCollide && direction < -Math.PI / 2)
            ) {
              this.moveX(Math.PI / 2 + direction, delta);
            }
          } else if (
            !this.frontCollide &&
            !this.backCollide &&
            this.velocity.z < 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (
            this.frontCollide &&
            direction > Math.PI / 2 &&
            direction < Math.PI &&
            this.velocity.z < 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (
            this.backCollide &&
            direction > 0 &&
            direction < Math.PI / 2 &&
            this.velocity.z < 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          }

          if (direction > 0 && direction < Math.PI && this.velocity.z > 0) {
            if (
              (!this.frontCollide && direction > Math.PI / 2) ||
              (!this.backCollide && direction < Math.PI / 2)
            ) {
              this.moveX(direction - Math.PI / 2, delta);
            }
          } else if (
            !this.frontCollide &&
            !this.backCollide &&
            this.velocity.z > 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (
            this.frontCollide &&
            direction > -Math.PI / 2 &&
            direction < 0 &&
            this.velocity.z > 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          } else if (
            this.backCollide &&
            direction > -Math.PI &&
            direction < -Math.PI / 2 &&
            this.velocity.z > 0
          ) {
            this.control.moveRight(this.velocity.z * delta);
          }
        }
      } else {
        // NO COLLISION: Move freely
        this.control.moveForward(this.velocity.x * delta);
        this.control.moveRight(this.velocity.z * delta);
      }

      // Apply vertical movement (gravity/jump)
      this.camera.position.y += this.velocity.y * delta;

      // Safety net: teleport player back up if they fall through world
      if (this.camera.position.y < -100) {
        this.camera.position.y = 60;
      }
    }

    // Store current time for next frame's delta calculation
    this.p2 = this.p1;
  };
}
