# Implementation Plan

This implementation plan breaks down the multiplayer conversion into discrete, actionable coding tasks. Each task builds incrementally on previous work, with all code integrated as it's written. The plan follows a phased approach: server infrastructure first, then block synchronization, then player synchronization, and finally polish.

## Phase 1: Server Infrastructure

- [x] 1. Implement username assignment and session management

  - [x] 1.1 Add environment detection (development vs production)

    - Create environment variable check for NODE_ENV
    - _Requirements: 12.1_

  - [x] 1.2 Implement random username generation for development

    - Generate unique usernames like "Player1234"
    - _Requirements: 1.1, 1.2, 12.2_

  - [x] 1.3 Add session tracking for connected clients

    - Track username, sessionId, WebSocket connection, and last position update
    - _Requirements: 1.3, 1.4, 1.5_

- [x] 1b. Implement Redis chunk-based storage schema

  - [x] 1b.1 Create helper functions for chunk coordinate calculation

    - Implement function to convert block position to chunk coordinates
    - _Requirements: 2.1_

  - [x] 1b.2 Implement chunk-based Redis operations

    - Implement HSET for block placement in chunk hash
    - Implement HDEL for block removal from chunk hash
    - Implement HGETALL for retrieving all blocks in a chunk
    - _Requirements: 2.1, 2.2, 8.5_

  - [x] 1b.3 Implement terrain seed management with level support

    - Initialize terrain seeds in Redis per level if not exists
    - Generate deterministic seeds based on level name using hash function
    - Implement retrieval of terrain seeds for specific level
    - Update Redis keys to be level-specific (level:${level}:chunk:...)
    - _Requirements: 2.3, 2.4_

- [x] 2. Implement connection handshake and initial world state delivery with level support

  - Handle client connection and assign username
  - Accept level parameter from client subscription message
  - Store level in ConnectedClient interface
  - Initialize and retrieve level-specific terrain seeds from Redis
  - Send ConnectedMessage with username, level, and terrain seeds to client
  - Implement world state request handler that queries Redis for level-specific chunk data
  - Return WorldStateResponse with blocks and active players
  - Broadcast player-joined event to existing clients in same level
  - Handle client disconnection and broadcast player-left event
  - _Requirements: 1.3, 7.1, 7.2, 7.3_

- [x] 3. Write server infrastructure tests

  - Test username generation produces unique names
  - Test chunk coordinate calculation from block positions
  - Test Redis HSET/HGET/HDEL operations for block storage
  - Test terrain seed initialization and retrieval
  - Test connection handshake flow
  - _Requirements: 1.1, 2.1, 2.2_

## Phase 2: Block Synchronization

- [x] 4. Create client-side multiplayer manager and integrate into main loop with level support

  - Create MultiplayerManager class in src/client/multiplayer.ts
  - Implement connection management using existing realtime.ts API with level parameter
  - Add level parameter to connectRealtime function in realtime.ts
  - Extract level from URL query parameter (?level=world1) in main.ts
  - Pass level to multiplayer.connect(level) method
  - Add username storage received from server
  - Implement message routing for different message types (stub methods initially)
  - Add player entity map for tracking other players
  - Import and initialize MultiplayerManager in main.ts
  - Pass multiplayer manager to Control constructor
  - Add multiplayer.update() call in animation loop (can be empty initially)
  - _Requirements: 1.4, 7.4, 8.1, 8.2, 8.3_

- [x] 5. Implement optimistic block modification on client

  - Modify Block class to include username and timestamp fields
  - Update Control class to accept MultiplayerManager in constructor
  - Modify mousedownHandler to send block modifications via multiplayer manager
  - Implement sendBlockModification method that sends to server
  - Keep existing immediate local visual update behavior
  - _Requirements: 3.1, 3.2, 5.1_

- [x] 6. Implement server-side block modification handling with level support

  - Create handleBlockModification method in server
  - Extract level from ConnectedClient for level-specific storage
  - Add server timestamp to incoming block modifications
  - Immediately broadcast modification via Redis pub/sub
  - Asynchronously persist to Redis using level-specific chunk-based hash storage
  - Update storeBlockPlacement, removeBlock, and getChunkBlocks to accept level parameter
  - Implement retry logic with exponential backoff for Redis failures
  - _Requirements: 3.3, 3.4, 3.5, 10.5_

- [x] 7. Implement client-side block modification reception

  - Add handleBlockModification method in MultiplayerManager
  - Check if modification is from self (ignore to prevent duplicate)
  - Apply modifications from other players to local terrain
  - Update customBlocks array with received modifications
  - Update appropriate InstancedMesh for the block type
  - _Requirements: 3.1, 5.2, 5.3, 6.1, 6.4, 8.5_

