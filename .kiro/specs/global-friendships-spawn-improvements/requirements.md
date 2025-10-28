# Requirements Document

## Introduction

This specification addresses improvements to the friendship system and player spawn mechanics in the multiplayer voxel game. The current implementation stores friendship data per-level, which is incorrect for the intended global friendship model. Additionally, the spawn system needs improvements to prevent player overlap and support returning players spawning at their last known position.

## Glossary

- **System**: The multiplayer voxel game server and client
- **Player**: A Reddit user playing the game
- **Level**: An independent game world (e.g., "default", "creative", "survival")
- **Friendship**: A unidirectional relationship where one player adds another as a friend
- **Global Friendship**: Friendship data that persists across all levels
- **Spawn Position**: The world coordinates where a player appears when connecting
- **Last Known Position**: The world coordinates where a player was last seen before disconnect/inactivity
- **Region**: A 15×15 chunk area used for pub/sub channel management
- **Redis**: The data storage system used by the server

---

## Requirements

### Requirement 1: Global Friendship Storage and Management

**User Story:** As a player, I want my friendships to persist across all levels and be notified when someone adds or removes me as a friend, so that I can collaborate effectively.

#### Acceptance Criteria

1. WHEN the System stores friendship data, THE System SHALL store it in global Redis hashes independent of level
2. THE System SHALL maintain a `friends` Redis hash where each key is a username and each value is a JSON array of friend usernames
3. THE System SHALL maintain a `friendedBy` Redis hash where each key is a username and each value is a JSON array of usernames who have friended that player
4. WHEN a player adds a friend via `/api/friends/add`, THE System SHALL update both the `friends` hash for the player and the `friendedBy` hash for the friend
5. WHEN a player removes a friend via `/api/friends/remove`, THE System SHALL update both the `friends` hash for the player and the `friendedBy` hash for the friend
6. WHEN a player adds or removes a friend, THE System SHALL query all Redis keys matching `player:{friendUsername}:*` to find active levels
7. IF a friend's level key has `lastJoined` within the last 2 hours, THEN THE System SHALL broadcast a friendship update to the region of their `lastKnownPosition`
8. THE System SHALL broadcast friendship-added messages to notify players when they are added as a friend
9. THE System SHALL broadcast friendship-removed messages to notify players when they are removed as a friend
10. WHEN a client receives a friendship broadcast, THE System SHALL update the local `friendedBy` array to enable or revoke block removal permissions

---

### Requirement 2: Simplified Player Data Storage

**User Story:** As a developer, I want to store only level-specific data in the per-level player hash, so that the data model is clear and efficient.

#### Acceptance Criteria

1. THE System SHALL store player data at Redis key `player:{username}:{level}` as a hash
2. THE System SHALL store the following fields in the player hash: `score`, `totalUpvotesGiven`, `totalUpvotesReceived`, `lastActive`, `lastKnownPosition`, `lastJoined`
3. THE System SHALL NOT store `friends` or `friendedBy` fields in the per-level player hash
4. WHEN a player connects to a level for the first time, THE System SHALL create the player hash with initial values for all fields including `lastJoined` set to the current timestamp
5. WHEN a player connects to a level they have played before, THE System SHALL update the `lastJoined` field to the current timestamp
6. THE System SHALL store `lastKnownPosition` as a JSON string with format `{"x": number, "y": number, "z": number}`
7. THE System SHALL update `lastKnownPosition` only when a player disconnects or becomes inactive

---

### Requirement 3: Last Known Position Tracking

**User Story:** As a player, I want to spawn at my last known position when I reconnect, so that I can continue where I left off.

#### Acceptance Criteria

1. THE System SHALL NOT store position on regular position updates to avoid excessive Redis writes
2. WHEN a player disconnects via `/api/disconnect`, THE System SHALL store their current position from `connectedClients` map in the `lastKnownPosition` field
3. WHEN a player is removed due to inactivity (2 minutes without position updates), THE System SHALL store their last position from `connectedClients` map in `lastKnownPosition`
4. THE System SHALL store `lastKnownPosition` as a JSON string with format `{"x": number, "y": number, "z": number}`
5. WHEN a player connects and has a `lastKnownPosition`, THE System SHALL return that position as the spawn position

