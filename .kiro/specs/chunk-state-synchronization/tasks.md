# Implementation Plan

This implementation plan breaks down the chunk state synchronization feature into discrete, actionable coding tasks. Each task builds incrementally on previous work, following a phased approach: server infrastructure → client state manager → initial load → incremental load → modification flow → offline resilience → optimization.

## Phase 1: Server-Side Infrastructure

- [x] 1. Implement regional channel helpers

  - [x] 1.1 Create regional channel calculation functions

    - Define REGION_SIZE constant (5 chunks)
    - Implement getRegionCoordinates(chunkX, chunkZ) returning regionX, regionZ
    - Implement getRegionalChannel(level, chunkX, chunkZ) returning channel string
    - Add unit tests for region calculation with various chunk coordinates
    - _Requirements: 7.1_

- [x] 2. Implement HTTP modification endpoint

  - [x] 2.1 Create Express POST /api/modifications endpoint

    - Define ModificationBatchRequest and ModificationBatchResponse interfaces
    - Accept batch array with individual timestamps
    - Extract username and level from request body
    - Log batch size and username
    - _Requirements: 4.1, 4.3, 6.1_

  - [x] 2.2 Implement validateModification function

    - Check position is within world bounds (±10000 chunks, y: 0-255)
    - Query Redis for existing block at position
    - For "place": reject if block exists
    - For "remove": reject if block doesn't exist
    - Return boolean validation result
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 2.3 Implement sequential validation loop

    - Iterate through modifications array
    - Call validateModification for each
    - If validation fails, set failedAt index and break
    - Collect validated modifications in array
    - _Requirements: 6.1, 6.5_

  - [x] 2.4 Implement immediate regional broadcasting

    - For each validated modification, add server timestamp
    - Calculate regional channel from block position
    - Broadcast modification via realtime.send to regional channel
    - Log broadcast to regional channel
    - _Requirements: 7.4, 9.1, 9.2_

  - [x] 2.5 Implement batch persistence to Redis

    - Create persistModificationBatch function
    - Use Redis pipeline for batch operations
    - For "place": HSET with block data
    - For "remove": HDEL block key
    - Execute pipeline and log result
    - _Requirements: 3.3, 3.4, 9.3, 9.4_

  - [x] 2.6 Send response to client

    - Return { ok: true, failedAt: null } if all validated

    - Return { ok: false, failedAt: index } if validation failed
    - Include descriptive message
    - _Requirements: 6.5_

- [x] 3. Implement HTTP chunk state endpoint

  - [x] 3.1 Create Express POST /api/chunk-state endpoint

    - Define ChunkStateRequest and ChunkStateResponse interfaces
    - Accept array of chunk coordinates
    - Extract username and level from request body
    - Validate chunk coordinates are within bounds
    - Log request with chunk count
    - _Requirements: 2.4, 11.5_

  - [x] 3.2 Implement Redis pipelining for batch fetch

    - Create Redis pipeline
    - Add HGETALL for each chunk
    - Execute pipeline and collect results
    - Parse chunk data for each result
    - Handle empty chunks (return empty block array)
    - _Requirements: 3.5, 10.3, 11.1_

  - [x] 3.3 Send chunk state response

    - Create response with chunks array
    - Include request and response timestamps
    - Send JSON response
    - Log response time and chunk count
    - _Requirements: 2.4, 12.5_

- [x] 4. Enhance connection handler for initial chunks

  - [x] 4.1 Implement calculateInitialChunks function

    - Accept spawn position and draw distance
    - Calculate state buffer as 2x draw distance
    - Calculate spawn chunk coordinates
    - Loop from spawnChunk - buffer to spawnChunk + buffer
    - Return array of chunk coordinates
    - _Requirements: 1.1, 10.2_

  - [x] 4.2 Modify connection handler to send initial chunks

    - Call calculateInitialChunks with spawn (0, 20, 0) and draw distance 3
    - Use Redis pipelining to fetch all chunks
    - Parse chunk data for each chunk
    - Include initialChunks array in ConnectedMessage
    - Log number of chunks and total blocks being sent
    - _Requirements: 1.1, 1.2, 10.1, 10.3_