- [x] 7b. Implement client-side terrain seed synchronization

  - Update Noise class constructor to require seed parameter (no random generation)
  - Update Terrain class to not create Noise instance until seeds received
  - Update Terrain constructor to not call generate() initially
  - Implement setSeeds() method in Terrain to initialize Noise and generate terrain
  - Update handleConnected in MultiplayerManager to apply server seeds via setSeeds()
  - Update terrain worker to initialize Noise with received seeds (not random)
  - Disable UI "Play" button terrain reset functionality in multiplayer mode
  - Disable UI save/load functionality in multiplayer mode (server manages state)
  - Add console logging to track seed initialization flow
  - _Requirements: 2.3, 2.4, 8.5_

- [x] 8. Implement conflict resolution for simultaneous modifications

  - Add timestamp comparison logic in handleBlockModification
  - Override local changes if server timestamp is newer
  - Log conflicts for monitoring purposes
  - _Requirements: 6.1, 6.2, 6.3, 6.5, 10.1, 10.4_

- [x] 9. Write block synchronization tests (HIGHLY RECOMMENDED before proceeding)

  - Test block placement is broadcast to other clients
  - Test block removal is broadcast to other clients
  - Test modifications persist in Redis chunk hashes
  - Test conflict resolution with simultaneous modifications
  - Test self-originated modifications are ignored
  - _Requirements: 3.3, 6.2, 6.4_
  - _Note: While optional, these tests are critical for catching bugs in core multiplayer functionality that are extremely difficult to debug later_

## Phase 3: Player Synchronization

**Note:** This phase follows a strategic order: build static renderer → connect networking → add animation polish. This allows early verification that networking works correctly before adding complex animations.

- [x] 10. Create static PlayerEntityRenderer class with voxel character structure

  - [x] 10.1 Create PlayerEntityRenderer class in src/client/playerEntityRenderer.ts

    - Define class with public group (THREE.Group) property
    - Add properties for body parts: head, torso, leftArm, rightArm, leftLeg, rightLeg (all THREE.Mesh)
    - Add state properties: targetPosition, targetRotation
    - Add stub update method that directly copies targetPosition to group.position (no interpolation yet)
    - _Requirements: 4.3, 4.4, 7.4_

  - [x] 10.2 Implement buildVoxelCharacter method

    - Create THREE.Group as root container
    - Create torso mesh (0.6x1.2x0.4 units) at position (0, 1.2, 0)
    - Create head mesh (0.5x0.5x0.5 units) at position (0, 1.6, 0)
    - Create left and right arm meshes (0.3x0.8x0.3 units) at positions (±0.4, 1.2, 0)
    - Create left and right leg meshes (0.3x0.8x0.3 units) at positions (±0.2, 0.6, 0)
    - Set pivot points for arms and legs at their top (for rotation)
    - Apply deterministic color based on username hash
    - Add all parts to group and return
    - _Requirements: 4.3, 4.4_

  - [x] 10.3 Implement username label sprite

    - Create canvas element (256x64 pixels)
    - Draw semi-transparent black background (rgba(0, 0, 0, 0.6))
    - Draw username text in white, bold 32px Arial, centered
    - Create THREE.CanvasTexture from canvas
    - Create THREE.Sprite with texture
    - Scale sprite to 2x0.5 units
    - Position sprite at y=2.5 (above head)
    - Add sprite to character group
    - _Requirements: 4.4_

  - [x] 10.4 Implement setTargetState method

    - Accept position (THREE.Vector3) and rotation (THREE.Euler) parameters
    - Copy position to targetPosition property
    - Copy rotation to targetRotation property
    - _Requirements: 4.3_

  - [x] 10.5 Integrate PlayerEntityRenderer into MultiplayerManager

    - Update PlayerEntity interface to use renderer: PlayerEntityRenderer instead of mesh
    - Modify createPlayerEntity to instantiate PlayerEntityRenderer
    - Add renderer.group to scene instead of mesh
    - Update removePlayerEntity to remove renderer.group from scene
    - Add stub update method in MultiplayerManager that calls renderer.update for each player
    - _Requirements: 4.3, 7.4_

- [x] 11. Implement client-side position broadcasting

  - Add position update interval (10 times per second) in main.ts
  - Implement sendPositionUpdate method in MultiplayerManager
  - Round coordinates to 2 decimal places to reduce message size
  - Send position and rotation data to server
  - _Requirements: 4.1, 11.2, 11.4_

- [x] 12. Implement server-side position batching and broadcasting

  - Store latest position for each connected client
  - Create broadcastPositionUpdates method called 10 times per second
  - Batch all player positions into single PositionUpdatesBroadcast message
  - Broadcast via Redis pub/sub
  - _Requirements: 4.2, 11.2, 11.5_

