# Requirements Document

## Introduction

This document outlines the requirements for implementing player mode management, persistence, and social features in the multiplayer voxel game. The system must support two distinct player modes (Player and Viewer), persist player data across server starts in Redis, implement friend-based block protection, display builder information with upvoting capabilities, and handle multi-device scenarios where the same user may attempt to join from different devices.

## Glossary

- **Player Mode**: An active gameplay mode where the user can place blocks, remove blocks (with restrictions), and is visible to other players as an avatar
- **Viewer Mode**: A read-only mode where the user can move around, see the world and upvote others but cannot make modifications and is not visible to other players
- **Active Player**: A player currently in Player Mode in a specific level, tracked in Redis with their session information
- **Builder**: A player who has placed custom blocks in a region, displayed in the UI for recognition and upvoting
- **Friend**: Another player that a user has added to their friends list, granting them permission to remove the user's placed blocks
- **Custom Block**: A block that has been placed by a player (not part of the procedurally generated terrain)
- **Player Score**: A numeric value associated with each player in a level, increased through upvotes from other players
- **Upvote**: A positive recognition action that increases a builder's score, limited to prevent abuse
- **Session**: A unique connection instance for a player in a level, used to detect multi-device scenarios
- **Redis Players Key**: A Redis data structure storing all active players in a level, keyed as `players:${level}`
- **Redis Player Data Key**: A Redis hash storing individual player data including score and friends, keyed as `player:${username}:${level}`
- **Block Ownership**: The association between a placed block and the username of the player who placed it
- **Block Highlight**: A visual effect that makes specific blocks glow or stand out, used to show a builder's contributions
- **Upvote Limit**: A client-side restriction preventing excessive upvoting (maximum 5 per day, minimum 1 minute apart)
- **Region Builders**: The filtered list of players who have placed blocks in the currently visible region, excluding the current player

## Requirements

### Requirement 1

**User Story:** As a player, I want my player data to persist across sessions, so that my progress and relationships are maintained

#### Acceptance Criteria

1. WHEN a player connects to a level for the first time, THE Game Server SHALL create a Redis hash at `player:${username}:${level}` with initial score of 0 and empty friends list
2. THE Game Server SHALL store the player score as an integer field named "score" in the player data hash
3. THE Game Server SHALL store the friends list as a JSON-encoded array field named "friends" in the player data hash
4. THE Game Server SHALL store a reverse friends list (users who added this player) as a JSON-encoded array field named "friendedBy" in the player data hash
5. WHEN a player reconnects to a level, THE Game Server SHALL retrieve existing player data from Redis
6. THE Game Server SHALL send the complete player data including score, friends, and friendedBy list in the connection response
7. THE Game Server SHALL persist player data updates asynchronously without blocking the response

### Requirement 2

**User Story:** As a player, I want the system to detect if I'm already playing from another device, so that I don't create duplicate sessions

#### Acceptance Criteria

1. THE Game Server SHALL maintain a Redis set at `players:${level}` containing all active player usernames in that level
2. WHEN a player connects via `/api/connect`, THE Game Server SHALL check if their username exists in the active players set
3. IF the username exists in the active players set, THE Game Server SHALL return a response indicating Player Mode is unavailable
4. IF the username does not exist, THE Game Server SHALL add the username to the active players set and grant Player Mode
5. WHEN a player disconnects or is inactive for 2 minutes, THE Game Server SHALL remove their username from the active players set

### Requirement 3

**User Story:** As a user, I want to join as a viewer when I'm already playing from another device, so that I can observe without interfering

#### Acceptance Criteria

1. WHEN the Game Client receives a connection response indicating Player Mode is unavailable, THE Game Client SHALL enter Viewer Mode
2. THE Game Client SHALL display a notification message indicating the user is in Viewer Mode
3. WHILE in Viewer Mode, THE Game Client SHALL disable all block placement controls
4. WHILE in Viewer Mode, THE Game Client SHALL disable all block removal controls
5. WHILE in Viewer Mode, THE Game Client SHALL disable block type selection via number keys

### Requirement 4

**User Story:** As a player in Player Mode, I want to place blocks anywhere, so that I can build freely

#### Acceptance Criteria

1. WHILE in Player Mode, THE Game Client SHALL allow block placement at any valid world position
2. THE Game Client SHALL send block placement modifications to the Game Server via the existing `/api/modifications` endpoint
3. THE Game Server SHALL validate and persist block placements with the player's username as owner
4. THE Game Client SHALL apply block placements optimistically before server confirmation
5. THE Game Server SHALL broadcast block placements to regional channels with ownership information

### Requirement 5

**User Story:** As a player in Player Mode, I want to remove only non-custom blocks or blocks placed by friends, so that I respect other players' work

#### Acceptance Criteria