- [x] 5. Write server-side tests

  - Test getRegionCoordinates with various chunk positions
  - Test getRegionalChannel generates correct channel names
  - Test calculateInitialChunks returns correct chunk count
  - Test validateModification rejects invalid placements/removals
  - Test modification batch validation stops at first failure
  - Test Redis pipelining fetches multiple chunks correctly
  - _Requirements: 3.5, 6.1, 6.5, 7.1_

## Phase 2: Client-Side State Manager

- [x] 6. Create ChunkStateManager class skeleton

  - [x] 6.1 Create new file src/client/chunkStateManager.ts

    - Define LoadedChunk and PendingModification interfaces
    - Create ChunkStateManager class
    - Add private properties: loadedChunks Map, subscribedRegions Set, pendingRequests Set
    - Add modification batching properties: pendingBatch array, batchTimer
    - Add configuration constants: DEBOUNCE_INTERVAL (1000ms), MAX_BATCH_SIZE (100), REGION_SIZE (5)
    - Add constructor accepting drawDistance parameter
    - Calculate stateBuffer as 2x drawDistance
    - _Requirements: 4.1, 4.2, 8.1, 8.2, 15.1, 15.2_

- [x] 7. Implement chunk key and region helpers

  - [x] 7.1 Implement key generation methods

    - Implement getChunkKey(chunkX, chunkZ) returning "${chunkX}_${chunkZ}"
    - Implement getRegionKey(regionX, regionZ) returning "${regionX}_${regionZ}"
    - _Requirements: 8.2_

  - [x] 7.2 Implement region coordinate calculation

    - Implement getRegionCoordinates(chunkX, chunkZ) method
    - Calculate regionX as Math.floor(chunkX / REGION_SIZE)
    - Calculate regionZ as Math.floor(chunkZ / REGION_SIZE)
    - Return { regionX, regionZ }
    - _Requirements: 7.1_

  - [x] 7.3 Implement regional channel helper

    - Implement getRegionalChannel(chunkX, chunkZ) method
    - Call getRegionCoordinates to get region
    - Return "region:${level}:${regionX}:${regionZ}"
    - _Requirements: 7.1, 7.4_

- [x] 8. Implement chunk loading methods

  - [x] 8.1 Implement chunk loaded check

    - Implement isChunkLoaded(chunkX, chunkZ) method
    - Check if chunk key exists in loadedChunks Map
    - Return boolean
    - _Requirements: 8.3_

  - [x] 8.2 Implement chunk blocks retrieval

    - Implement getChunkBlocks(chunkX, chunkZ) method
    - Get chunk from loadedChunks Map
    - Return blocks array or null if not found
    - _Requirements: 8.3_

  - [x] 8.3 Implement chunk storage

    - Implement storeChunk(chunkX, chunkZ, blocks) method
    - Create LoadedChunk object with timestamp
    - Add to loadedChunks Map
    - Remove from pendingRequests Set
    - Log chunk loaded with block count
    - _Requirements: 1.3, 8.2_

  - [x] 8.4 Implement required chunks calculation

    - Implement getRequiredChunks(playerChunkX, playerChunkZ) method
    - Loop from playerChunk - stateBuffer to playerChunk + stateBuffer
    - Return array of all chunk coordinates in range
    - _Requirements: 2.1_

  - [x] 8.5 Implement missing chunks detection

    - Implement getMissingChunks(requiredChunks) method
    - Filter requiredChunks to exclude loaded and pending
    - Return array of chunks that need loading
    - _Requirements: 2.5_

  - [x] 8.6 Implement pending request tracking

    - Implement markPending(chunks) method
    - Add chunk keys to pendingRequests Set
    - _Requirements: 2.3_

  - [x] 8.7 Implement distant chunk unloading

    - Implement unloadDistantChunks(playerChunkX, playerChunkZ) method
    - Calculate unload distance as 3x drawDistance
    - Iterate through loadedChunks and identify distant chunks
    - Remove distant chunks from Map
    - Log unloaded chunks
    - _Requirements: 13.5_

