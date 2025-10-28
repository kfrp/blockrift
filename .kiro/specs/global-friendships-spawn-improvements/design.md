# Design Document

## Overview

This design implements global friendship storage and smart spawn positioning for the multiplayer voxel game. The key changes involve moving friendship data from per-level storage to global Redis hashes, tracking player positions for spawn logic, and implementing real-time friendship notifications across regions.

## Architecture

### Data Structure Changes

**Before:**

```
player:{username}:{level} (Redis Hash)
├── score
├── friends (JSON array) ❌ REMOVED
├── friendedBy (JSON array) ❌ REMOVED
├── lastActive
├── totalUpvotesGiven
└── totalUpvotesReceived
```

**After:**

```
Global Friendship Hashes:
friends (Redis Hash)
├── {username}: ["friend1", "friend2", ...] (JSON)
└── ...

friendedBy (Redis Hash)
├── {username}: ["user1", "user2", ...] (JSON)
└── ...

Per-Level Player Data:
player:{username}:{level} (Redis Hash)
├── score
├── lastActive
├── lastJoined ✅ NEW
├── lastKnownPosition ✅ NEW (JSON: {"x":0,"y":20,"z":0})
├── totalUpvotesGiven
└── totalUpvotesReceived
```

### System Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Player Connection Flow                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    POST /api/connect {level}
                              │
                              ▼
                  ┌───────────────────────┐
                  │ Check Active Players  │
                  │  players:{level} set  │
                  └───────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
           Already Active              Not Active
                │                           │
                ▼                           ▼
          Viewer Mode              ┌────────────────┐
                                   │ Load/Create    │
                                   │ Player Data    │
                                   └────────────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │ Load Global Friendship │
                              │ friends:{username}     │
                              │ friendedBy:{username}  │
                              └────────────────────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │ Determine Spawn Pos    │
                              │ - lastKnownPosition?   │
                              │ - Smart spawn logic    │
                              └────────────────────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │ Update lastJoined      │
                              │ Set to current time    │
                              └────────────────────────┘
                                           │
                                           ▼
                                   Return Game State
```

```
┌─────────────────────────────────────────────────────────────┐
│                  Friendship Update Flow                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              POST /api/friends/add {friendUsername}
                              │
                              ▼
                  ┌───────────────────────┐
                  │ Update Global Hashes  │
                  │ friends:{username}    │
                  │ friendedBy:{friend}   │
                  └───────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │ Find Friend's Levels  │
                  │ KEYS player:{friend}:*│
                  └───────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │ Check Each Level      │
                  │ lastJoined < 2 hours? │
                  └───────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
           Recently Active              Not Active
                │                           │
                ▼                           ▼
    ┌────────────────────────┐         Skip Broadcast
    │ Get lastKnownPosition  │
    │ Calculate Region       │
    └────────────────────────┘
                │
                ▼
    ┌────────────────────────┐
    │ Broadcast to Region    │
    │ friendship-added msg   │
    └────────────────────────┘
                │
                ▼
    ┌────────────────────────┐
    │ Client Updates         │
    │ friendedBy Array       │
    └────────────────────────┘
```

## Components and Interfaces

### 1. Global Friendship Manager (Server)

**Purpose**: Manage global friendship data in Redis

**Methods**:

```typescript
async function getPlayerFriends(username: string): Promise<string[]>;
async function getPlayerFriendedBy(username: string): Promise<string[]>;
async function addFriend(
  username: string,
  friendUsername: string
): Promise<void>;
async function removeFriend(
  username: string,
  friendUsername: string
): Promise<void>;
```

**Implementation Details**:

- Uses `HGET friends {username}` to retrieve friends list
- Uses `HSET friends {username} {jsonArray}` to update friends list
- Parses and manipulates JSON arrays in memory
- Updates both `friends` and `friendedBy` hashes atomically

### 2. Friendship Broadcast Discoverer (Server)

**Purpose**: Find active players and broadcast friendship updates

**Methods**:

```typescript
async function broadcastFriendshipUpdate(
  friendUsername: string,
  action: "added" | "removed",
  byUsername: string
): Promise<void>;

async function findActiveLevels(username: string): Promise<
  Array<{
    level: string;
    position: Position;
  }>
>;
```

**Implementation Details**:

- Uses `KEYS player:{username}:*` to find all levels
- Retrieves `lastJoined` from each level's hash
- Filters levels where `lastJoined` is within 2 hours
- Retrieves `lastKnownPosition` for each active level
- Calculates regional channel from position
- Broadcasts to each regional channel

**Performance Consideration**:

- `KEYS` command can be slow, but friendship operations are infrequent
- Alternative: Use `SCAN` for production if needed
- Limit: Only checks levels with recent `lastJoined` timestamp

### 3. Smart Spawn Position Calculator (Server)

**Purpose**: Calculate spawn positions that avoid player overlap

**Methods**:

```typescript
function calculateSpawnPosition(
  level: string,
  connectedClients: Map<string, ConnectedClient>,
  lastKnownPosition?: Position
): Position;