- [x] 13. Implement position update message handling

  - [x] 13.1 Implement handlePositionUpdate in MultiplayerManager

    - Extract username, position, and rotation from message
    - Find player entity in players map
    - Call player.renderer.setTargetState with new position and rotation
    - _Requirements: 4.3_

  - [x] 13.2 Handle batched position updates

    - Implement handlePositionUpdates for PositionUpdatesBroadcast messages
    - Iterate through players array in message
    - Call setTargetState for each player's renderer
    - _Requirements: 4.3, 11.1_

  - [x] 13.3 Update MultiplayerManager.update to ensure labels face camera

    - Iterate through all players in the map
    - Call player.renderer.update(deltaTime) for each player
    - Ensure username label sprite always faces camera using lookAt
    - _Requirements: 4.3, 11.1_

- [x] 14. Handle player join and leave events

  - Implement player-joined message handling on client
  - Create new PlayerEntityRenderer when player joins
  - Implement player-left message handling on client
  - Remove player entity and cleanup resources when player leaves
  - Dispose of all meshes and materials properly
  - _Requirements: 4.5, 7.3_

**At this point, you should see static voxel characters moving around (snapping to positions). Now add animation polish:**

- [x] 15. Implement turn-before-move and movement interpolation

  - [x] 15.1 Add animation state properties to PlayerEntityRenderer

    - Add isTurning: boolean, lastPosition: THREE.Vector3 properties
    - Add turningDuration: number = 0.15 property
    - _Requirements: 4.3, 11.1_

  - [x] 15.2 Implement handleTurning method in PlayerEntityRenderer

    - Accept deltaTime and targetRotation parameters
    - Use THREE.MathUtils.lerp to interpolate group.rotation.y toward targetRotation
    - Apply lerp factor of deltaTime / turningDuration
    - Check if rotation difference is less than 0.05 radians
    - Set isTurning to false when turn is complete
    - _Requirements: 4.3, 11.1_

  - [x] 15.3 Implement handleMovement method in PlayerEntityRenderer

    - Accept deltaTime parameter
    - Use group.position.lerp to interpolate toward targetPosition
    - Apply lerp factor of 0.2 \* deltaTime \* 60 for smooth movement
    - _Requirements: 4.3, 11.1_

  - [x] 15.4 Update PlayerEntityRenderer.update method with interpolation logic

    - Calculate positionChanged by checking distance to targetPosition (> 0.01)
    - Check if rotation difference is significant (> 0.1 radians)
    - Set isTurning to true if position changed and rotation differs
    - Call handleTurning if isTurning is true, otherwise call handleMovement
    - _Requirements: 4.3, 11.1_

- [x] 16. Implement walking animation with sinusoidal motion

  - [x] 16.1 Add animation properties to PlayerEntityRenderer

    - Add walkTime: number = 0 property
    - Add stub applyAnimations method to update method (called after movement)
    - _Requirements: 4.3_

  - [x] 16.2 Implement applyAnimations method for walking state

    - Accept deltaTime and isMoving boolean parameters
    - If isMoving is true, increment walkTime by deltaTime \* 10
    - Apply arm swing: leftArm.rotation.x = Math.sin(walkTime) \* 0.8
    - Apply opposite arm swing: rightArm.rotation.x = Math.sin(walkTime + Math.PI) \* 0.8
    - Apply leg swing: leftLeg.rotation.x = Math.sin(walkTime + Math.PI) \* 0.8
    - Apply opposite leg swing: rightLeg.rotation.x = Math.sin(walkTime) \* 0.8
    - Apply head bob: head.position.y = 1.6 + Math.abs(Math.sin(walkTime \* 0.5)) \* 0.1
    - _Requirements: 4.3_

  - [x] 16.3 Implement applyAnimations method for idle state

    - If isMoving is false, reset walkTime to 0
    - Lerp leftArm.rotation.x toward 0 with factor 0.1
    - Lerp rightArm.rotation.x toward 0 with factor 0.1
    - Set leftLeg.rotation.x to 0
    - Set rightLeg.rotation.x to 0
    - Set head.position.y to 1.6 (rest position)
    - _Requirements: 4.3_

- [x] 17. Implement jump detection and animation

  - [x] 17.1 Add ground state and position tracking to PlayerEntityRenderer

    - Add isGrounded: boolean and lastGroundY: number properties
    - Add positionStableTime: number property to track stability duration
    - Initialize lastGroundY in constructor from initialPosition.y
    - In update method, check if targetPosition.y has changed by less than 0.01 units
    - If stable, increment positionStableTime by deltaTime
    - If positionStableTime exceeds 0.2 seconds, set isGrounded = true and update lastGroundY
    - If targetPosition.y changes significantly, reset positionStableTime and set isGrounded = false
    - _Requirements: 4.3_

  - [x] 17.2 Implement jump detection logic

    - In update method, check if isGrounded is true and targetPosition.y > lastGroundY + 0.5
    - Set isJumping flag to true when jump is detected
    - Set isJumping to false when isGrounded becomes true again
    - _Requirements: 4.3_

  - [x] 17.3 Modify applyAnimations to handle jumping

    - If isJumping is true, override walk animation
    - Set arms to slightly tucked position (rotation.x = -0.3)
    - Set legs to straight position (rotation.x = 0)
    - Disable head bob during jump
    - _Requirements: 4.3_