- [x] 9. Implement regional subscription management

  - [x] 9.1 Implement required regions calculation

    - Implement getRequiredRegions(playerChunkX, playerChunkZ) method
    - Get required chunks from getRequiredChunks
    - For each chunk, calculate region coordinates
    - Use Set to deduplicate regions
    - Return array of unique region coordinates
    - _Requirements: 7.2_

  - [x] 9.2 Implement subscription updates

    - Implement updateSubscriptions(playerChunkX, playerChunkZ) method
    - Get required regions
    - Identify regions to unsubscribe (in subscribedRegions but not required)
    - Send unsubscribe message for each via WebSocket
    - Remove from subscribedRegions Set
    - Identify regions to subscribe (required but not in subscribedRegions)
    - Send subscribe message for each via WebSocket
    - Add to subscribedRegions Set
    - Log subscription changes
    - _Requirements: 7.2, 7.3, 8.4, 12.2_

-

- [x] 10. Implement modification batching

  - [x] 10.1 Implement addModification method

    - Accept position, blockType, action parameters
    - Create PendingModification object with client timestamp
    - Add to pendingBatch array
    - Log batch size
    - If batch size >= MAX_BATCH_SIZE, call flushBatch immediately
    - Otherwise, clear existing batchTimer and set new timer for DEBOUNCE_INTERVAL
    - _Requirements: 4.1, 4.2, 4.3, 15.3_

  - [x] 10.2 Implement flushBatch method

    - Clear batchTimer if exists
    - Return early if pendingBatch is empty
    - Copy pendingBatch and clear it
    - Log batch size being flushed
    - Send HTTP POST to /api/modifications with batch
    - Handle response: log success or validation failure
    - On network error, call storeOfflineBatch
    - _Requirements: 4.2, 4.4, 5.4, 11.4, 12.3_

- [x] 11. Implement offline persistence

  - [x] 11.1 Implement storeOfflineBatch method

    - Get existing offline batches from localStorage
    - Append new batch to existing
    - Store in localStorage with key "offline*mods*${level}"
    - Log number of modifications stored offline
    - _Requirements: 5.1, 5.2_

  - [x] 11.2 Implement getOfflineBatches method

    - Get item from localStorage with key "offline*mods*${level}"
    - Parse JSON or return empty array if not found
    - _Requirements: 5.1_

  - [x] 11.3 Implement syncOfflineModifications method

    - Get offline batches from localStorage
    - Return early if empty
    - Log number of offline modifications being synced
    - Send HTTP POST to /api/modifications with offline batch
    - If response ok: clear localStorage
    - If response not ok: keep failed modifications in localStorage (slice from failedAt)
    - Log sync result
    - _Requirements: 5.3, 5.4, 5.5_

- [x] 12. Implement lifecycle methods

  - [x] 12.1 Implement setConnection method

    - Accept connection, username, level parameters
    - Store in private properties
    - _Requirements: 8.1_

  - [x] 12.2 Implement clear method

    - Clear all Maps and Sets
    - Clear pendingBatch array
    - Clear batchTimer if exists
    - Log state cleared
    - _Requirements: 11.3_

- [x] 13. Write ChunkStateManager tests

  - Test getChunkKey generates consistent keys
  - Test getRegionCoordinates calculates correct regions
  - Test getRequiredChunks calculates correct range
  - Test getMissingChunks filters correctly
  - Test addModification batches correctly
  - Test flushBatch sends after debounce interval
  - Test flushBatch sends immediately when batch full
  - Test offline storage and retrieval
  - _Requirements: 4.1, 4.2, 5.1, 7.1, 8.2_

## Phase 3: Initial Load Integration