function isPositionOccupied(
  position: Position,
  connectedClients: Map<string, ConnectedClient>,
  level: string,
  radius: number = 5
): boolean;
```

**Algorithm**:

```typescript
// Spiral pattern for alternative positions
const spiralOffsets = [
  { x: 0, z: 0 }, // Center
  { x: 5, z: 0 }, // East
  { x: 0, z: 5 }, // South
  { x: -5, z: 0 }, // West
  { x: 0, z: -5 }, // North
  { x: 5, z: 5 }, // SE
  { x: -5, z: 5 }, // SW
  { x: -5, z: -5 }, // NW
  { x: 5, z: -5 }, // NE
  { x: 10, z: 0 }, // Further east
  // ... up to 25 positions
];

function calculateSpawnPosition(level, connectedClients, lastKnownPosition) {
  // If player has last known position, use it
  if (lastKnownPosition) {
    return lastKnownPosition;
  }

  // Default spawn position
  const defaultSpawn = { x: 0, y: 20, z: 0 };

  // Try each position in spiral pattern
  for (const offset of spiralOffsets) {
    const candidate = {
      x: defaultSpawn.x + offset.x,
      y: defaultSpawn.y,
      z: defaultSpawn.z + offset.z,
    };

    // Check if any player is within 5 blocks
    if (!isPositionOccupied(candidate, connectedClients, level, 5)) {
      return candidate;
    }
  }

  // Fallback to default if all positions occupied
  return defaultSpawn;
}
```

**Constraints**:

- All spawn positions within same region (360 blocks from default)
- Maximum 25 attempts before fallback
- Only checks currently connected players (not all players in level)

### 4. Position Persistence Manager (Server)

**Purpose**: Store player positions only on disconnect/inactivity

**Methods**:

```typescript
async function savePlayerPosition(
  username: string,
  level: string,
  position: Position
): Promise<void>;
```

**Integration Points**:

- Called in `/api/disconnect` endpoint
- Called in `cleanupInactivePlayers()` function
- Retrieves position from `connectedClients` map
- Stores as JSON string in `lastKnownPosition` field

### 5. Player Mode Manager Updates (Client)

**Purpose**: Handle global friendship data on client

**Changes**:

```typescript
class PlayerModeManager {
  private friends: string[] = []; // From global hash
  private friendedBy: string[] = []; // From global hash

  // New method to handle friendship broadcasts
  handleFriendshipBroadcast(data: {
    type: "friendship-added" | "friendship-removed";
    targetUsername: string;
    byUsername: string;
  }): void {
    if (data.targetUsername !== this.username) return;

    if (data.type === "friendship-added") {
      if (!this.friendedBy.includes(data.byUsername)) {
        this.friendedBy.push(data.byUsername);
      }
    } else {
      this.friendedBy = this.friendedBy.filter((u) => u !== data.byUsername);
    }
  }
}
```

## Data Models

### Global Friendship Hashes

```typescript
// Redis Hash: friends
// Key: username
// Value: JSON string
{
  "alice": "[\"bob\", \"charlie\"]",
  "bob": "[\"alice\"]",
  "charlie": "[]"
}

// Redis Hash: friendedBy
// Key: username
// Value: JSON string
{
  "alice": "[\"bob\"]",
  "bob": "[\"alice\"]",
  "charlie": "[\"alice\"]"
}
```

### Updated Player Hash

```typescript
// Redis Hash: player:{username}:{level}
{
  score: "150",
  lastActive: "1704067200000",
  lastJoined: "1704067200000",  // NEW
  lastKnownPosition: "{\"x\":100,\"y\":25,\"z\":-50}",  // NEW
  totalUpvotesGiven: "5",
  totalUpvotesReceived: "12"
}
```

### Friendship Broadcast Messages

```typescript
// friendship-added
{
  type: "friendship-added";
  targetUsername: string; // Who was added as a friend
  byUsername: string; // Who added them
  message: string; // e.g., "alice added you as a friend"
}