- [ ]\* 18. Write player synchronization tests
  - Test player positions are broadcast at 10 Hz
  - Test PlayerEntityRenderer creates proper voxel structure
  - Test player entities are created on join
  - Test player entities are removed on leave
  - Test position interpolation produces smooth movement
  - Test walking animation alternates arms and legs
  - Test turn-before-move logic works correctly
  - _Requirements: 4.1, 4.2, 4.5_

## Phase 4: Reconnection and Error Handling

- [ ] 19. Implement client-side reconnection logic

  - Add disconnection detection in MultiplayerManager
  - Display "Reconnecting" UI message on disconnect
  - Implement exponential backoff reconnection (up to 5 attempts)
  - Queue block modifications during disconnection
  - Send queued modifications for validation after reconnection
  - Request world state resync after reconnection
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 20. Implement server-side validation for queued modifications

  - Create validateAndApplyBlockModification method
  - Check if block exists at position for removal actions
  - Check if position is empty for placement actions
  - Send rejection message to client if validation fails
  - Apply and broadcast valid modifications
  - _Requirements: 9.5, 10.2, 10.3_

- [ ] 21. Add error handling and logging

  - Implement handleClientError method on server
  - Add try-catch blocks around message parsing
  - Log critical errors for Redis persistence failures
  - Send user-friendly error messages to clients
  - Add error display UI on client
  - _Requirements: 9.6, 10.5_

- [ ]\* 22. Write reconnection and error handling tests (HIGHLY RECOMMENDED before proceeding)
  - Test client reconnects after disconnect
  - Test queued modifications are validated
  - Test invalid queued modifications are rejected
  - Test world state is resynchronized after reconnection
  - _Requirements: 9.2, 9.3, 9.5_
  - _Note: While optional, these tests are critical for ensuring reconnection logic works correctly, which is difficult to debug in production_

## Phase 5: Integration and Polish

- [ ] 23. Add position update interval to main game loop

  - Add setInterval for position updates (10 times per second)
  - Call multiplayer.sendPositionUpdate with camera position and rotation
  - _Requirements: 4.1, 8.4_

- [ ] 24. Update terrain generation to use server-provided seeds

  - Modify Terrain class to accept seeds from server
  - Remove local random seed generation
  - Use seeds from ConnectedMessage for procedural generation
  - Ensure all clients generate identical terrain from same seeds
  - _Requirements: 2.3, 2.4, 8.4_

- [ ] 25. Implement block ownership display

  - Add hover detection for blocks in Highlight class
  - Display username tooltip when hovering over placed blocks
  - Retrieve username from customBlocks array
  - Style tooltip with semi-transparent background
  - _Requirements: 5.3, 5.4_

- [ ] 26. Add development vs production environment switching

  - Create environment detection utility
  - Implement conditional WebSocket connection (localhost vs Devvit)
  - Add conditional username source (random vs Devvit context)
  - Ensure same API interface for both environments
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ]\* 27. Write integration tests

  - Test complete connection flow from client to server
  - Test block modifications persist and sync across clients
  - Test player positions sync across clients
  - Test multiple clients can play simultaneously
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]\* 28. Perform performance testing and optimization
  - Test server handles 100+ concurrent clients
  - Measure block modification broadcast latency
  - Measure position update broadcast rate
  - Test Redis query performance with large chunk data
  - Optimize message sizes if needed
  - _Requirements: 11.1, 11.2, 11.5_

## Notes

- All tasks build incrementally - each task integrates with previous work
- **Task 4 integrates MultiplayerManager early** to enable continuous integration rather than a "big bang" at the end
- **Task 1 is broken into sub-tasks** (1.1-1.3 and 1b.1-1b.3) for better tracking and estimation
- Client-side optimizations (InstancedMesh, chunking, Web Workers) are preserved throughout
- Testing tasks are marked as optional (\*) to focus on core functionality first
- **IMPORTANT:** Tests for Phase 2 (Block Synchronization) and Phase 4 (Reconnection) are highly recommended before proceeding, as bugs in these systems are extremely difficult to debug later
- Server uses Redis pub/sub for broadcasting (implementation detail, not exposed in requirements)
- All messages use structured JSON as required by Devvit realtime API