- [x] 14. Integrate ChunkStateManager into MultiplayerManager

  - [x] 14.1 Add ChunkStateManager to MultiplayerManager

    - Import ChunkStateManager class
    - Add private chunkStateManager property
    - Initialize in constructor with terrain.distance
    - _Requirements: 8.1_

  - [x] 14.2 Create loadChunkState helper method

    - Accept ChunkStateData parameter
    - Create Block objects from blockData array
    - Add blocks to terrain.customBlocks array
    - Call chunkStateManager.storeChunk with blocks
    - Log number of blocks loaded
    - _Requirements: 1.3, 1.4_

  - [x] 14.3 Modify handleConnected to process initial chunks

    - Set connection in chunkStateManager with username and level
    - Check if data.initialChunks exists and has length > 0
    - Log number of initial chunks received
    - Loop through initialChunks array
    - Call loadChunkState for each chunk
    - Call terrain.generate() after all chunks loaded
    - _Requirements: 1.3, 1.5_

  - [x] 14.4 Subscribe to initial regional channels

    - Calculate spawn chunk coordinates from spawn position
    - Call chunkStateManager.updateSubscriptions with spawn chunk
    - _Requirements: 7.2, 7.3_

  - [x] 14.5 Sync offline modifications on connect

    - Call chunkStateManager.syncOfflineModifications after initial load
    - _Requirements: 5.3_

  - [x] 14.6 Update disconnect method

    - Call chunkStateManager.flushBatch before disconnect
    - Call chunkStateManager.clear in disconnect method
    - _Requirements: 11.3_

- [ ] 15. Test initial load flow

  - [x] 15.1 Manual test: Connect and verify initial chunks load

    - Start server and client
    - Place some blocks in spawn area
    - Disconnect and reconnect
    - Verify blocks are visible on reconnect
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 15.2 Manual test: Verify regional subscriptions

    - Connect client
    - Check console for subscription messages
    - Verify ~9 regional channels subscribed
    - _Requirements: 7.2, 7.3_

  - [ ]\* 15.3 Write integration test for initial load
    - Test client receives initialChunks in connected message
    - Test customBlocks array is populated
    - Test terrain.generate() is called after loading
    - Test regional subscriptions are created
    - _Requirements: 1.1, 1.3, 1.5, 7.2_

## Phase 4: Incremental Load Integration

- [ ] 16. Implement chunk state request from client

  - [ ] 16.1 Add chunk request tracking properties

    - Add currentChunk property { x: number, z: number }
    - Add lastChunkCheckTime property (number)
    - Add chunkCheckInterval property (200ms)
    - Add maxConcurrentRequests property (5)
    - Add activeRequests counter (number)
    - _Requirements: 13.3, 13.4_

  - [ ] 16.2 Implement requestChunkStates method

    - Accept array of chunk coordinates
    - Check if activeRequests < maxConcurrentRequests
    - Sort chunks by distance from player (closest first)
    - Take only what can be handled concurrently
    - Call chunkStateManager.markPending
    - Increment activeRequests counter
    - Send HTTP POST to /api/chunk-state
    - Handle response by calling handleChunkStateResponse
    - Handle errors and decrement activeRequests
    - Log number of chunks requested
    - _Requirements: 2.3, 13.2, 13.3_

  - [ ] 16.3 Implement handleChunkStateResponse method
    - Decrement activeRequests counter
    - Log number of chunks received
    - Loop through chunks in response
    - Call loadChunkState for each chunk
    - Call terrain.generate() after all chunks processed
    - _Requirements: 2.4_

- [ ] 17. Implement position monitoring and chunk loading

  - [ ] 17.1 Implement checkAndLoadChunks method

    - Calculate player chunk coordinates from camera position
    - Update currentChunk property
    - Call chunkStateManager.getRequiredChunks
    - Call chunkStateManager.getMissingChunks
    - If missing chunks exist, call requestChunkStates
    - Call chunkStateManager.updateSubscriptions
    - Call chunkStateManager.unloadDistantChunks
    - _Requirements: 2.1, 2.2, 2.3, 7.3, 13.5_

  - [ ] 17.2 Add position monitoring to update method
    - Check if chunkCheckInterval has elapsed since lastChunkCheckTime
    - If elapsed, update lastChunkCheckTime and call checkAndLoadChunks
    - _Requirements: 13.4_

- [ ] 18. Test incremental load flow

  - [ ] 18.1 Manual test: Move player and verify chunks load

    - Connect client
    - Move player several chunks away from spawn
    - Verify new chunks are requested in console
    - Verify chunks load and blocks appear
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 18.2 Manual test: Verify subscription updates

    - Move player to new region
    - Check console for unsubscribe/subscribe messages
    - Verify old regions unsubscribed, new regions subscribed
    - _Requirements: 7.2, 7.3_

  - [ ] 18.3 Manual test: Verify chunk unloading

    - Move player far from spawn
    - Check console for unload messages
    - Verify memory doesn't grow unbounded
    - _Requirements: 13.5_

  - [ ]\* 18.4 Write integration test for incremental loading
    - Test player movement triggers chunk requests
    - Test missing chunks are identified correctly
    - Test chunks are requested in priority order
    - Test regional subscriptions update
    - Test distant chunks are unloaded
    - _Requirements: 2.1, 2.2, 2.3, 7.3, 13.2, 13.5_

