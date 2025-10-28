# Implementation Plan

- [x] 1. Update Redis data structures for global friendships

- [x] 1.1 Remove `friends` and `friendedBy` fields from per-level player hash creation

  - Modify `getOrCreatePlayerData()` function in `src/server/index.ts`
  - Remove friends and friendedBy from initial data structure
  - Remove from Redis HSET operations
  - _Requirements: 2.3_

- [x] 1.2 Add `lastJoined` and `lastKnownPosition` fields to player hash

  - Add `lastJoined` field set to current timestamp on player creation
  - Add `lastKnownPosition` field initialized to null or default spawn
  - Update TypeScript interfaces for PlayerData
  - _Requirements: 2.2, 2.4, 2.6_

- [x] 1.3 Create global friendship management functions

  - Implement `getPlayerFriends(username)` using `HGET friends {username}`
  - Implement `getPlayerFriendedBy(username)` using `HGET friendedBy {username}`
  - Implement `addGlobalFriend(username, friendUsername)` updating both hashes
  - Implement `removeGlobalFriend(username, friendUsername)` updating both hashes
  - Handle JSON parsing and array manipulation
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Implement friendship broadcast discovery system

- [x] 2.1 Create function to find active levels for a user

  - Use `KEYS player:{username}:*` to find all level keys
  - Parse level names from key patterns
  - Retrieve `lastJoined` field from each level hash
  - Filter levels where `lastJoined` is within 2 hours (7200000ms)
  - Return array of {level, position} objects
  - _Requirements: 1.6, 1.7, 7.1, 7.2, 7.3_

- [x] 2.2 Create function to broadcast friendship updates

  - Accept parameters: friendUsername, action ('added'|'removed'), byUsername
  - Call findActiveLevels() to get active levels
  - For each active level, retrieve `lastKnownPosition`
  - Calculate regional channel from position
  - Broadcast friendship message to regional channel
  - _Requirements: 1.7, 1.8, 1.9, 7.4, 7.5, 7.6, 7.7, 7.8_

- [x] 2.3 Define friendship broadcast message interfaces

  - Create TypeScript interface for friendship-added message
  - Create TypeScript interface for friendship-removed message
  - Include type, targetUsername, byUsername, message fields
  - _Requirements: 1.8, 1.9_

- [x] 3. Update friendship API endpoints (server-side)

- [x] 3.1 Modify `/api/friends/add` endpoint

  - Replace per-level friendship updates with global hash updates
  - Call `addGlobalFriend()` function
  - Call `broadcastFriendshipUpdate()` after successful add
  - Return updated friends list from global hash
  - Update response TypeScript interface
  - _Requirements: 1.4, 1.6, 1.7_

- [x] 3.2 Modify `/api/friends/remove` endpoint

  - Replace per-level friendship updates with global hash updates
  - Call `removeGlobalFriend()` function
  - Call `broadcastFriendshipUpdate()` after successful remove
  - Return updated friends list from global hash
  - Update response TypeScript interface
  - _Requirements: 1.5, 1.6, 1.7_

- [x] 3.3 Verify client handles updated friendship API responses

  - Ensure PlayerModeManager.addFriend() correctly processes response with global friends list
  - Ensure PlayerModeManager.removeFriend() correctly processes response with global friends list
  - Remove any level-specific logic from client-side friendship methods
  - _Requirements: 1.4, 1.5_

- [x] 4. Implement smart spawn position calculator

- [x] 4.1 Create spiral offset pattern array

  - Define 25 position offsets in spiral pattern
  - Start from center (0,0), expand outward
  - Keep all positions within 360 blocks (one region)
  - _Requirements: 4.1, 4.5_

- [x] 4.2 Implement position occupation checker

  - Accept candidate position, connectedClients map, level, radius
  - Iterate through connected clients in the same level
  - Check if any player is within radius (default 5 blocks)
  - Return true if occupied, false if available
  - _Requirements: 4.2_

- [x] 4.3 Implement spawn position calculator

  - Accept level, connectedClients, optional lastKnownPosition
  - If lastKnownPosition exists, return it immediately
  - Otherwise, try each spiral offset position
  - Return first unoccupied position
  - Fallback to default spawn if all occupied
  - _Requirements: 4.1, 4.3, 4.4, 4.6_