---

### Requirement 4: Smart Spawn Position Selection

**User Story:** As a player, I want to spawn in a location where no other players are currently standing, so that I don't overlap with other players.

#### Acceptance Criteria

1. WHEN a player connects for the first time in a level, THE System SHALL calculate a spawn position near the default spawn point
2. WHEN calculating a spawn position, THE System SHALL check if any active players are within 5 blocks of the candidate position
3. IF another player is within 5 blocks, THEN THE System SHALL try alternative positions in a spiral pattern around the default spawn
4. THE System SHALL try up to 25 alternative positions before falling back to the default spawn position
5. THE System SHALL keep all spawn positions within the same region as the default spawn (within 360 blocks)
6. WHEN a player has a `lastKnownPosition`, THE System SHALL use that position instead of calculating a new spawn position

---

### Requirement 5: Connection Response Updates

**User Story:** As a player, I want to receive my global friendship data when I connect, so that I can see who I can collaborate with.

#### Acceptance Criteria

1. WHEN a player connects via `/api/connect`, THE System SHALL load the player's friends list from the global `friends` hash
2. WHEN a player connects via `/api/connect`, THE System SHALL load the player's friendedBy list from the global `friendedBy` hash
3. THE System SHALL include both `friends` and `friendedBy` arrays in the connection response
4. THE System SHALL use `HGET` to retrieve friendship data from the global hashes
5. THE System SHALL parse JSON arrays when loading friendship data

---

### Requirement 6: Block Removal Permission Updates

**User Story:** As a player, I want to remove blocks placed by players who have friended me globally, so that collaboration works across all levels.

#### Acceptance Criteria

1. WHEN checking block removal permissions on the client, THE System SHALL use the local `friendedBy` array loaded from the global hash
2. IF the block owner's username is in the player's global `friendedBy` list, THEN THE System SHALL allow block removal
3. WHEN a friendship-added broadcast is received, THE System SHALL add the username to the local `friendedBy` array
4. WHEN a friendship-removed broadcast is received, THE System SHALL remove the username from the local `friendedBy` array
5. THE System SHALL check global friendship data regardless of which level the block was placed in

---

### Requirement 7: Friendship Broadcast Discovery

**User Story:** As a developer, I want to efficiently notify online players when their friendship status changes, so that permissions update in real-time.

#### Acceptance Criteria

1. WHEN a friendship is added or removed, THE System SHALL query Redis for all keys matching pattern `player:{friendUsername}:*`
2. FOR each matching key, THE System SHALL retrieve the `lastJoined` field from the hash
3. IF `lastJoined` is within the last 2 hours, THEN THE System SHALL consider the player potentially active
4. THE System SHALL retrieve the `lastKnownPosition` from the player hash
5. THE System SHALL calculate the regional channel from the `lastKnownPosition`
6. THE System SHALL broadcast the friendship update to the calculated regional channel
7. THE System SHALL broadcast a `friendship-added` message when a player is added as a friend
8. THE System SHALL broadcast a `friendship-removed` message when a player is removed as a friend

---

### Requirement 8: Documentation Updates

**User Story:** As a developer, I want the architecture documentation to reflect the new data structures, so that future developers understand the system.

#### Acceptance Criteria

1. THE System SHALL update the ARCHITECTURE.md document to reflect global friendship storage
2. THE System SHALL document the new `lastKnownPosition` and `lastJoined` fields in the player data structure
3. THE System SHALL document the smart spawn position selection algorithm
4. THE System SHALL update all data structure diagrams and examples to reflect the changes
5. THE System SHALL document the Redis key patterns for global friendship hashes
6. THE System SHALL document the friendship broadcast discovery mechanism
