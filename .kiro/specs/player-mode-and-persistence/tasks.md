# Implementation Plan

## Overview

This implementation plan breaks down the player mode and persistence feature into discrete, manageable tasks. Each task builds incrementally on previous work and focuses on implementing specific functionality that can be tested independently.

## Task List

- [x] 1. Server-Side Redis Data Structures and Player Persistence

- [x] 1.1 Create Redis helper functions for player data management

  - Implement `getOrCreatePlayerData()` function that initializes/loads player data with score, friends, and friendedBy fields
  - Implement `updatePlayerScore()` function for atomic score increments
  - Implement `addPlayerFriend()` and `removePlayerFriend()` functions that update both players' records
  - Add Redis sorted set operations for leaderboard support
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 1.2 Implement active players tracking in Redis

  - Add Redis set operations for `players:${level}` to track active players
  - Implement `isPlayerActive()` check function
  - Implement `addActivePlayer()` and `removeActivePlayer()` functions
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 1.3 Update `/api/connect` endpoint for player mode detection

  - Check if username exists in `players:${level}` set
  - Return mode="viewer" if player is already active
  - Return mode="player" with full player data (score, friends, friendedBy) if not active
  - Add player to active players set only in player mode
  - Do NOT add viewers to connectedClients map
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 13.6, 13.7_

- [x] 1.4 Update `/api/disconnect` endpoint for cleanup

  - Remove player from `players:${level}` Redis set
  - Remove player from connectedClients map
  - Update lastActive timestamp in player data
  - _Requirements: 2.5_

- [x] 1.5 Implement inactivity cleanup for player persistence

  - Enhance existing `cleanupInactivePlayers()` function to remove from Redis set
  - Update lastActive timestamp when removing inactive players
  - Run cleanup every 10 seconds (existing interval)
  - _Requirements: 2.5, 11.4_

- [x] 2. Server-Side Friend Management Endpoints

- [x] 2.1 Create `/api/friends/add` endpoint with async processing

  - Implement fire-and-forget response pattern
  - Create `processFriendAddition()` async function
  - Create minimal player data for friend if they don't exist yet in Redis
  - Update player's friends list in Redis
  - Update friend's friendedBy list in Redis (CRITICAL)
  - Broadcast friendship-update message to friend if online
  - Implement `broadcastFriendshipError()` for validation failures (only for self-friend attempts)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 18.1, 18.2_

- [x] 2.2 Create `/api/friends/remove` endpoint with async processing

  - Implement fire-and-forget response pattern
  - Create `processFriendRemoval()` async function
  - Update player's friends list in Redis
  - Update friend's friendedBy list in Redis (CRITICAL)
  - Broadcast friendship-update message to friend if online
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 3. Server-Side Upvote System

- [x] 3.1 Create `/api/upvote` endpoint with async processing

  - Implement fire-and-forget response pattern
  - Create `processUpvote()` async function
  - Increment builder's score in Redis using hIncrBy
  - Update scores sorted set using zIncrBy
  - Increment totalUpvotesReceived and totalUpvotesGiven counters
  - Broadcast score-update message to all clients in level
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [ ]\* 3.2 Create `/api/leaderboard` endpoint for future extension

  - Implement endpoint to query top players by score
  - Use Redis zRangeWithScores for efficient retrieval
  - Return ranked list of players with scores
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

- [x] 4. Client-Side Player Mode Manager

- [x] 4.1 Create PlayerModeManager class with mode state

  - Implement mode property ("player" | "viewer")
  - Implement username, level, score, friends, and friendedBy properties
  - Implement initialize() method to set mode from connection response
  - Implement isPlayerMode() and isViewerMode() helper methods
  - Display viewer mode notification when entering viewer mode
  - _Requirements: 3.1, 3.2, 14.1, 14.2, 14.4, 14.5_

- [x] 4.2 Implement block modification permission checks

  - Implement canModifyBlocks() method that checks mode
  - Implement canRemoveBlock() method that checks block ownership and friendedBy list
  - Return detailed reason messages for denied removals
  - _Requirements: 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 14.2_

