# Voxel Game: Data Structure and IO Architecture

> **Purpose**: This document describes the data structure choices and IO patterns for a multiplayer voxel game designed to run on Reddit's Devvit platform. The architecture is constrained by Devvit's realtime API limitations and optimized for infinite procedural terrain with efficient multiplayer synchronization.

---

## Table of Contents

1. [Platform Constraints](#platform-constraints)
2. [Data Structure Hierarchy](#data-structure-hierarchy)
3. [Core Data Structures](#core-data-structures)
4. [Regional Channel System](#regional-channel-system)
5. [Client-Side Optimizations](#client-side-optimizations)
6. [Optimistic UI Updates](#optimistic-ui-updates)
7. [Batching Strategies](#batching-strategies)
8. [HTTP Endpoints](#http-endpoints)
9. [WebSocket Broadcasts](#websocket-broadcasts)
10. [Performance Optimizations](#performance-optimizations)
11. [Key Design Decisions](#key-design-decisions)

---

## Platform Constraints

### Reddit/Devvit Realtime API

The game runs on Reddit's Devvit platform with specific communication constraints:

**Client → Server: HTTP POST only**

- All client-initiated actions use HTTP endpoints
- No bidirectional WebSocket from client
- Fire-and-forget pattern for non-critical updates

**Server → Client: WebSocket broadcasts only**

- Server broadcasts to channels via pub/sub
- Clients subscribe to channels (read-only)
- No individual client connections
- No request/response over WebSocket

**Architectural Implications:**

- Optimistic UI updates (client applies changes immediately)
- Regional pub/sub (efficient broadcast management)
- Batching (reduce expensive HTTP requests)
- Timestamp-based conflict resolution

---

## Data Structure Hierarchy

### Level-Scoped Architecture

All game data is scoped by **level** (world identifier):

```
Level (e.g., "default", "creative", "survival")
├── Terrain Seeds (procedural generation parameters)
├── Players (active and historical)
├── Chunks (custom block modifications)
├── Leaderboard (player scores)
└── Regional Channels (pub/sub for multiplayer)
```

### Multi-User Support

- **Global identity**: Reddit username (production) or generated username (dev)
- **Per-level data**: Score, friends, stats tracked separately per level
- **Multi-device detection**: Only one active connection per level
- **Viewer Mode**: Additional connections enter read-only mode

---

## Core Data Structures

### 1. Terrain Seeds

**Purpose**: Ensure all players see identical procedurally generated worlds

**Storage**: Redis String (JSON)  
**Key**: `terrain:seeds:{level}`

```typescript
{
  seed: number; // Base terrain height
  treeSeed: number; // Tree placement
  stoneSeed: number; // Stone region distribution
  coalSeed: number; // Coal ore placement
}
```

**Generation Strategy**:

- Deterministic based on level name (hash function)
- Generated once per level on first connection
- Shared with all clients
- Enables infinite terrain without storing every block

**Client Usage**:

- Uses seeds with Perlin noise to generate terrain
- Same seeds + coordinates = same terrain
- Only modifications need server storage

### 2. Chunk-Based Block Storage

**Purpose**: Store player modifications to procedurally generated terrain

**Storage**: Redis Hash (one per chunk)  
**Key**: `level:{level}:chunk:{chunkX}:{chunkZ}`  
**Hash Keys**: `block:{x}:{y}:{z}`

```typescript
// Hash Value (JSON)
{
  type: number; // BlockType enum value
  username: string; // Player who modified
  timestamp: number; // When modified
  placed: boolean; // true=placed, false=removed
}
```

**Design Rationale**:

**Why chunks?**

- Infinite world requires spatial partitioning
- Chunk size: 24×24 blocks (matches client rendering)
- Efficient batch loading via Redis pipeline
- Memory efficient (only store modifications)

**Why Redis Hashes?**

- One hash per chunk keeps related data together
- O(1) access to individual blocks
- Efficient for sparse data
- Easy full chunk load with `HGETALL`

**Placement vs. Removal**:

- `placed: true` = Player added block
- `placed: false` = Player removed procedurally generated block
- Both stored because terrain regenerates on chunk load

---

### 3. Global Friendship Data

**Purpose**: Track friendships globally across all levels

**Storage**: Redis Hash (global, not per-level)  
**Key Pattern**: `friends` and `friendedBy`

```typescript
// Redis Hash: friends
// Key: username
// Value: JSON array of friend usernames
{
  "alice": "[\"bob\", \"charlie\"]",
  "bob": "[\"alice\"]"
}

// Redis Hash: friendedBy
// Key: username
// Value: JSON array of usernames who friended this player
{
  "alice": "[\"bob\"]",
  "bob": "[\"alice\"]",
  "charlie": "[\"alice\"]"
}
```

**Why global?**

- Friendships persist across all levels
- Players can collaborate in any world
- Simplifies friendship management
- Single source of truth

**Why friendedBy?**

- **CRITICAL for block removal permissions**
- If Alice adds Bob as friend → Bob can remove Alice's blocks
- Stored bidirectionally for O(1) permission checks
- No cross-referencing needed

**Friendship Model**:

```
Alice adds Bob as friend:
  friends hash: alice → ["bob"]
  friendedBy hash: bob → ["alice"]

Result: Bob can now remove Alice's blocks in ANY level
```

**Access Pattern**:

- `HGET friends {username}` - Get user's friends list
- `HGET friendedBy {username}` - Get who friended this user
- `HSET friends {username} {jsonArray}` - Update friends list
- `HSET friendedBy {username} {jsonArray}` - Update friendedBy list

---

### 4. Player Data

**Purpose**: Track per-level progress and activity

**Storage**: Redis Hash  
**Key**: `player:{username}:{level}`  
**TTL**: 7 days (refreshed on activity)

```typescript
{
  score: string; // Total score
  lastActive: string; // Timestamp of last activity
  lastJoined: string; // Timestamp of last connection to this level
  lastKnownPosition: string; // JSON: {"x":100,"y":25,"z":-50}
  totalUpvotesGiven: string; // Total upvotes given
  totalUpvotesReceived: string; // Total upvotes received
}
```

**Why per-level?**

- Each level is independent world with own progression
- Allows different game modes
- Friendships are global, but progress is per-level

**New Fields**:

- `lastJoined`: Updated on every connection, used for friendship broadcast discovery
- `lastKnownPosition`: Stored only on disconnect/inactivity, used for smart spawn positioning

**Position Persistence Strategy**:

- NOT updated on regular position updates (would cause excessive Redis writes)
- Updated only when player disconnects or becomes inactive
- Enables players to spawn at their last location when reconnecting

---

### 5. Active Players Tracking

**Purpose**: Detect multi-device connections, enforce single-device-per-level

**Storage**: Redis Set  
**Key**: `players:{level}`  
**Members**: Active player usernames

**Usage**:

- Added on `/api/connect` if not present
- Removed on `/api/disconnect` or after 2min inactivity
- If username in set → Viewer Mode
- If username not in set → Player Mode

---

### 6. Leaderboard

**Purpose**: Efficient score-based ranking

**Storage**: Redis Sorted Set  
**Key**: `scores:{level}`  
**Members**: Player usernames  
**Scores**: Player scores

**Operations**:

- `ZINCRBY` for atomic score updates
- `ZREVRANGE` for top N players
- `ZRANK` for player's rank

---

## Regional Channel System

### Problem: Scalability

Broadcasting every event to every player is inefficient:

- Player at (0,0) doesn't need updates from (10000,10000)
- Subscribing to every chunk creates thousands of channels

### Solution: Regional Pub/Sub

**Concept**: Divide world into regions covering multiple chunks

**Region Size**: 15×15 chunks (360×360 blocks)  
**Channel Format**: `region:{level}:{regionX}:{regionZ}`  
**Example**: `region:default:0:0`

### Region Calculation

```typescript
const CHUNK_SIZE = 24;
const REGION_SIZE = 15;

// From world position
const chunkX = Math.floor(position.x / CHUNK_SIZE);
const chunkZ = Math.floor(position.z / CHUNK_SIZE);
const regionX = Math.floor(chunkX / REGION_SIZE);
const regionZ = Math.floor(chunkZ / REGION_SIZE);
```

### Subscription Management

**Client-Side**:

- Calculate required regions (draw distance = 3 chunks → ~9 regions)
- Subscribe to new regions as player moves
- Unsubscribe from distant regions

**Server-Side**:

- Tracks WebSocket subscribers per channel
- Broadcasts to all channel subscribers
- Auto-unsubscribes when no subscribers remain

**Benefits**:

- Manageable subscriptions (~9 per player)
- Players only receive relevant updates
- Scales to infinite world size

### Game-Level Channel

**Purpose**: Level-wide broadcasts for non-positional events

**Channel Format**: `game:{level}`  
**Example**: `game:default`

**Use Cases**:

1. **Friendship Updates**: When a player adds/removes a friend, broadcast to all players in that level
2. **Player Count Updates**: Real-time player count for the level
3. **Global Announcements**: Level-wide events or notifications

**Benefits**:

- Simpler than calculating regional channels for offline players
- Efficient for events that affect all players in a level
- Single subscription per client (always active)

**Player Count Tracking**:

- Server maintains in-memory count per level (`Map<level, count>`)
- Incremented on `/api/connect` (Player Mode only)
- Decremented on `/api/disconnect` or inactivity cleanup
- Broadcast to `game:{level}` channel on changes
- Displayed in UI above builders list

---

## Client-Side Optimizations

### 1. Chunk-Based Rendering with InstancedMesh

**Architecture**:

- One `THREE.InstancedMesh` per block type (grass, stone, wood, etc.)
- Each mesh renders thousands of blocks in one draw call
- Blocks are instances, not individual meshes

**Memory Allocation**:

```typescript
maxCount = (distance * chunkSize * 2 + chunkSize)² + 500
blocksFactor = [1, 0.2, 0.1, 0.7, ...]  // Per block type
```

**Rationale**:

- Grass common (factor 1.0) → more instances
- Diamonds rare (factor 0.1) → fewer instances
- Prevents over-allocation while ensuring capacity

### 2. Custom Blocks Array (Source of Truth)

```typescript
terrain.customBlocks: Block[]
```

**Purpose**:

- Persists across chunk regenerations
- Used for save/load
- Sent to server for persistence
- Applied on top of procedural generation

**Block Structure**:

```typescript
class Block {
  x: number;
  y: number;
  z: number;
  type: BlockType;
  placed: boolean; // true=placed, false=removed
  username: string; // Who modified
  timestamp: number; // When modified
}
```

### 3. Web Worker for Terrain Generation

**Problem**: Terrain generation is CPU-intensive

**Solution**: Offload to Web Worker

**Process**:

1. Main thread sends generation job
2. Worker generates terrain using Perlin noise
3. Worker builds instance matrices for all block types
4. Worker sends matrices to main thread
5. Main thread applies to InstancedMeshes

**Benefits**:

- Non-blocking generation
- Smooth 60 FPS gameplay
- Instant chunk transitions

---

## Optimistic UI Updates

### Pattern

All player actions applied locally immediately, validated asynchronously:

1. **Client applies change** (instant feedback)
2. **Client sends HTTP request** (fire-and-forget)
3. **Server validates** (permissions, conflicts)
4. **Server broadcasts** (to regional channel)
5. **Client receives broadcast** (confirms or corrects)

### Block Modifications

**Client Flow**:

```typescript
// 1. Apply locally
terrain.blocks[type].setMatrixAt(instanceId, matrix);
terrain.customBlocks.push(new Block(...));

// 2. Add to batch
chunkStateManager.addModification(position, blockType, action);

// 3. Batch sent after 1s or 100 modifications
// HTTP POST /api/modifications

// 4. Receive broadcast confirmation
// WebSocket message type: "block-modify"
```

**Server Flow**:

```typescript
// 1. Receive batch
// 2. Validate each modification sequentially
// 3. Add server timestamp
// 4. Broadcast immediately to regional channel
// 5. Persist batch to Redis using pipeline
```

### Conflict Resolution

**Scenario**: Two players modify same block simultaneously

**Resolution**: Server timestamp is authoritative

```typescript
if (serverTimestamp >= localTimestamp) {
  // Server wins
  applyBlockModification(serverData);
} else {
  // Local wins, ignore server
}
```

### Friend Management

**Optimistic Pattern**:

```typescript
// 1. Update UI immediately
friends.push(friendUsername);
updateFriendsList();

// 2. Send HTTP request
POST / api / friends / add;

// 3. Server validates and updates both players
// 4. Response confirms or rejects
// 5. If rejected, revert UI
```

### Upvotes

**Fire-and-Forget Pattern**:

```typescript
// 1. Update UI immediately
upvoteButton.disabled = true;

// 2. Send HTTP request (don't wait)
POST / api / upvote;

// 3. Server processes asynchronously
// 4. No confirmation needed
```

---

## Batching Strategies

### Block Modifications

**Debouncing**:

- 1-second timer starts on first modification
- Timer resets on each new modification
- Batch sent when timer expires

**Immediate Send**:

- Batch sent immediately at 100 modifications
- Prevents excessive memory usage
- Ensures timely updates during rapid building

**Offline Persistence**:

- Failed batches stored in `localStorage`
- Retried on reconnection
- Ensures no data loss

### Position Updates

**Throttling**:

- Maximum 1 update/second (1000ms interval)
- Only sent when position/rotation changes
- Coordinates rounded to 2 decimals

**Server-Side Batching**:

- Server collects all position updates
- Broadcasts batched updates 10x/second
- Only broadcasts if data changed

---

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
  mode: "player" | "viewer";
  username: string;
  sessionId: string;
  level: string;
  terrainSeeds: { seed, treeSeed, stoneSeed, coalSeed };
  spawnPosition: { x, y, z };  // Smart spawn position
  initialChunks: Array<{ chunkX, chunkZ, blocks }>;
  players: Array<{ username, position, rotation }>;
  playerData?: {
    score,
    friends,      // From global friends hash
    friendedBy    // From global friendedBy hash
  };
  message?: string;
}
```

**Server Logic**:

1. Check if username in `players:{level}` set
2. If yes → Viewer Mode (read-only)
3. If no → Player Mode (full access)
4. Initialize/load player data
5. **Load global friendship data** from `friends` and `friendedBy` hashes
6. **Update `lastJoined` timestamp** in player hash
7. **Calculate smart spawn position**:
   - If player has `lastKnownPosition`, use it
   - Otherwise, find unoccupied position near default spawn
   - Check 25 positions in spiral pattern to avoid player overlap
8. Load initial chunks around spawn
9. Return existing players in level

**Smart Spawn Algorithm**:

- Checks if any active player is within 5 blocks of candidate position
- Tries up to 25 positions in spiral pattern around default spawn
- All positions kept within same region (360 blocks)
- Falls back to default spawn if all positions occupied
- `lastKnownPosition` always takes precedence if available

---

### `/api/position`

**Purpose**: Update player position and rotation

**Request**: `{ username, position: {x,y,z}, rotation: {x,y} }`  
**Response**: `{ ok: boolean }`

**Server Logic**:

1. Update `connectedClients` map
2. Included in next `broadcastPositionUpdates()` cycle

**Client Throttling**: 1000ms (1 update/second)

---

### `/api/modifications`

**Purpose**: Batch block modifications

**Request**:

```typescript
{
  username: string;
  level: string;
  modifications: Array<{
    position: { x; y; z };
    blockType: number | null;
    action: "place" | "remove";
    clientTimestamp: number;
  }>;
}
```

**Response**:

```typescript
{
  ok: boolean;
  failedAt: number | null;  // Index of first failure
  message?: string;
}
```

**Server Logic**:

1. Validate each modification sequentially
2. Add server timestamp
3. Broadcast each to regional channel immediately
4. Persist all to Redis (batched)
5. Return validation result

**Client Batching**:

- 1-second debounce
- Immediate send at 100 modifications
- Failed batches in localStorage

---

### `/api/chunk-state`

**Purpose**: Request specific chunk data

**Request**: `{ username, level, chunks: Array<{chunkX, chunkZ}> }`  
**Response**: `{ chunks: Array<{chunkX, chunkZ, blocks}>, requestTimestamp, responseTimestamp }`

**Server Logic**:

1. Validate chunk coordinates
2. Use Redis pipelining for batch fetch
3. Parse chunk data from hashes
4. Return all chunks with timestamps

**Usage**: Incremental chunk loading as player explores

---

### `/api/disconnect`

**Purpose**: Clean disconnect notification

**Request**: `{ username, level }`  
**Response**: `{ ok: boolean }`

**Server Logic**:

1. **Save player's current position** from `connectedClients` map to `lastKnownPosition` field
2. Remove from `players:{level}` set
3. Remove from `connectedClients` map
4. Update `lastActive` timestamp
5. Player disappears from next position broadcast

**Position Persistence**:

- Retrieves player's current position from in-memory `connectedClients` map
- Serializes position to JSON: `{"x":100,"y":25,"z":-50}`
- Stores in `lastKnownPosition` field of player hash
- Enables player to spawn at same location on reconnect

---

### `/api/friends/add`

**Purpose**: Add friend globally (enables block removal permissions across all levels)

**Request**: `{ username, level, friendUsername }`  
**Response**: `{ ok, friends[], message? }`

**Server Logic**:

1. Validate: can't add self
2. **Update global `friends` hash**: Add friendUsername to player's friends array
3. **CRITICAL**: **Update global `friendedBy` hash**: Add username to friend's friendedBy array
4. **Broadcast friendship update** to friend if they're online:
   - Query all Redis keys matching `player:{friendUsername}:*`
   - For each level, check if `lastJoined` is within 2 hours
   - If recently active, retrieve `lastKnownPosition`
   - Calculate regional channel from position
   - Broadcast `friendship-added` message to that region
5. Return updated friends list from global hash

**Friendship Broadcast Discovery**:

- Uses `KEYS player:{friendUsername}:*` to find all levels friend has played
- Filters by `lastJoined` timestamp (within 2 hours = potentially active)
- Broadcasts to regional channels based on `lastKnownPosition`
- Enables real-time permission updates without tracking active connections

**Client Pattern**: Optimistic update with confirmation

---

### `/api/friends/remove`

**Purpose**: Remove friend globally (revokes block removal permissions across all levels)

**Request**: `{ username, level, friendUsername }`  
**Response**: `{ ok, friends[], message? }`

**Server Logic**:

1. **Update global `friends` hash**: Remove friendUsername from player's friends array
2. **CRITICAL**: **Update global `friendedBy` hash**: Remove username from friend's friendedBy array
3. **Broadcast friendship update** to friend if they're online:
   - Query all Redis keys matching `player:{friendUsername}:*`
   - For each level, check if `lastJoined` is within 2 hours
   - If recently active, retrieve `lastKnownPosition`
   - Calculate regional channel from position
   - Broadcast `friendship-removed` message to that region
4. Return updated friends list from global hash

**Friendship Broadcast Discovery**:

- Same discovery mechanism as `/api/friends/add`
- Ensures permissions are revoked in real-time
- Friend receives notification even if in different level

**Client Pattern**: Optimistic update with confirmation

---

### `/api/upvote`

**Purpose**: Upvote a builder (increment score)

**Request**: `{ username, level, builderUsername }`  
**Response**: `{ ok, message? }`

**Server Logic** (asynchronous):

1. Validate: can't upvote self
2. Atomic increment: `HINCRBY player:{builder}:{level} score 1`
3. Update leaderboard: `ZINCRBY scores:{level} 1 {builder}`
4. Increment counters: `totalUpvotesReceived`, `totalUpvotesGiven`

**Client Pattern**: Fire-and-forget with client-side rate limiting

---

## WebSocket Broadcasts

### `player-positions`

**Frequency**: Once per second (1000ms interval)

**Format**:

```typescript
{
  type: "player-positions";
  players: Array<{
    username: string;
    position: { x; y; z };
    rotation: { x; y };
  }>;
}
```

**Server Logic**:

- Collects all players in each region
- Only broadcasts if data changed since last broadcast
- Batches all players in region into one message

**Client Logic**:

- Creates player entities for new usernames
- Updates positions for existing players
- Removes entities no longer in array

**Optimization**: Coordinates rounded to 2 decimals

---

### `block-modify`

**Frequency**: Immediate (as modifications occur)

**Format**:

```typescript
{
  type: "block-modify";
  username: string;
  position: {
    x, y, z;
  }
  blockType: number | null;
  action: "place" | "remove";
  clientTimestamp: number;
  serverTimestamp: number;
}
```

**Server Logic**:

- Broadcast immediately after validation
- Sent to regional channel based on block position
- Includes both client and server timestamps

**Client Logic**:

- Ignores own modifications (already applied)
- Checks for conflicts using timestamps
- Applies if no conflict or server wins

---

### `friendship-added`

**Frequency**: On-demand (when a player is added as a friend)

**Channel**: `game:{level}` (game-level channel)

**Format**:

```typescript
{
  type: "friendship-added";
  targetUsername: string; // Who was added as a friend
  byUsername: string; // Who added them
  message: string; // e.g., "alice added you as a friend"
}
```

**Server Logic**:

- Triggered by `/api/friends/add` endpoint
- Uses friendship broadcast discovery mechanism:
  - Queries `player:{targetUsername}:*` keys
  - Filters by `lastJoined` within 2 hours
  - Broadcasts to `game:{level}` channel for each active level
- Sent even if target is in different level

**Client Logic**:

- Checks if `targetUsername` matches current player
- If match, adds `byUsername` to local `friendedBy` array
- Updates block removal permissions immediately
- Enables real-time collaboration

**Broadcast Discovery Rationale**:

- No need to track active WebSocket connections or calculate regional channels
- Works across multiple levels simultaneously
- 2-hour window catches recently active players
- Game-level channel ensures all players in level receive update

---

### `friendship-removed`

**Frequency**: On-demand (when a player is removed as a friend)

**Channel**: `game:{level}` (game-level channel)

**Format**:

```typescript
{
  type: "friendship-removed";
  targetUsername: string; // Who was removed as a friend
  byUsername: string; // Who removed them
  message: string; // e.g., "alice removed you as a friend"
}
```

**Server Logic**:

- Triggered by `/api/friends/remove` endpoint
- Uses same friendship broadcast discovery mechanism as `friendship-added`
- Broadcasts to all potentially active levels

**Client Logic**:

- Checks if `targetUsername` matches current player
- If match, removes `byUsername` from local `friendedBy` array
- Revokes block removal permissions immediately
- Prevents unauthorized block removal

**Permission Update Flow**:

```
1. Alice removes Bob as friend
2. Server updates global hashes
3. Server finds Bob's active levels (lastJoined < 2 hours)
4. Server broadcasts to game:{level} channel for each level
5. Bob's client receives broadcast
6. Bob's friendedBy array updated
7. Bob can no longer remove Alice's blocks
```

---

### `player-count-update`

**Frequency**: On-demand (when players connect/disconnect)

**Channel**: `game:{level}` (game-level channel)

**Format**:

```typescript
{
  type: "player-count-update";
  level: string;
  count: number; // Total players currently online in this level
}
```

**Server Logic**:

- Triggered on `/api/connect` (Player Mode only, not Viewer Mode)
- Triggered on `/api/disconnect`
- Triggered on inactivity cleanup (2-minute timeout)
- Server maintains in-memory `Map<level, count>`
- Broadcasts to `game:{level}` channel

**Client Logic**:

- Updates local player count state
- Displays in UI above builders list: "Players Online: {count}"
- Triggers UI refresh

**Implementation Details**:

- Count stored in server memory (not Redis)
- Incremented when player enters Player Mode
- Decremented when player disconnects or becomes inactive
- Viewer Mode connections do not affect count
- Count resets to 0 on server restart (cleared with `connectedClients` map)

---

## Performance Optimizations

### Redis Operations

**Atomic Increments**:

- `HINCRBY` for scores and counters
- Prevents race conditions
- No read-modify-write cycle

**Pipelining**:

- Batch chunk loading: 25+ chunks in one round-trip
- Batch modification persistence: 100 modifications in one round-trip
- Reduces network latency

**Hash Structures**:

- One hash per chunk (not one key per block)
- Efficient for sparse data
- O(1) access to individual blocks

**Sorted Sets**:

- O(log N) leaderboard queries
- Efficient range queries

### Network Optimization

**Position Broadcasts**:

- Only send if changed
- Rounded coordinates (reduce message size)
- Batched by region

**Modification Batching**:

- Reduce HTTP request count
- Debouncing prevents spam

**Regional Channels**:

- Players only receive nearby updates
- Scales to infinite world

### Client-Side Caching

**LocalStorage**:

- Failed modification batches for retry
- Survives page refresh

**In-Memory**:

- Chunk state buffer (2× draw distance)
- Fast lookups without server round-trip

**Optimistic Updates**:

- Immediate UI feedback
- No waiting for server

---

## Key Design Decisions

### Why Chunk-Based Storage?

**Alternatives Considered**:

- Store every block individually → Too many Redis keys
- Store entire world in one key → Too large, can't load incrementally

**Chosen Solution**: One Redis hash per chunk

- Balances granularity and efficiency
- Matches client rendering chunks
- Enables batch loading

---

### Why Regional Channels?

**Alternatives Considered**:

- One global channel → Too much irrelevant data
- One channel per chunk → Too many subscriptions

**Chosen Solution**: Regions of 15×15 chunks

- Manageable subscription count (~9 per player)
- Sufficient coverage for draw distance
- Scales to infinite world

---

### Why Optimistic Updates?

**Alternatives Considered**:

- Wait for server confirmation → Laggy UX
- Client-authoritative → Cheating, conflicts

**Chosen Solution**: Optimistic with server validation

- Instant feedback for player
- Server is authoritative
- Conflicts resolved with timestamps

---

### Why Batching?

**Alternatives Considered**:

- Send every modification immediately → Too many HTTP requests
- Send on disconnect → Risk of data loss

**Chosen Solution**: Debounced batching with immediate send at 100

- Reduces server load
- Timely updates
- Offline persistence as fallback

---

### Why Global Friendship Storage?

**Alternatives Considered**:

- Per-level friendship storage → Friendships don't persist across levels
- Duplicate friendship data in each level → Data inconsistency, complex sync

**Chosen Solution**: Global Redis hashes (`friends` and `friendedBy`)

- Friendships persist across all levels
- Single source of truth
- Simpler data model
- Players can collaborate in any world
- Reduces Redis storage (one entry vs. one per level)

**Trade-offs**:

- Slightly more complex broadcast discovery (need to find active levels)
- Mitigated by `lastJoined` timestamp filtering

---

### Why friendedBy Array?

**Alternatives Considered**:

- Check friend's friends list on every block removal → Extra Redis query
- Store permissions separately → Data duplication

**Chosen Solution**: Bidirectional friendship storage

- O(1) permission check (array lookup)
- No extra Redis queries
- Consistent with friendship semantics
- Works globally across all levels

---

### Why Position Persistence Only on Disconnect?

**Alternatives Considered**:

- Update Redis on every position update → 10 writes/second per player, excessive load
- Never persist position → Players always spawn at default location
- Periodic snapshots → Complex timing, potential data loss

**Chosen Solution**: Save position only on disconnect/inactivity

- Minimal Redis writes (once per session)
- Players spawn at last location on reconnect
- No performance impact during gameplay
- Acceptable trade-off: unexpected disconnects use smart spawn

**Implementation Details**:

- Position saved in `/api/disconnect` endpoint
- Position saved in inactivity cleanup (2 minutes without updates)
- Stored as JSON in `lastKnownPosition` field
- Retrieved on `/api/connect` for spawn calculation

---

### Why Smart Spawn Position Algorithm?

**Alternatives Considered**:

- Always spawn at default location → Players overlap, poor UX
- Random spawn anywhere → Players scattered, hard to find each other
- Grid-based spawn → Predictable, feels artificial

**Chosen Solution**: Spiral pattern around default spawn

- Checks 25 positions in expanding spiral
- Avoids occupied positions (5-block radius)
- Keeps players near default spawn (within 360 blocks)
- Falls back to default if all positions occupied
- `lastKnownPosition` always takes precedence

**Algorithm Benefits**:

- Players spawn near each other (social gameplay)
- No overlap (smooth experience)
- Deterministic fallback (always works)
- Efficient (checks only connected players, not all Redis data)

**Constraints**:

- All positions within same region (efficient broadcasting)
- Only checks currently connected players (fast calculation)
- Maximum 25 attempts (bounded execution time)

---

## Summary

This architecture balances Devvit platform constraints with multiplayer voxel game requirements:

- **Unidirectional communication** enables optimistic updates and efficient broadcasting
- **Chunk-based storage** supports infinite worlds with manageable data
- **Regional pub/sub** scales multiplayer to any world size
- **Procedural generation** minimizes server storage (only modifications stored)
- **Batching and throttling** reduce server load and network traffic
- **Bidirectional friendship** enables efficient permission checks
- **Client-side optimizations** maintain 60 FPS with thousands of blocks

The result is a responsive, scalable multiplayer experience that works within platform constraints while providing smooth gameplay.

---

## Mock vs Production

### Development (Mock Server)

**Technologies**:

- Express for HTTP endpoints
- WebSocket (`ws` library) for realtime
- Redis for data storage and pub/sub

**Username**: Random (`Player1234`)

**Realtime API**: Mock implementation in `src/client/realtime.ts`

### Production (Reddit/Devvit)

**Technologies**:

- Devvit HTTP handlers
- Devvit realtime API
- Devvit pub/sub system

**Username**: From Reddit context (`context.userId`)

**Realtime API**: Swap with `@devvit/web/client` and `@devvit/web/server`

### Compatibility

The mock interface is a drop-in replacement:

- Same message formats
- Same constraints
- Same channel subscription model
- Easy to swap implementations

---

_Document created: 2025_  
_Last updated: Based on current codebase analysis_