## Phase 5: Modification Flow Integration

- [ ] 19. Integrate optimistic updates with batching

  - [ ] 19.1 Modify Control class to use batched modifications

    - In mousedownHandler, keep existing optimistic visual update
    - Replace direct multiplayer.sendBlockModification with chunkStateManager.addModification
    - Ensure modification is added to customBlocks immediately
    - _Requirements: 14.1, 14.2, 14.3_

  - [ ] 19.2 Update sendBlockModification in MultiplayerManager

    - Change to call chunkStateManager.addModification
    - Remove direct WebSocket send
    - _Requirements: 4.1, 4.2_

  - [ ] 19.3 Update handleBlockModification for regional broadcasts
    - Verify modification is from regional pub/sub (not WebSocket)
    - Check if chunk is loaded before applying
    - If chunk not loaded, ignore modification (don't queue)
    - If chunk loaded and not from self, apply modification
    - _Requirements: 7.5, 11.2_

- [ ] 20. Test modification flow

  - [ ] 20.1 Manual test: Optimistic updates feel instant

    - Connect client
    - Place blocks rapidly
    - Verify blocks appear immediately
    - Check console for batch messages after 1 second
    - _Requirements: 14.1, 14.2_

  - [ ] 20.2 Manual test: Batching works correctly

    - Place 5 blocks slowly (over 2 seconds)
    - Verify single batch sent after 1 second
    - Place 100+ blocks rapidly
    - Verify batch sent immediately at 100
    - _Requirements: 4.2, 4.3, 15.3_

  - [ ] 20.3 Manual test: Regional broadcasting

    - Connect two clients in same region
    - Have client A place blocks
    - Verify client B sees blocks in real-time
    - Move client B to different region
    - Have client A place more blocks
    - Verify client B doesn't receive updates
    - _Requirements: 7.4, 7.5_

  - [ ]\* 20.4 Write integration test for modification flow
    - Test optimistic update applies immediately
    - Test modification added to batch
    - Test batch sent after debounce interval
    - Test batch sent immediately when full
    - Test regional broadcast received by other clients
    - _Requirements: 4.1, 4.2, 7.4, 14.1_

## Phase 6: Offline Resilience

- [ ] 21. Test offline modification persistence

  - [ ] 21.1 Manual test: Offline storage

    - Connect client
    - Stop server (simulate disconnect)
    - Place blocks while offline
    - Check localStorage for stored modifications
    - Verify modifications have timestamps
    - _Requirements: 5.1, 5.2_

  - [ ] 21.2 Manual test: Offline sync on reconnect

    - With offline modifications in localStorage
    - Restart server and reconnect client
    - Verify offline modifications sent for validation
    - Verify localStorage cleared on success
    - Check console for sync messages
    - _Requirements: 5.3, 5.4, 5.5_

  - [ ] 21.3 Manual test: Validation failure handling

    - Place blocks offline
    - Manually edit localStorage to create invalid modification
    - Reconnect client
    - Verify validation fails at correct index
    - Verify failed modifications remain in localStorage
    - _Requirements: 5.5, 6.5_

  - [ ]\* 21.4 Write integration test for offline resilience
    - Test modifications stored in localStorage when server unreachable
    - Test offline modifications synced on reconnect
    - Test localStorage cleared on successful sync
    - Test failed modifications remain in localStorage
    - _Requirements: 5.1, 5.3, 5.4, 5.5_

## Phase 7: Error Handling and Optimization

- [ ] 22. Implement error handling

  - [ ] 22.1 Add retry logic for chunk requests

    - Wrap requestChunkStates in try-catch
    - Implement exponential backoff retry (3 attempts)
    - Log failures and retries
    - Show error message to user after all retries fail
    - _Requirements: 11.3_

  - [ ] 22.2 Handle validation failure responses

    - In flushBatch, check if response.ok is false
    - Log validation failure at specific index
    - Request state sync for affected chunks
    - Consider reverting local changes for failed modifications
    - _Requirements: 6.5, 14.5_

  - [ ] 22.3 Add validation for chunk coordinates
    - In requestChunkStates, validate coordinates are within ±10000
    - Log and skip invalid coordinates
    - _Requirements: 11.5_

- [ ] 23. Implement loading indicator

  - [ ] 23.1 Add loading state to MultiplayerManager

    - Add isLoadingInitialState boolean property
    - Set to true when connection starts
    - Set to false when initial chunks are loaded
    - _Requirements: 10.5_

  - [ ] 23.2 Create loading UI component
    - Create simple loading overlay in UI
    - Show "Loading world..." message
    - Hide when isLoadingInitialState becomes false
    - _Requirements: 10.5_

- [ ] 24. Add comprehensive logging

  - [ ] 24.1 Add client-side logging

    - Log chunk requests with coordinates and count
    - Log chunk loads with block count
    - Log regional subscription changes
    - Log modification batches with size and timestamp range
    - _Requirements: 8.4, 12.1, 12.2, 12.3_

  - [ ] 24.2 Add server-side logging
    - Log modification batch validation results
    - Log Redis query performance
    - Log regional broadcasts
    - _Requirements: 12.4, 12.5_

- [ ]\* 25. Performance testing and optimization

  - Measure initial load time with 169 chunks
  - Verify < 1 second for typical world
  - Measure modification batch send and validation time
  - Verify < 200ms for 100-modification batch
  - Measure regional subscription update time
  - Verify < 100ms for 9 regions
  - Monitor memory usage with loaded chunks
  - Verify unloading keeps memory bounded
  - Profile Redis query performance
  - _Requirements: 10.4, 13.1, 13.3_

- [ ]\* 26. Write comprehensive integration tests
  - Test complete flow: connect → load initial → move → load incremental → place blocks → receive updates
  - Test with multiple clients simultaneously
  - Test with large number of blocks (stress test)
  - Test network failure scenarios
  - Test validation failure scenarios
  - Test offline/reconnect scenarios
  - _Requirements: 1.1, 2.1, 4.1, 5.3, 7.4, 11.3_

## Notes

- All tasks build incrementally - each task integrates with previous work
- Testing tasks are marked as optional (\*) to focus on core functionality first
- However, manual tests (15.1, 15.2, 18.1-18.3, 20.1-20.3, 21.1-21.3) are HIGHLY RECOMMENDED before proceeding
- Server-side Redis structure is already correct (chunk-based hashes)
- ChunkStateManager is the core new component with batching, subscriptions, and offline logic
- Regional pub/sub (5x5 chunks) significantly reduces bandwidth vs per-chunk subscriptions
- Debounced batching (1 second default) reduces HTTP requests by 10-100x
- Offline localStorage persistence ensures no work is lost during disconnects
- Configuration constants (DEBOUNCE_INTERVAL, MAX_BATCH_SIZE) allow tuning for different scenarios

## IMPORTANT UPDATE: Task 22.2 Enhancement

Based on review feedback, Task 22.2 should be implemented as follows:

**22.2 Handle validation failure responses (CRITICAL)**

- In flushBatch, store reference to sent batch before clearing pendingBatch
- Check if response.ok is false
- Log validation failure at specific index (failedAt)
- For each failed modification (from failedAt index to end of batch):
  - Identify the modification that failed
  - Perform opposite action locally to revert optimistic update:
    - If original was "place": remove the block from visual representation and customBlocks
    - If original was "remove": re-add the block to visual representation and customBlocks
  - Update InstancedMesh accordingly
- Request full state sync for all affected chunks via requestChunkStates
- Log state reversion details and sync request
- This ensures client state stays synchronized with server's authoritative state
- _Requirements: 6.5, 14.5_

**Why this is critical:** When validation fails, the client's optimistic state is out-of-sync with the server. Without reverting failed changes, the client will show blocks that don't exist on the server, leading to inconsistent gameplay and potential exploits.
