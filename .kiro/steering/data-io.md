---
inclusion: always
---

# Data and IO Structure

## Communication Architecture

The game follows Devvit's realtime API constraints:

- **Client → Server**: HTTP POST requests only
- **Server → Client**: WebSocket broadcasts only (read-only for client)

This unidirectional pattern ensures compatibility with Reddit's platform while enabling real-time multiplayer.

## Redis Data Structures

### Player Data

**Key Pattern**: `player:{username}:{level}`

**Type**: Redis Hash

**Fields**:

- `score` - Player's total score (string representation of number)
- `friends` - JSON array of friend usernames
- `friendedBy` - JSON array of usernames who added this player as friend
- `lastActive` - Timestamp of last activity (string)
- `totalUpvotesGiven` - Total upvotes given by player (string)
- `totalUpvotesReceived` - Total upvotes received by player (string)

**TTL**: 7 days (refreshed on activity)

### Active Players

**Key Pattern**: `players:{level}`

**Type**: Redis Set

**Purpose**: Track which players are currently active in a level to detect multi-device scenarios

### Chunk Data

**Key Pattern**: `level:{level}:chunk:{chunkX}:{chunkZ}`

**Type**: Redis Hash

**Hash Keys**: `block:{x}:{y}:{z}`

**Hash Values**: JSON string containing:

```typescript
{
  type: number; // Block type ID
  username: string; // Player who placed the block
  timestamp: number; // When block was placed
  placed: boolean; // true for placed, false for removed
}
```

### Terrain Seeds

**Key Pattern**: `terrain:seeds:{level}`

**Type**: Redis String (JSON)

**Value**:

```typescript
{
  seed: number;
  treeSeed: number;
  stoneSeed: number;
  coalSeed: number;
}
```

**Purpose**: Ensure consistent procedural generation across all clients in a level

### Leaderboard

**Key Pattern**: `scores:{level}`

**Type**: Redis Sorted Set

**Members**: Player usernames

**Scores**: Player scores

**Purpose**: Efficient leaderboard queries

## HTTP Endpoints

### `/api/connect`

**Purpose**: Initial connection and game state retrieval

**Request**:

```typescript
{
  level: string;
}
```

**Response**:

```typescript
{
  mode: "player" | "viewer";  // Viewer if already connected from another device
  username: string;
  sessionId: string;
  level: string;
  terrainSeeds: { seed: number; treeSeed: number; stoneSeed: number; coalSeed: number };
  spawnPosition: { x: number; y: number; z: number };
  initialChunks: Array<{ chunkX: number; chunkZ: number; blocks: Array<Block> }>;
  players: Array<{ username: string; position: Position; rotation: Rotation }>;
  playerData?: { score: number; friends: string[]; friendedBy: string[] };
  message?: string;
}
```

### `/api/position`

**Purpose**: Update player position (throttled to 100ms client-side)

**Request**:

```typescript
{
  username: string;
  position: {
    x: number;
    y: number;
    z: number;
  }
  rotation: {
    x: number;
    y: number;
  }
}
```

**Response**: `{ ok: boolean }`

### `/api/modifications`

**Purpose**: Batch block modifications (1-second debounce or 100 modifications)

**Request**:

```typescript
{
  username: string;
  level: string;
  modifications: Array<{
    position: { x: number; y: number; z: number };
    blockType: number | null; // null for removal
    action: "place" | "remove";
    clientTimestamp: number;
  }>;
}
```

**Response**:

```typescript
{
  ok: boolean;
  failedAt: number | null;  // Index of first failed modification
  message?: string;
}
```

### `/api/chunk-state`

**Purpose**: Request specific chunk data (used for incremental loading)

**Request**:

```typescript
{
  username: string;
  level: string;
  chunks: Array<{ chunkX: number; chunkZ: number }>;
}
```

**Response**:

```typescript
{
  chunks: Array<{ chunkX: number; chunkZ: number; blocks: Array<Block> }>;
  requestTimestamp: number;
  responseTimestamp: number;
}
```

### `/api/disconnect`

**Purpose**: Clean disconnect notification

**Request**: `{ username: string; level: string }`

**Response**: `{ ok: boolean }`

### `/api/friends/add`

**Purpose**: Add friend (fire-and-forget with optimistic update)

**Request**: `{ username: string; level: string; friendUsername: string }`

**Response**: `{ ok: boolean; message?: string }`

**Server Actions**:

- Updates both player's `friends` list and friend's `friendedBy` list
- Broadcasts `friendship-update` to friend if online

### `/api/friends/remove`