- [x] 4.3 Implement position update control

  - Implement shouldSendPositionUpdates() method that returns false for viewers
  - _Requirements: 13.4, 14.3_

- [x] 4.4 Implement friend management with optimistic updates

  - Implement addFriend() method with immediate local update
  - Implement removeFriend() method with immediate local update
  - Send fire-and-forget requests to server
  - Implement revertFriendAddition() for server rejections
  - Implement updateFriendedBy() for broadcast updates
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 4.5 Implement score tracking and updates

  - Implement getScore() method
  - Implement updateScore() method for broadcast updates
  - _Requirements: 15.1, 15.2, 15.3_

- [x] 5. Client-Side Builder Recognition Manager

- [x] 5.1 Create BuilderRecognitionManager class

  - Implement currentBuilders array to track builders in view
  - Implement highlightedBuilder property
  - Accept terrain and playerModeManager dependencies in constructor
  - _Requirements: 7.1, 7.2, 8.1_

- [x] 5.2 Implement builder list calculation

  - Implement updateBuilders() method that extracts usernames from customBlocks
  - Filter out current player's username
  - Count blocks per builder
  - Sort by block count and take top 10
  - Clear highlights if highlighted builder is no longer in list
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 5.3 Implement block highlighting for builders

  - Implement toggleBuilderHighlight() method
  - Implement highlightBuilder() private method that finds all blocks by username
  - Integrate with existing highlight system (highlight.ts)
  - Use distinct color for builder highlights (cyan/0x00ffff)
  - Implement clearHighlight() method
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 5.4 Implement builder list UI rendering

  - Implement renderBuildersUI() method (integrate with actual UI system)
  - Display builders on right side of screen
  - Make builder names clickable
  - Update UI when builders list changes
  - _Requirements: 7.3, 7.4_

-

- [x] 6. Client-Side Upvote Manager

- [x] 6.1 Create UpvoteManager class with rate limiting

  - Implement COOLDOWN_MS (60000) and MAX_UPVOTES_PER_DAY (5) constants
  - Implement level and playerModeManager dependencies
  - Implement localStorage-based upvote record tracking
  - _Requirements: 10.1, 10.2_

- [x] 6.2 Implement upvote validation

  - Implement canUpvote() method that checks self-upvote, viewer mode, cooldown, and daily limit
  - Return detailed reason messages for denied upvotes
  - Implement getRemainingCooldown() helper method
  - Implement getRemainingUpvotes() helper method
  - _Requirements: 10.3, 10.4, 10.5_

- [x] 6.3 Implement optimistic upvote submission

  - Implement upvote() method with immediate localStorage recording
  - Calculate optimistic score (current + 1)
  - Send fire-and-forget request to server
  - Return success with optimistic score
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 6.4 Implement upvote record management

  - Implement getUpvoteRecords() private method
  - Implement recordUpvote() private method
  - Clean up old records (older than 1 day) when recording new upvotes
  - _Requirements: 10.1, 10.2_

- [x] 7. Integration with Existing Multiplayer Manager

- [x] 7.1 Integrate PlayerModeManager into MultiplayerManager

  - Add playerModeManager property to MultiplayerManager
  - Initialize in constructor
  - Call initialize() in connect() method with connection response
  - _Requirements: 14.1, 14.4_

- [x] 7.2 Integrate BuilderRecognitionManager into MultiplayerManager

  - Add builderRecognitionManager property
  - Initialize in constructor with terrain and playerModeManager
  - Call updateBuilders() when chunks are loaded/updated
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 7.3 Integrate UpvoteManager into MultiplayerManager

  - Add upvoteManager property
  - Initialize in constructor with level and playerModeManager
  - Recreate with correct level in connect() method
  - _Requirements: 9.1, 9.2_