// friendship-removed
{
  type: "friendship-removed";
  targetUsername: string; // Who was removed as a friend
  byUsername: string; // Who removed them
  message: string; // e.g., "alice removed you as a friend"
}
```

### Updated Connection Response

```typescript
interface ConnectResponse {
  mode: "player" | "viewer";
  username: string;
  sessionId: string;
  level: string;
  terrainSeeds: TerrainSeeds;
  spawnPosition: Position; // Now uses smart spawn logic
  initialChunks: ChunkData[];
  players: PlayerData[];
  playerData?: {
    score: number;
    friends: string[]; // From global hash
    friendedBy: string[]; // From global hash
  };
  message?: string;
}
```

## Error Handling

### Friendship Operations

**Scenario**: Friend doesn't exist in global hash

- **Handling**: Create empty array for friend on first friendship

**Scenario**: JSON parse error when loading friendship data

- **Handling**: Log error, return empty array, continue operation

**Scenario**: KEYS command times out

- **Handling**: Log warning, skip broadcast, friendship still updated

### Spawn Position

**Scenario**: All 25 positions occupied

- **Handling**: Use default spawn position (players may overlap)

**Scenario**: lastKnownPosition is invalid JSON

- **Handling**: Log error, use smart spawn logic

**Scenario**: lastKnownPosition is outside world bounds

- **Handling**: Validate coordinates, use smart spawn if invalid

### Position Persistence

**Scenario**: Redis write fails on disconnect

- **Handling**: Log error, player will use smart spawn on reconnect

**Scenario**: connectedClients doesn't have player position

- **Handling**: Skip position save, use smart spawn on reconnect

## Testing Strategy

### Unit Tests

1. **Global Friendship Manager**

   - Test adding friend updates both hashes
   - Test removing friend updates both hashes
   - Test JSON parsing and array manipulation
   - Test handling non-existent users

2. **Friendship Broadcast Discoverer**

   - Test KEYS pattern matching
   - Test lastJoined filtering (within 2 hours)
   - Test regional channel calculation
   - Test handling multiple active levels

3. **Smart Spawn Calculator**

   - Test default spawn when no players
   - Test spiral pattern with occupied positions
   - Test fallback to default after 25 attempts
   - Test lastKnownPosition takes precedence

4. **Position Persistence**
   - Test saving position on disconnect
   - Test saving position on inactivity
   - Test JSON serialization

### Integration Tests

1. **Friendship Flow**

   - Add friend → verify both hashes updated
   - Add friend → verify broadcast sent to active friend
   - Remove friend → verify permissions revoked
   - Client receives broadcast → verify friendedBy updated

2. **Spawn Flow**

   - First-time player → verify smart spawn used
   - Returning player → verify lastKnownPosition used
   - Multiple players → verify no overlap

3. **Position Tracking**
   - Player disconnects → verify position saved
   - Player inactive → verify position saved
   - Player reconnects → verify spawns at saved position

### Manual Testing

1. Test friendship across multiple levels
2. Test friendship notifications in real-time
3. Test spawn positions with multiple concurrent players
4. Test position persistence across reconnects
5. Test block removal permissions with global friendships

## Performance Considerations

### Redis Operations

**Friendship Updates**:

- 2 HGET operations (load current arrays)
- 2 HSET operations (update arrays)
- Infrequent operation, acceptable overhead

**Friendship Broadcast Discovery**:

- 1 KEYS operation (can be slow with many levels)
- N HGET operations (one per level found)
- Mitigated by: Infrequent operation, 2-hour filter

**Position Persistence**:

- 1 HSET operation per disconnect/inactivity
- Much less frequent than position updates (10x/second)
- Significant reduction in Redis writes

### Memory Usage

**Global Friendship Hashes**:

- Worst case: 10,000 users × 100 friends × 20 bytes = ~20MB
- Acceptable for Redis

**JSON Parsing**:

- Small arrays (typically < 100 friends)
- Minimal CPU overhead

### Network Traffic

**Friendship Broadcasts**:

- Small messages (~100 bytes)
- Infrequent (only on friendship changes)
- Targeted to specific regions

## Migration Notes

Since we're in development mode, no migration is needed. For future reference:

**If migration were needed**:

1. Script to scan all `player:*:*` keys
2. Extract `friends` and `friendedBy` fields
3. Consolidate into global hashes (merge duplicates)
4. Remove fields from player hashes
5. Add `lastJoined` and `lastKnownPosition` fields

## Documentation Updates

The following sections of ARCHITECTURE.md need updates:

1. **Core Data Structures → Player Data**

   - Remove friends/friendedBy from per-level hash
   - Add lastJoined and lastKnownPosition fields
   - Add new global friendship hashes section

2. **HTTP Endpoints → /api/connect**

   - Document smart spawn position logic
   - Document global friendship data in response

3. **HTTP Endpoints → /api/friends/add and /api/friends/remove**

   - Document global hash updates
   - Document friendship broadcast mechanism

4. **WebSocket Broadcasts**

   - Add friendship-added message format
   - Add friendship-removed message format

5. **Key Design Decisions**
   - Add section on global vs per-level friendship storage
   - Add section on position persistence strategy