- [x] 5. Update connection endpoint for spawn logic (server-side)

- [x] 5.1 Load global friendship data on connect

  - Call `getPlayerFriends(username)` to load friends list
  - Call `getPlayerFriendedBy(username)` to load friendedBy list
  - Include both arrays in playerData response
  - Update ConnectResponse TypeScript interface
  - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [x] 5.2 Implement lastJoined tracking

  - On player connection, check if player hash exists
  - If new player, set lastJoined to current timestamp
  - If existing player, update lastJoined to current timestamp
  - _Requirements: 2.4, 2.5_

- [x] 5.3 Integrate smart spawn position logic

  - Retrieve lastKnownPosition from player hash if exists
  - Call calculateSpawnPosition() with lastKnownPosition
  - Use returned position as spawnPosition in response
  - _Requirements: 3.5, 4.6_

- [x] 5.4 Update client to handle new connection response

  - Update client-side ConnectResponse interface to include friends and friendedBy in playerData
  - Verify LoadingManager passes connection data correctly to game initialization
  - Ensure PlayerModeManager.initialize() receives and stores friends and friendedBy arrays
  - Test that spawnPosition from server is used correctly in game initialization
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 6. Implement position persistence on disconnect

- [x] 6.1 Update `/api/disconnect` endpoint

  - Retrieve player's current position from connectedClients map
  - Serialize position to JSON string
  - Store in `lastKnownPosition` field of player hash
  - _Requirements: 3.2, 3.4_

- [x] 6.2 Update inactivity cleanup function

  - In `cleanupInactivePlayers()`, before removing player
  - Retrieve player's last position from connectedClients map
  - Serialize position to JSON string
  - Store in `lastKnownPosition` field of player hash
  - _Requirements: 3.3, 3.4_

- [x] 7. Update client-side friendship handling

- [x] 7.1 Update PlayerModeManager to handle friendship broadcasts

  - Add method `handleFriendshipBroadcast(data)` to PlayerModeManager
  - Check if targetUsername matches current player
  - For friendship-added: add byUsername to friendedBy array
  - For friendship-removed: remove byUsername from friendedBy array
  - Add TypeScript interfaces for friendship broadcast messages
  - _Requirements: 1.10, 6.3, 6.4_

- [x] 7.2 Wire friendship broadcasts to MultiplayerManager

  - In MultiplayerManager.handleMessage(), detect friendship-added and friendship-removed message types
  - Call playerModeManager.handleFriendshipBroadcast() with message data
  - Add console logging for debugging friendship broadcasts
  - _Requirements: 1.10_

- [x] 7.3 Update block removal permission checks

  - Ensure canRemoveBlock() in PlayerModeManager uses friendedBy array
  - Verify permissions work with global friendship data
  - Test that adding/removing friends updates permissions in real-time
  - _Requirements: 6.2, 6.5_

- [x] 7.4 Update friend management UI interactions

  - Verify addFriend() and removeFriend() methods in PlayerModeManager work with new API responses
  - Ensure friends list updates correctly after add/remove operations
  - Test that optimistic updates still work with global friendship storage
  - _Requirements: 1.4, 1.5_

- [x] 8. Update architecture documentation

- [x] 8.1 Update Core Data Structures section

  - Document global friendship hashes (friends, friendedBy)
  - Remove friends/friendedBy from per-level player hash documentation
  - Add lastJoined and lastKnownPosition fields to player hash
  - Include Redis key patterns and data formats
  - _Requirements: 8.1, 8.2, 8.5_

- [x] 8.2 Update HTTP Endpoints section

  - Document /api/connect changes (global friendship data, smart spawn)
  - Document /api/friends/add changes (global hash updates, broadcasts)
  - Document /api/friends/remove changes (global hash updates, broadcasts)
  - _Requirements: 8.1, 8.3_

- [x] 8.3 Update WebSocket Broadcasts section

  - Add friendship-added broadcast message format
  - Add friendship-removed broadcast message format
  - Document broadcast discovery mechanism
  - _Requirements: 8.1, 8.6_

- [x] 8.4 Update Key Design Decisions section

  - Add rationale for global vs per-level friendship storage
  - Add rationale for position persistence strategy (only on disconnect)
  - Add rationale for smart spawn position algorithm
  - _Requirements: 8.1, 8.3, 8.4_