- [x] 7.4 Update sendPositionUpdate() to check player mode

  - Add mode check at beginning of method
  - Return early if shouldSendPositionUpdates() is false
  - _Requirements: 11.1, 13.4, 14.3_

- [x] 7.5 Update sendBlockModification() to check permissions

  - Add canModifyBlocks() check at beginning
  - For removals, add canRemoveBlock() check with block lookup
  - Display UI message when removal is denied
  - _Requirements: 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 14.2_

- [x] 7.6 Add message handler for new broadcast types

  - Handle "friendship-update" messages to update friendedBy list
  - Handle "friendship-error" messages to revert optimistic updates
  - Handle "score-update" messages to update builder scores
  - _Requirements: 6.5, 6.6, 9.5, 9.6_

- [x] 7.7 Add getter methods for UI access

  - Implement getPlayerModeManager() method
  - Implement getBuilderRecognitionManager() method
  - Implement getUpvoteManager() method
  - _Requirements: 14.4_

- [x] 7.8 Update connect() to handle viewer mode properly

  - Do NOT create player entities for self in any mode
  - Subscribe to regional channels in both modes
  - Only sync offline modifications in player mode
  - _Requirements: 13.1, 13.2, 13.3, 13.5_

- [x] 8. UI Components for Player Mode Features

- [x] 8.1 Create builders list UI component

  - Display on right side of screen
  - Show builder usernames with block counts
  - Add upvote icon next to each builder
  - Make names clickable for highlighting
  - Show cooldown/limit messages when upvote is denied
  - _Requirements: 7.3, 7.4, 9.1_

- [x] 8.2 Create player score display

  - Display current player's score in UI
  - Update when score changes
  - Format large numbers with separators
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 8.3 Create friends list UI component

  - Display current friends list
  - Add button to add new friend
  - Add button to remove friend
  - Show success/error messages
  - _Requirements: 6.1, 17.1, 17.2_

- [x] 8.4 Create viewer mode notification

  - Display prominent message when in viewer mode
  - Explain why user is in viewer mode
  - Show that modifications are disabled
  - _Requirements: 3.1, 3.2_

- [x] 8.5 Update block removal feedback

  - Show message when block removal is denied
  - Explain ownership and friend requirements
  - _Requirements: 5.6, 5.7_

- [ ] 9. Testing and Validation
- [ ] 9.1 Test player mode detection and viewer mode

  - Connect from same username twice
  - Verify second connection enters viewer mode
  - Verify viewer cannot modify blocks
  - Verify viewer is invisible to other players
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

- [ ] 9.2 Test friend management and block removal permissions

  - Add friend and verify both records updated
  - Verify friend can immediately remove blocks (real-time update)
  - Remove friend and verify permissions revoked immediately
  - Verify cannot remove non-friend's blocks
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 9.3 Test upvote system and rate limiting

  - Upvote builder and verify score increments
  - Verify cooldown prevents rapid upvotes
  - Verify daily limit enforced
  - Verify cannot upvote self
  - Verify score updates broadcast to all clients
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 9.4 Test builder recognition and highlighting

  - Verify builders list updates when moving to new region
  - Verify clicking builder name highlights their blocks
  - Verify highlights clear when moving regions
  - Verify top 10 builders shown
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 9.5 Test inactivity cleanup

  - Verify player removed from active set after 2 minutes
  - Verify player can reconnect in player mode after cleanup
  - _Requirements: 2.5, 11.4_

- [ ] 9.6 Test optimistic updates and corrections
  - Verify friend additions feel instant
  - Verify upvotes feel instant
  - Test server rejection scenarios
  - Verify corrections applied via broadcasts
  - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 9.2, 9.3, 9.4, 9.5, 9.6_

## Implementation Notes

- Each task should be implemented and tested independently before moving to the next
- The implementation follows the optimistic update pattern for maximum perceived performance
- All Redis operations are asynchronous and non-blocking
- Real-time updates via broadcasts ensure instant collaboration
- Client-side validation using friendedBy list eliminates server round-trips for block removal