1. WHEN a player connects, THE Game Server SHALL send a list of usernames who have added the player as a friend in the connection response
2. THE Game Client SHALL cache this friends-who-added-me list locally for instant validation
3. WHEN a player attempts to remove a block, THE Game Client SHALL check if the block is a custom block using local data
4. IF the block is not a custom block, THE Game Client SHALL allow removal immediately
5. IF the block is a custom block and the owner is in the friends-who-added-me list, THE Game Client SHALL allow removal immediately
6. IF the block is a custom block and the owner is not in the friends-who-added-me list, THE Game Client SHALL prevent removal and display a message
7. THE Game Client SHALL perform all validation checks synchronously without server round-trips

### Requirement 6

**User Story:** As a player, I want to add other players as friends, so that we can collaborate on builds

#### Acceptance Criteria

1. THE Game Client SHALL provide a UI control to add a player to the friends list
2. WHEN a player adds a friend, THE Game Client SHALL update the local friends list immediately (optimistic update)
3. THE Game Client SHALL send a fire-and-forget request to the Game Server with the friend's username
4. THE Game Server SHALL update both the player's friends list AND the friend's friendedBy list in Redis asynchronously
5. THE Game Server SHALL create minimal player data for the friend if they do not yet exist in Redis
6. THE Game Server SHALL broadcast the friendship update to the friend if they are online
7. IF the server validation fails (e.g., adding self as friend), THE Game Server SHALL send a correction message to revert the optimistic update

### Requirement 7

**User Story:** As a player, I want to see which builders have contributed to the region I'm viewing, so that I can recognize their work

#### Acceptance Criteria

1. THE Game Client SHALL extract unique usernames from custom blocks in the currently loaded chunks
2. THE Game Client SHALL filter out the current player's username from the builders list
3. THE Game Client SHALL display builder usernames as clickable elements on the right side of the screen
4. THE Game Client SHALL update the builders list when the player moves to a new region
5. THE builders list SHALL display a maximum of 10 usernames at a time, prioritizing those with the most blocks in view

### Requirement 8

**User Story:** As a player, I want to highlight a builder's blocks, so that I can see their contributions clearly

#### Acceptance Criteria

1. WHEN a player clicks on a builder's name, THE Game Client SHALL identify all blocks in the visible region placed by that builder
2. THE Game Client SHALL apply a highlight effect to those blocks using the existing highlight system
3. THE highlight effect SHALL remain active until the player clicks the builder's name again or clicks a different builder
4. THE Game Client SHALL remove highlights when the player moves to a different region
5. THE Game Client SHALL use a distinct highlight color for builder blocks (different from the selection highlight)

### Requirement 9

**User Story:** As a player, I want to upvote builders whose work I appreciate, so that I can show recognition

#### Acceptance Criteria

1. THE Game Client SHALL display an upvote icon next to each builder's name in the builders list
2. WHEN a player clicks the upvote icon, THE Game Client SHALL immediately display visual feedback and increment the displayed score (optimistic update)
3. THE Game Client SHALL send a fire-and-forget upvote request to the Game Server asynchronously
4. THE Game Server SHALL increment the builder's score in Redis by 1 asynchronously
5. THE Game Server SHALL broadcast the score update to all clients in the level via regional channels
6. IF the server validation fails, THE Game Server SHALL send a correction message to revert the optimistic update

### Requirement 10

**User Story:** As a player, I want upvoting to be rate-limited, so that the system prevents abuse

#### Acceptance Criteria

1. THE Game Client SHALL store upvote history in localStorage keyed by `upvotes:${level}:${builderUsername}`
2. THE Game Client SHALL record the timestamp of each upvote in the localStorage entry
3. WHEN a player attempts to upvote, THE Game Client SHALL check if they have upvoted that builder within the last 1 minute
4. IF an upvote was made within 1 minute, THE Game Client SHALL prevent the upvote and display a cooldown message
5. THE Game Client SHALL limit each player to a maximum of 5 upvotes per builder per day

### Requirement 11

**User Story:** As a developer, I want player position to follow the same persistence pattern as block modifications, so that the architecture is consistent

#### Acceptance Criteria

1. THE Game Client SHALL send position updates via HTTP POST to `/api/position` (existing behavior)
2. THE Game Server SHALL update the player's position in memory (connectedClients map) immediately without Redis writes
3. THE Game Server SHALL broadcast position updates via regional channels (existing behavior)
4. WHEN a player is inactive for 2 minutes, THE Game Server SHALL remove them from the active players Redis set and connectedClients map
5. THE Game Server SHALL only write to Redis for player persistence on connect, disconnect, and score/friend updates (not position)
6. THE Game Server SHALL extract username and level from the request context in production (Reddit context)

### Requirement 12

**User Story:** As a developer, I want the Redis data structures to be efficient and scalable, so that the system performs well with many players

#### Acceptance Criteria

