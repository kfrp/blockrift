# Implementation Plan

## Phase 1: Core Engine & A Single Block (Get Something Visible ASAP)

- [x] 1. Set up project structure and core configuration

  - Initialize Vite + TypeScript project with proper tsconfig
  - Install Babylon.js and type definitions
  - Create directory structure (src/core, src/world, src/player, src/ui, src/utils, public)
  - Implement GameConfig interface and default configuration loader
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 2. Set up Babylon.js scene and game manager

  - Create GameManager class to orchestrate game lifecycle (init, start, pause, resume)
  - Implement main game loop with delta time calculation
  - Initialize Babylon.js Engine with WebGL context
  - Create Scene with basic performance optimizations
  - Set up UniversalCamera for first-person view
  - Implement lighting system (ambient + directional sun)
  - Add basic skybox for atmosphere
  - Implement WebGL context loss handling
  - _Requirements: 10.8, 7.1, 7.2_

- [x] 3. Implement core event system and coordinate utilities

  - Create EventEmitter generic class with type-safe event handling
  - Define initial game event types (BlockPlaced, BlockRemoved, ChunkLoaded, etc.)
  - Implement event subscription and emission methods
  - Create Vector3Int class for integer coordinates
  - Implement coordinate conversion functions (world ↔ block ↔ chunk ↔ local)
  - Write utility functions for chunk position calculations
  - _Requirements: 9.1, 9.2, 9.4, 5.1, 5.5, 10.6_

- [x] 4. Create block registry and initial texture assets

  - Implement BlockType interface and Block data structure
  - Create BlockRegistry class with registration and lookup methods
  - Define a few core block types (stone, grass, dirt) in JSON configuration
  - Create or source initial texture images for these blocks in public/textures
  - Implement basic texture loading system
  - Implement block validation and error handling for invalid types
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 5. Build chunk system foundation

  - Implement Chunk class with Uint16Array block storage
  - Create ChunkManager with basic chunk loading/unloading stubs
  - Implement getBlock, setBlock, and removeBlock methods on ChunkManager
  - Add chunk state management (empty, generating, ready, unloading)
  - _Requirements: 9.3, 9.5, 10.6, 10.7_

- [x] 6. Implement simple world generation and basic rendering

  - Install simplex-noise library
  - Create WorldGenerator class that generates a flat plane of stone blocks (single chunk)
  - Implement face culling logic (check adjacent blocks to skip hidden faces)
  - Generate basic, non-optimized mesh for the chunk using Babylon.js VertexData
  - Apply simple material with basic texture
  - Render the chunk in the scene
  - _Requirements: 5.1, 10.1, 10.2_

- [x] 7. Implement basic player controller and input

  - Create Player class with position, velocity, rotation state
  - Implement PlayerController with update loop
  - Create InputManager class with InputState interface
  - Implement keyboard input handling (WASD for movement)
  - Add Space key for jump
  - Implement mouse movement for camera rotation
  - Apply camera sensitivity from configuration
  - Add basic gravity and AABB collision detection against voxel grid
  - Add ground detection using downward raycast (isGrounded state)
  - Spawn player above the generated flat plane
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 4.1, 4.2, 4.3_

## Phase 2: World Expansion & Interaction

- [ ] 8. Implement advanced world generation

  - Integrate simplex-noise to generate terrain with hills and valleys
  - Generate base terrain layers (grass, dirt, stone)
  - Implement tree generation algorithm (wood trunks + leaf clusters)
  - Add road/cement structure generation
  - Generate cloud formations at high altitude
  - Ensure no voids beneath terrain (solid base layer)
  - Support loading pre-generated world configurations
  - Add additional block types (wood, leaves, cement, cloud) to registry and textures
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 8.1, 8.2_

- [ ] 9. Implement greedy meshing optimization

  - Create MeshOptimizer class
  - Build greedy meshing algorithm for combining adjacent faces
  - Create optimized VertexData generation for chunk meshes
  - Build texture atlas combining all block textures
  - Implement texture atlas UV mapping
  - Replace basic chunk mesh generation with optimized version
  - Add mesh generation performance profiling
  - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [ ] 10. Implement dynamic chunk loading and culling

  - In ChunkManager, implement dynamic chunk loading/unloading around player
  - Use renderDistance config to determine which chunks to load
  - Create Renderer class to manage chunk mesh rendering
  - Implement render distance culling (only render chunks within configured distance)
  - Add frustum culling optimization
  - Implement chunk mesh pooling and reuse
  - Implement chunk pooling for memory efficiency
  - Optimize material and texture management
  - _Requirements: 10.4, 10.6, 10.7, 9.3, 9.5_

- [ ] 11. Build raycast system for block interaction

  - Implement Raycast system using Babylon.js scene.pick()
  - Cast ray from camera center forward
  - Detect block hit within interaction range
  - Calculate adjacent empty position for block placement
  - Configure raycast to only hit solid blocks
  - _Requirements: 2.1, 2.2_

- [ ] 12. Implement block placement and removal logic

  - Add mouse click handlers to InputManager (left click = remove, right click = place)
  - Wire up left click to remove block at raycast position
  - Wire up right click to place block at adjacent position
  - Emit BlockPlaced and BlockRemoved events
  - Mark affected chunks as dirty for mesh regeneration
  - Implement void prevention check (ensure terrain beneath)
  - Display console message when removal is prevented
  - Update world state through ChunkManager
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 5.8_