**Purpose**: Remove friend (fire-and-forget with optimistic update)

**Request**: `{ username: string; level: string; friendUsername: string }`

**Response**: `{ ok: boolean; message?: string }`

**Server Actions**:

- Updates both player's `friends` list and friend's `friendedBy` list
- Broadcasts `friendship-update` to friend if online

### `/api/upvote`

**Purpose**: Upvote a builder (fire-and-forget with client-side rate limiting)

**Request**: `{ username: string; level: string; builderUsername: string }`

**Response**: `{ ok: boolean; message?: string }`

**Server Actions**:

- Increments builder's score atomically
- Updates leaderboard sorted set
- Increments upvote counters for both players

## WebSocket Broadcasts

### Regional Channels

**Format**: `region:{level}:{regionX}:{regionZ}`

**Region Calculation**:

```typescript
const CHUNK_SIZE = 24;
const REGION_SIZE = 15; // 15 chunks per region

const chunkX = Math.floor(position.x / CHUNK_SIZE);
const chunkZ = Math.floor(position.z / CHUNK_SIZE);
const regionX = Math.floor(chunkX / REGION_SIZE);
const regionZ = Math.floor(chunkZ / REGION_SIZE);
```

### Broadcast Message Types

#### `player-positions`

**Frequency**: 10 times per second (100ms interval)

**Format**:

```typescript
{
  type: "player-positions";
  players: Array<{
    username: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number };
  }>;
}
```

**Optimization**: Only broadcasts if player data changed since last broadcast

#### `block-modify`

**Frequency**: Immediate (as modifications occur)

**Format**:

```typescript
{
  type: "block-modify";
  username: string;
  position: {
    x: number;
    y: number;
    z: number;
  }
  blockType: number | null;
  action: "place" | "remove";
  clientTimestamp: number;
  serverTimestamp: number;
}
```

**Client Behavior**: Ignores own modifications (already applied locally)

#### `friendship-update`

**Frequency**: On-demand (when friendship changes)

**Format**:

```typescript
{
  type: "friendship-update";
  targetUsername: string;
  friendedBy: string[];
  message: string;
}
```

**Purpose**: Real-time permission updates for block removal

#### `friendship-error`

**Frequency**: On-demand (when validation fails)

**Format**:

```typescript
{
  type: "friendship-error";
  targetUsername: string;
  friendUsername: string;
  message: string;
}
```

**Purpose**: Revert optimistic friend additions that failed server validation

## Data Flow Patterns

### Optimistic Updates

Used for:

- Block modifications (applied locally before server confirmation)
- Friend additions/removals (UI updates immediately)
- Upvotes (button state changes immediately)

**Pattern**:

1. Apply change locally
2. Send HTTP request (fire-and-forget)
3. Server validates and broadcasts
4. Receive broadcast to confirm or correct

### Batching

**Block Modifications**:

- 1-second debounce timer
- Immediate send at 100 modifications
- Failed batches stored in localStorage for retry

**Position Updates**:

- Throttled to 100ms intervals
- Only sent when position/rotation changes

### Conflict Resolution

**Block Modifications**:

- Server timestamp is authoritative
- Client checks if local modification is newer
- Reverts to server state if server timestamp is newer

### Subscription Management

**Regional Channels**:

- Client calculates required regions based on position and draw distance
- Subscribes to new regions as player moves
- Unsubscribes from distant regions
- Each region has independent WebSocket subscription

## Level-Scoped Data

All game data is scoped by level (world identifier):

- Player data: `player:{username}:{level}`
- Chunks: `level:{level}:chunk:{x}:{z}`
- Active players: `players:{level}`
- Leaderboard: `scores:{level}`
- Terrain seeds: `terrain:seeds:{level}`

This allows multiple independent worlds/levels to coexist in the same Redis instance.

## Performance Considerations

### Redis Operations

- **Atomic increments**: Used for scores and upvote counters
- **Pipelining**: Used for batch chunk loading
- **Hash structures**: Efficient storage for chunks (one hash per chunk)
- **Sorted sets**: O(log N) leaderboard queries

### Network Optimization

- **Position broadcasts**: Only send if changed
- **Modification batching**: Reduce HTTP request count
- **Regional channels**: Players only receive updates for nearby regions
- **Coordinate rounding**: Reduce message size (positions rounded to 2 decimals)

### Client-Side Caching

- **LocalStorage**: Failed modification batches for retry
- **In-memory**: Chunk state buffer for fast lookups
- **Optimistic updates**: Immediate UI feedback without server round-trip