1. THE Game Server SHALL use a Redis set for `players:${level}` to enable O(1) membership checks
2. THE Game Server SHALL use Redis hashes for individual player data to enable atomic field updates
3. THE Game Server SHALL use Redis TTL (time-to-live) of 2 minutes on player entries to auto-cleanup inactive players
4. THE Game Server SHALL use Redis pipelining when fetching multiple player data entries
5. THE Game Server SHALL limit player data queries to only the players in the current region

### Requirement 13

**User Story:** As a player in Viewer Mode, I want to move around and see the world, so that I can observe gameplay

#### Acceptance Criteria

1. WHILE in Viewer Mode, THE Game Client SHALL allow normal camera movement without creating a player avatar
2. WHILE in Viewer Mode, THE Game Client SHALL subscribe to regional channels and receive block modifications
3. WHILE in Viewer Mode, THE Game Client SHALL receive and display other players' positions and avatars
4. WHILE in Viewer Mode, THE Game Client SHALL NOT send position updates to the Game Server
5. WHILE in Viewer Mode, THE Game Client SHALL NOT create a PlayerEntityRenderer for the local user
6. THE Game Server SHALL NOT include viewers in the active players list returned to other clients
7. THE Game Server SHALL NOT add viewers to the connectedClients map used for position broadcasts

### Requirement 14

**User Story:** As a developer, I want clear separation between Player Mode and Viewer Mode logic, so that the code is maintainable

#### Acceptance Criteria

1. THE Game Client SHALL maintain a `playerMode` state variable with values "player" or "viewer"
2. THE Game Client SHALL check the `playerMode` state before allowing any block modifications
3. THE Game Client SHALL check the `playerMode` state before sending position updates
4. THE Game Client SHALL provide a method to query the current player mode
5. THE Game Client SHALL log mode transitions for debugging purposes

### Requirement 15

**User Story:** As a player, I want to see my current score, so that I know how much recognition I've received

#### Acceptance Criteria

1. THE Game Client SHALL display the player's current score in the UI
2. THE Game Client SHALL request the player's score from the Game Server on connection
3. WHEN the player receives an upvote, THE Game Client SHALL update the displayed score
4. THE score display SHALL be visible but not obtrusive (e.g., in a corner or status bar)
5. THE Game Client SHALL format large scores with appropriate separators (e.g., 1,000)

### Requirement 16

**User Story:** As a developer, I want comprehensive logging for player mode and persistence, so that I can debug issues

#### Acceptance Criteria

1. THE Game Server SHALL log when a player enters Player Mode or Viewer Mode
2. THE Game Server SHALL log when a player is removed from the active players set due to inactivity
3. THE Game Client SHALL log when block removal is prevented due to ownership restrictions
4. THE Game Client SHALL log when upvotes are rate-limited
5. THE Game Server SHALL log Redis operations for player data with timing information

### Requirement 17

**User Story:** As a player, I want the friends list to be manageable, so that I can maintain my collaborations

#### Acceptance Criteria

1. THE Game Client SHALL provide a UI to view the current friends list
2. THE Game Client SHALL provide a UI control to remove a player from the friends list
3. WHEN a player removes a friend, THE Game Client SHALL send a request to the Game Server
4. THE Game Server SHALL update the player's friends list in Redis by removing the friend's username
5. THE Game Client SHALL update the local friends list immediately after server confirmation

### Requirement 18

**User Story:** As a developer, I want the system to handle edge cases gracefully, so that the user experience is smooth

#### Acceptance Criteria

1. WHEN a player attempts to add themselves as a friend, THE Game Server SHALL reject the request
2. WHEN a player attempts to add a friend who has not yet connected, THE Game Server SHALL create minimal player data for that friend and establish the friendship relationship
3. WHEN a player attempts to upvote themselves, THE Game Client SHALL prevent the action
4. IF Redis is unavailable, THE Game Server SHALL return an error response and log the failure
5. IF a player's data is corrupted in Redis, THE Game Server SHALL reinitialize with default values

### Requirement 19

**User Story:** As a player, I want smooth transitions between regions, so that the builders list updates naturally

#### Acceptance Criteria

1. WHEN the player moves to a new region, THE Game Client SHALL recalculate the builders list within 200 milliseconds
2. THE Game Client SHALL clear block highlights when moving to a new region
3. THE Game Client SHALL maintain upvote cooldowns across region transitions
4. THE builders list SHALL animate smoothly when updating (fade in/out)
5. THE Game Client SHALL debounce builders list updates to avoid excessive recalculations during rapid movement

### Requirement 20

**User Story:** As a developer, I want the upvote system to be extensible, so that we can add features like leaderboards later

#### Acceptance Criteria

1. THE Game Server SHALL store player scores in a format that supports efficient sorting (Redis sorted sets)
2. THE Game Server SHALL provide an endpoint to query top players by score in a level
3. THE player score data structure SHALL support atomic increment operations
4. THE Game Server SHALL track the total number of upvotes given and received separately
5. THE player data structure SHALL include a timestamp of the last score update for analytics