- [ ] 13. Build UI layer and HUD using Babylon.js GUI

  - Install @babylonjs/gui
  - Set up Babylon.js GUI with AdvancedDynamicTexture.CreateFullscreenUI()
  - Create crosshair overlay using GUI elements (plus-shaped, centered)
  - Update crosshair visual feedback based on raycast result
  - Add FPS counter for performance monitoring
  - Ensure UI scales automatically with canvas resolution
  - _Requirements: 2.1_

- [ ] 14. Implement block selection system

  - Implement block selection state in Player class
  - Add number key (1-9) handlers to InputManager for block selection
  - Validate selected block exists in registry
  - Implement selected block indicator UI in HUD
  - Display visual indicator of currently selected block
  - _Requirements: 3.1, 3.2, 3.5_

## Phase 3: Mobile Controls, Menus & Polish

- [ ] 15. Implement mobile input system

  - Detect mobile device and enable mobile mode
  - Create virtual joystick UI component using Babylon.js GUI (directional buttons + center jump)
  - Implement touch-based camera rotation
  - Add touch position tracking for block interaction
  - Create add/remove mode toggle button
  - Build touch-based block selection menu
  - Prevent default browser gestures (pinch zoom, pull-to-refresh)
  - Handle multi-touch scenarios
  - Update HUD to show mobile controls
  - _Requirements: 1.7, 1.8, 1.9, 1.10, 2.5, 2.6, 2.7, 3.3, 3.4_

- [ ] 16. Implement menu system

  - Create MenuSystem class with state management
  - Build main menu UI using Babylon.js GUI (Start Game, Instructions, Options buttons)
  - Build pause menu UI using Babylon.js GUI (Resume, Options, Quit buttons)
  - Implement menu navigation and button handlers
  - Add menu show/hide transitions
  - Pause game logic when menu is displayed
  - Add ESC key handler to InputManager for menu toggle
  - Wire up Start Game to initialize world and begin gameplay
  - Update GameManager to handle game state machine (menu, loading, playing, paused)
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 17. Implement configuration and options menu

  - Create configuration UI in options menu using Babylon.js GUI
  - Add sliders/inputs for player speed, block size, render distance
  - Add camera sensitivity control
  - Add jump height control
  - Implement configuration save/load to localStorage (extend ConfigLoader)
  - Apply configuration changes dynamically where possible
  - Add options button handlers in main menu and pause menu
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [ ] 18. Implement instructions screen

  - Create instructions UI with control explanations using Babylon.js GUI
  - Document desktop controls (WASD, Space, Mouse, 1-9, ESC)
  - Document mobile controls (joystick, touch, mode toggle, block menu)
  - Add instructions button handler in main menu
  - Add back button to return to main menu
  - _Requirements: 7.1_

- [ ] 19. Implement world persistence (save/load)

  - Create SaveData interface for serializing game state
  - Implement save system that tracks modified chunks
  - Serialize player state and modified chunks to JSON
  - Store save data in browser's IndexedDB
  - Implement load system that checks for existing saves
  - Merge loaded chunks with procedural generation
  - Add save/load UI buttons in pause menu
  - Implement run-length encoding for chunk data compression
  - Create centralized GameState interface and state store
  - Implement action dispatchers for state updates with immutable patterns
  - _Requirements: 9.3, 9.5, 9.1, 9.2, 9.4_

- [ ] 20. Implement player spawn and falling sequence

  - Calculate spawn position above generated terrain
  - Spawn player at elevated position
  - Enable gravity to make player fall
  - Detect landing on terrain
  - Enable full controls after landing
  - Ensure world is generated before spawn
  - Add jump/fly mechanics
  - Enforce player movement constraints
  - Implement movement in all directions with collision sliding
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 1.4, 1.5_

- [ ] 21. Optimize rendering performance

  - Implement instanced rendering for repeated geometries (clouds)
  - Enable scene.freezeActiveMeshes() for static chunks
  - Use mesh.freezeWorldMatrix() for non-moving chunks
  - Implement scene.blockMaterialDirtyMechanism
  - Add mobile-specific optimizations (hardware scaling, disable shadows)
  - Profile and optimize draw calls
  - Ensure target frame rate of 30+ FPS on mid-range devices
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.8_

- [ ] 22. Polish and final integration

  - Test complete gameplay flow from menu to playing
  - Verify all controls work on desktop and mobile
  - Test block placement and removal in various scenarios
  - Verify chunk loading/unloading works correctly
  - Test pause/resume functionality
  - Test save/load functionality
  - Ensure no console errors or warnings
  - Verify performance meets target FPS
  - Test on multiple browsers and devices
  - _Requirements: All_

- [ ]\* 23. Write unit tests for core systems

  - Write tests for coordinate conversion utilities
  - Write tests for BlockRegistry
  - Write tests for Chunk block storage operations
  - Write tests for greedy meshing algorithm
  - Write tests for AABB collision detection
  - Write tests for state management actions
  - _Requirements: 4.1, 5.1, 8.1, 10.3_

- [ ]\* 24. Create developer documentation
  - Document project structure and architecture
  - Create API documentation for major classes
  - Document how to add new block types
  - Document how to create themed worlds
  - Document state management patterns
  - Add code comments for complex algorithms (greedy meshing, AABB collision)
  - _Requirements: 8.6_
