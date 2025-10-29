# Design Document

## Overview

This design document describes the architecture for refactoring the voxel game server to support both local development (mock server) and production deployment (Reddit/Devvit server). The refactoring extracts shared business logic into reusable endpoint handler modules while maintaining environment-specific implementations for authentication, data access, and real-time communication.

The key architectural principle is **separation of concerns**: endpoint handlers contain pure business logic and receive all dependencies (username, level, redis, realtime) as parameters or globals, while server-specific files handle environment setup and request routing.

## Architecture

### High-Level Structure

```
src/server/
├── mock/
│   └── index.ts          # Mock server (Express + WebSocket + Redis)
├── reddit/
│   └── index.ts          # Reddit server (Devvit APIs)
├── endpoints/
│   ├── connect.ts        # Connection endpoint handler
│   ├── disconnect.ts     # Disconnect endpoint handler
│   ├── position.ts       # Position update handler
│   ├── modifications.ts  # Block modification batch handler
│   ├── chunk-state.ts    # Chunk state request handler
│   ├── friends.ts        # Friend management handlers
│   ├── upvote.ts         # Upvote handler
│   └── helpers.ts        # Shared utility functions
├── types.ts              # Shared type definitions
└── globals.ts            # Global redis and realtime declarations
```

### Data Flow

#### Mock Server Flow

```
Client Request
    ↓
Express Middleware (CORS, JSON parsing)
    ↓
Route Handler (extracts username from query/generates, level from query/default)
    ↓
Endpoint Handler (uses global redis/realtime)
    ↓
Response to Client
    ↓
Broadcast via WebSocket (if applicable)
```

#### Reddit Server Flow

```
Client Request
    ↓
Devvit Middleware (authentication, context injection)
    ↓
Route Handler (extracts username from context.userId, level from context.postId)
    ↓
Endpoint Handler (uses global redis/realtime)
    ↓
Response to Client
    ↓
Broadcast via Devvit Realtime API (if applicable)
```

## Components and Interfaces

### 1. Global Variables (`src/server/globals.ts`)

**Purpose**: Provide global access to redis and realtime interfaces for endpoint handlers.

**Interface**:

```typescript
// Global redis client (set by mock or reddit server)
export let redis: RedisClientType;

// Global realtime interface (set by mock or reddit server)
export let realtime: RealtimeInterface;

// Setter functions (called during server initialization)
export function setRedis(client: RedisClientType): void;
export function setRealtime(rt: RealtimeInterface): void;
```

**Design Rationale**:

- Endpoint handlers need access to redis and realtime without passing them through every function call
- Global variables allow clean separation: server files set them once, endpoint handlers use them
- Type-safe through TypeScript declarations

---

### 2. Shared Types (`src/server/types.ts`)

**Purpose**: Define all shared interfaces, types, and data structures used across both servers.

**Key Type Categories**:

#### Request/Response Types

```typescript
// Connection
export interface InitialConnectionRequest {
  level: string;
}

export interface InitialConnectionResponse {
  mode: "player" | "viewer";
  username: string;
  sessionId: string;
  level: string;
  terrainSeeds: TerrainSeeds;
  spawnPosition: Position;
  initialChunks: Array<ChunkData>;
  players: Array<Player>;
  playerData?: PlayerDataResponse;
  message?: string;
  playerCount?: number;
}

// Position Update
export interface PositionUpdateRequest {
  username: string;
  position: Position;
  rotation: Rotation;
}

// Block Modifications
export interface ModificationBatchRequest {
  username: string;
  level: string;
  modifications: Array<Modification>;
}

export interface ModificationBatchResponse {
  ok: boolean;
  failedAt: number | null;
  message?: string;
}

// Chunk State
export interface ChunkStateRequest {
  username: string;
  level: string;
  chunks: Array<{ chunkX: number; chunkZ: number }>;
}

export interface ChunkStateResponse {
  chunks: Array<ChunkData>;
  requestTimestamp: number;
  responseTimestamp: number;
}

// Friends
export interface AddFriendRequest {
  username: string;
  level: string;
  friendUsername: string;
}

export interface AddFriendResponse {
  ok: boolean;
  friends?: string[];
  message?: string;
}

// Upvote
export interface UpvoteRequest {
  username: string;
  level: string;
  builderUsername: string;
}

export interface UpvoteResponse {
  ok: boolean;
  message?: string;
}
```

#### Data Structure Types

```typescript
export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Rotation {
  x: number;
  y: number;
}

export interface Player {
  username: string;
  position: Position;
  rotation: Rotation;
}

export interface Block {
  x: number;
  y: number;
  z: number;
  type?: number;
  username: string;
  timestamp: number;
  placed: boolean;
  removed?: boolean;
}

export interface PlayerData {
  score: number;
  lastActive: number;
  lastJoined: number;
  lastKnownPosition: Position | null;
  totalUpvotesGiven: number;
  totalUpvotesReceived: number;
}

export interface TerrainSeeds {
  seed: number;
  treeSeed: number;
  stoneSeed: number;
  coalSeed: number;
}

export interface ConnectedClient {
  username: string;
  level: string;
  lastPositionUpdate: number;
  position?: Position;
  rotation?: Rotation;
}
```

#### Broadcast Message Types

```typescript
export interface BlockModificationBroadcast {
  type: "block-modify";
  username: string;
  position: Position;
  blockType: number | null;
  action: "place" | "remove";
  clientTimestamp: number;
  serverTimestamp: number;
}

export interface PositionUpdatesBroadcast {
  type: "player-positions";
  players: Array<Player>;
}

export interface FriendshipAddedMessage {
  type: "friendship-added";
  targetUsername: string;
  byUsername: string;
  message: string;
}

export interface FriendshipRemovedMessage {
  type: "friendship-removed";
  targetUsername: string;
  byUsername: string;
  message: string;
}

export interface PlayerCountUpdateMessage {
  type: "player-count-update";
  level: string;
  count: number;
}
```

---

### 3. Helper Functions (`src/server/endpoints/helpers.ts`)

**Purpose**: Provide shared utility functions used by multiple endpoint handlers.

**Key Functions**:

#### Redis Operations

```typescript
// Player data management
export async function getOrCreatePlayerData(
  username: string,
  level: string
): Promise<PlayerData>;
export async function updatePlayerScore(
  username: string,
  level: string,
  increment: number
): Promise<number>;

// Friendship management (global hashes)
export async function getPlayerFriends(username: string): Promise<string[]>;
export async function getPlayerFriendedBy(username: string): Promise<string[]>;
export async function addGlobalFriend(
  username: string,
  friendUsername: string
): Promise<void>;
export async function removeGlobalFriend(
  username: string,
  friendUsername: string
): Promise<void>;

// Active player tracking
export async function isPlayerActive(
  username: string,
  level: string
): Promise<boolean>;
export async function addActivePlayer(
  username: string,
  level: string
): Promise<void>;
export async function removeActivePlayer(
  username: string,
  level: string
): Promise<void>;

// Terrain seeds
export async function initializeTerrainSeeds(level: string): Promise<void>;
export async function getTerrainSeeds(level: string): Promise<TerrainSeeds>;

// Chunk operations
export async function getChunkBlocks(
  level: string,
  chunkX: number,
  chunkZ: number
): Promise<Array<Block>>;
export async function storeBlockPlacement(
  level: string,
  x: number,
  y: number,
  z: number,
  blockType: number,
  username: string
): Promise<void>;
export async function removeBlock(
  level: string,
  x: number,
  y: number,
  z: number
): Promise<void>;
```

#### Coordinate Calculations

```typescript
export function getChunkCoordinates(
  x: number,
  z: number
): { chunkX: number; chunkZ: number };
export function getRegionalChannelFromPosition(
  level: string,
  position: Position
): string;
export function calculateSpawnPosition(
  level: string,
  connectedClients: Map<string, ConnectedClient>,
  lastKnownPosition?: Position | null
): Position;
```

#### Player Count Management

```typescript
// In-memory player count tracking
export function incrementPlayerCount(level: string): Promise<void>;
export function decrementPlayerCount(level: string): Promise<void>;
export function getPlayerCount(level: string): number;
```

#### Friendship Broadcasting

```typescript
export async function broadcastFriendshipUpdate(
  friendUsername: string,
  action: "added" | "removed",
  byUsername: string
): Promise<void>;
export async function findActiveLevels(
  username: string
): Promise<Array<{ level: string; position: Position }>>;
```

**Design Rationale**:

- Centralizes common logic to avoid duplication
- All functions use global `redis` and `realtime` variables
- Pure functions that don't depend on request/response objects
- Easy to test in isolation

---

### 4. Endpoint Handlers

Each endpoint handler is a pure function that:

1. Receives all necessary parameters (username, level, request data)
2. Uses global `redis` and `realtime` for data access and broadcasting
3. Returns a response object or throws an error
4. Contains no environment-specific code

#### 4.1 Connect Handler (`src/server/endpoints/connect.ts`)

**Function Signature**:

```typescript
export async function handleConnect(
  username: string,
  level: string,
  connectedClients: Map<string, ConnectedClient>
): Promise<InitialConnectionResponse>;
```

**Logic Flow**:

1. Check if player is already active in this level (multi-device detection)
2. If active → return Viewer Mode response
3. If not active → proceed with Player Mode
4. Initialize/load terrain seeds for level
5. Load or create player data
6. Update `lastJoined` timestamp
7. Load global friendship data (friends and friendedBy)
8. Calculate smart spawn position (use lastKnownPosition if available)
9. Calculate initial chunks around spawn position
10. Fetch chunk data from Redis using pipeline
11. Get existing players in level from connectedClients
12. Add player to active players set
13. Add player to connectedClients map
14. Increment player count and broadcast
15. Return Player Mode response with all data

**Key Design Decisions**:

- Multi-device detection uses in-memory `connectedClients` map (not Redis)
- Smart spawn algorithm checks for occupied positions in spiral pattern
- Friendship data loaded from global hashes (not per-level)
- Initial chunks calculated based on spawn position and draw distance

---

#### 4.2 Disconnect Handler (`src/server/endpoints/disconnect.ts`)

**Function Signature**:

```typescript
export async function handleDisconnect(
  username: string,
  level: string,
  connectedClients: Map<string, ConnectedClient>
): Promise<{ ok: boolean }>;
```

**Logic Flow**:

1. Retrieve player's current position from connectedClients map
2. If position exists, serialize to JSON and store in `lastKnownPosition` field
3. Remove player from active players set in Redis
4. Remove player from connectedClients map
5. Decrement player count and broadcast
6. Update `lastActive` timestamp in player data
7. Return success response

**Key Design Decisions**:

- Position persistence only happens on disconnect (not on every position update)
- Enables players to spawn at last location on reconnect
- No explicit broadcast needed (next position update will exclude player)

---

#### 4.3 Position Update Handler (`src/server/endpoints/position.ts`)

**Function Signature**:

```typescript
export async function handlePositionUpdate(
  username: string,
  position: Position,
  rotation: Rotation,
  connectedClients: Map<string, ConnectedClient>
): Promise<{ ok: boolean }>;
```

**Logic Flow**:

1. Find client in connectedClients map by username
2. If not found, return 404 error
3. Update client's position, rotation, and lastPositionUpdate timestamp
4. Return success response

**Key Design Decisions**:

- Position updates are throttled client-side (1 per second)
- Server doesn't persist to Redis (only updates in-memory map)
- Actual broadcasting happens in separate interval (10 times per second)

---

#### 4.4 Modifications Handler (`src/server/endpoints/modifications.ts`)

**Function Signature**:

```typescript
export async function handleModifications(
  username: string,
  level: string,
  modifications: Array<Modification>
): Promise<ModificationBatchResponse>;
```

**Logic Flow**:

1. Log batch size and username
2. Initialize validated modifications array and failedAt index
3. For each modification sequentially:
   - Validate modification (currently always valid)
   - Add server timestamp
   - Calculate regional channel from block position
   - Broadcast immediately to regional channel
   - Add to validated modifications array
   - If validation fails, set failedAt and break
4. Persist all validated modifications to Redis using pipeline
5. Return response with ok status and failedAt index

**Key Design Decisions**:

- Sequential validation ensures order is preserved
- Immediate broadcast per modification (not batched)
- Batch persistence to Redis for efficiency
- Regional channels ensure only nearby players receive updates

---

#### 4.5 Chunk State Handler (`src/server/endpoints/chunk-state.ts`)

**Function Signature**:

```typescript
export async function handleChunkState(
  username: string,
  level: string,
  chunks: Array<{ chunkX: number; chunkZ: number }>
): Promise<ChunkStateResponse>;
```

**Logic Flow**:

1. Log request with chunk count
2. Validate chunk coordinates (within bounds ±10000)
3. Use Redis pipelining to fetch all chunks in one round-trip
4. Parse chunk data from Redis hashes
5. Build response with chunks array and timestamps
6. Log response time
7. Return response

**Key Design Decisions**:

- Pipelining reduces network latency for batch requests
- Coordinate validation prevents malicious requests
- Timestamps enable client-side caching and conflict resolution

---

#### 4.6 Friends Handler (`src/server/endpoints/friends.ts`)

**Function Signatures**:

```typescript
export async function handleAddFriend(
  username: string,
  level: string,
  friendUsername: string
): Promise<AddFriendResponse>;

export async function handleRemoveFriend(
  username: string,
  level: string,
  friendUsername: string
): Promise<RemoveFriendResponse>;
```

**Logic Flow (Add Friend)**:

1. Validate: can't add self as friend
2. Update global `friends` hash (add friendUsername to player's friends array)
3. Update global `friendedBy` hash (add username to friend's friendedBy array)
4. Broadcast friendship update to friend's active levels
5. Get updated friends list from global hash
6. Return success response with friends array

**Logic Flow (Remove Friend)**:

1. Update global `friends` hash (remove friendUsername from player's friends array)
2. Update global `friendedBy` hash (remove username from friend's friendedBy array)
3. Broadcast friendship update to friend's active levels
4. Get updated friends list from global hash
5. Return success response with friends array

**Key Design Decisions**:

- Friendships are global (not per-level) for cross-world collaboration
- Bidirectional storage enables O(1) permission checks
- Broadcast discovery uses `lastJoined` timestamp (within 2 hours)
- Game-level channel ensures all players in level receive update

---

#### 4.7 Upvote Handler (`src/server/endpoints/upvote.ts`)

**Function Signature**:

```typescript
export async function handleUpvote(
  username: string,
  level: string,
  builderUsername: string
): Promise<UpvoteResponse>;
```

**Logic Flow**:

1. Return immediate success response (fire-and-forget pattern)
2. Asynchronously process upvote:
   - Validate: can't upvote self
   - Validate: builder must exist
   - Atomic increment builder's score in Redis hash
   - Update leaderboard sorted set
   - Increment totalUpvotesReceived for builder
   - Increment totalUpvotesGiven for upvoter
   - Log success or error

**Key Design Decisions**:

- Fire-and-forget pattern for snappy UX
- Atomic operations prevent race conditions
- Errors logged but don't affect client (already responded)

---

### 5. Mock Server (`src/server/mock/index.ts`)

**Purpose**: Local development server using Express, WebSocket, and Redis.

**Responsibilities**:

1. Initialize Redis clients (publisher, subscriber, redisStore)
2. Set global `redis` and `realtime` variables
3. Create Express app with CORS and JSON middleware
4. Create HTTP server and WebSocket server
5. Handle WebSocket connections for channel subscriptions
6. Define Express routes that extract username/level and call endpoint handlers
7. Use endpoint path constants from `src/shared/endpoints.ts` for all route definitions
8. Start position broadcasting interval (10 times per second)
9. Start inactivity cleanup interval (every 10 seconds)
10. Listen on port 3000

**Username Extraction**:

```typescript
// Check for username in query params (from localStorage)
const requestedUsername = req.query.username as string | undefined;

// Use requested username if provided, otherwise generate new one
const username = requestedUsername || generateUsername();
```

**Level Extraction**:

```typescript
const { level } = req.body;
const actualLevel = level || "default";
```

**Mock Realtime Interface**:

```typescript
export const realtime = {
  send: async (channel: string, data: any) => {
    await publisher.publish(channel, JSON.stringify(data));
    // Only log block modifications, not position updates
    if (data.type === "block-modify") {
      console.log(`Published to ${channel}:`, data);
    }
  },
};
```

**Route Example**:

```typescript
import { CONNECT_API } from "../../shared/endpoints";

app.post(CONNECT_API, async (req, res) => {
  const { level } = req.body;
  const actualLevel = level || "default";
  const requestedUsername = req.query.username as string | undefined;
  const username = requestedUsername || generateUsername();

  try {
    const response = await handleConnect(
      username,
      actualLevel,
      connectedClients
    );
    res.json(response);
  } catch (error) {
    console.error("Connect error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

**WebSocket Management**:

- Maintains `channelSubscribers` map (channel → Set<WebSocket>)
- Subscribes to Redis channels when first client subscribes
- Forwards Redis pub/sub messages to WebSocket clients
- Unsubscribes from Redis when last client unsubscribes
- Cleans up on WebSocket disconnect

**Position Broadcasting**:

```typescript
setInterval(() => {
  broadcastPositionUpdates(connectedClients).catch((error) => {
    console.error("Error broadcasting position updates:", error);
  });
}, 100); // 100ms = 10 times per second
```

**Inactivity Cleanup**:

```typescript
setInterval(() => {
  cleanupInactivePlayers(connectedClients).catch((error) => {
    console.error("Error cleaning up inactive players:", error);
  });
}, 10000); // 10 seconds
```

---

### 6. Reddit Server (`src/server/reddit/index.ts`)

**Purpose**: Production server using Devvit's platform APIs.

**Responsibilities**:

1. Import Devvit modules (`createServer`, `context`, `redis`, `realtime`, etc.)
2. Set global `redis` to Devvit's redis instance
3. Set global `realtime` to Devvit's realtime instance
4. Create Express app with Devvit middleware
5. Define Express routes that extract username/level from context and call endpoint handlers
6. Use endpoint path constants from `src/shared/endpoints.ts` for all route definitions
7. Create Devvit server and listen on Devvit's port
8. Handle internal endpoints (`/internal/on-app-install`, `/internal/menu/post-create`)

**Username Extraction**:

```typescript
const username = await reddit.getCurrentUsername();
if (!username) {
  return res.status(401).json({ error: "Unauthorized" });
}
```

**Level Extraction**:

```typescript
const { postId } = context;
if (!postId) {
  return res.status(400).json({ error: "postId required" });
}

// Check if terrain seeds exist for this postId
let level = postId;
const seedsExist = await redis.exists(`terrain:seeds:${postId}`);

if (!seedsExist) {
  // Use default level seeds
  const defaultSeedsExist = await redis.exists("terrain:seeds:default");
  if (defaultSeedsExist) {
    level = "default";
  } else {
    // Initialize default seeds
    await initializeTerrainSeeds("default");
    level = "default";
  }
}
```

**Devvit Realtime Interface**:

```typescript
// Devvit provides realtime.send directly
import { realtime } from "@devvit/web/server";

// Set as global
setRealtime(realtime);
```

**Route Example**:

```typescript
import { CONNECT_API } from "../../shared/endpoints";

router.post(CONNECT_API, async (req, res) => {
  const { postId } = context;
  if (!postId) {
    return res.status(400).json({ error: "postId required" });
  }

  const username = await reddit.getCurrentUsername();
  if (!username) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Determine level (postId or default)
  let level = postId;
  const seedsExist = await redis.exists(`terrain:seeds:${postId}`);
  if (!seedsExist) {
    const defaultSeedsExist = await redis.exists("terrain:seeds:default");
    level = defaultSeedsExist ? "default" : postId;
    if (!defaultSeedsExist) {
      await initializeTerrainSeeds("default");
      level = "default";
    }
  }

  try {
    const response = await handleConnect(username, level, connectedClients);
    res.json(response);
  } catch (error) {
    console.error("Connect error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

**Internal Endpoints**:

- `/internal/on-app-install`: Creates initial post when app is installed
- `/internal/menu/post-create`: Creates new post from menu action

**No WebSocket Management**:

- Devvit handles WebSocket connections automatically
- Server only calls `realtime.send()` to broadcast
- No need for subscription management or cleanup

**No Position Broadcasting Interval**:

- Position broadcasting logic moved to shared helper
- Called from endpoint handlers or separate service
- Devvit may handle this differently (TBD based on platform capabilities)

---

## Data Models

### Redis Key Patterns

All Redis keys follow the existing patterns from the mock server:

#### Player Data

- **Key**: `player:{username}:{level}`
- **Type**: Hash
- **Fields**: score, lastActive, lastJoined, lastKnownPosition, totalUpvotesGiven, totalUpvotesReceived
- **TTL**: 7 days

#### Active Players

- **Key**: `players:{level}`
- **Type**: Set
- **Members**: Active player usernames

#### Chunk Data

- **Key**: `level:{level}:chunk:{chunkX}:{chunkZ}`
- **Type**: Hash
- **Hash Keys**: `block:{x}:{y}:{z}`
- **Hash Values**: JSON string with block data

#### Terrain Seeds

- **Key**: `terrain:seeds:{level}`
- **Type**: String (JSON)
- **Value**: TerrainSeeds object

#### Leaderboard

- **Key**: `scores:{level}`
- **Type**: Sorted Set
- **Members**: Player usernames
- **Scores**: Player scores

#### Global Friendships

- **Key**: `friends`
- **Type**: Hash
- **Hash Keys**: Username
- **Hash Values**: JSON array of friend usernames

- **Key**: `friendedBy`
- **Type**: Hash
- **Hash Keys**: Username
- **Hash Values**: JSON array of usernames who friended this player

### In-Memory Data Structures

#### Connected Clients Map

```typescript
const connectedClients = new Map<string, ConnectedClient>();
```

- Tracks all active players across all levels
- Used for multi-device detection
- Used for position broadcasting
- Cleared on server restart

#### Level Player Counts Map

```typescript
const levelPlayerCounts = new Map<string, number>();
```

- Tracks player count per level
- Used for player count broadcasts
- Cleared on server restart

#### Channel Subscribers Map (Mock Server Only)

```typescript
const channelSubscribers = new Map<string, Set<WebSocket>>();
```

- Tracks WebSocket clients subscribed to each channel
- Used for Redis pub/sub forwarding
- Cleared on server restart

---

## Error Handling

### Error Response Format

All endpoints return consistent error responses:

```typescript
{
  ok: false,
  message: "Descriptive error message"
}
```

### HTTP Status Codes

- **200 OK**: Successful request
- **400 Bad Request**: Invalid input or validation failure
- **401 Unauthorized**: Missing or invalid authentication (Reddit server only)
- **404 Not Found**: Resource not found (e.g., player not connected)
- **500 Internal Server Error**: Unexpected server error

### Error Logging

All errors are logged with sufficient context:

```typescript
console.error(`Error in handleConnect for ${username}:`, error);
```

### Redis Error Handling

Redis operations use try-catch with retry logic where appropriate:

```typescript
try {
  await redis.hSet(key, field, value);
} catch (error) {
  console.error(`Redis operation failed:`, error);
  throw new Error("Database operation failed");
}
```

---

## Testing Strategy

### Unit Testing

**Endpoint Handlers**:

- Test each endpoint handler in isolation
- Mock global `redis` and `realtime` interfaces
- Test success cases and error cases
- Test validation logic

**Helper Functions**:

- Test coordinate calculations
- Test spawn position algorithm
- Test Redis key generation
- Test data transformations

### Integration Testing

**Mock Server**:

- Test full request/response cycle
- Test WebSocket subscription and broadcasting
- Test Redis persistence
- Test multi-client scenarios

**Reddit Server**:

- Test context extraction
- Test Devvit API integration
- Test realtime broadcasting
- Test internal endpoints

### Manual Testing

**Local Development**:

- Run mock server with `npm run dev`
- Test with multiple browser tabs (multi-device)
- Test all endpoints with Postman or curl
- Verify Redis data with redis-cli

**Production Testing**:

- Deploy to Reddit with `npm run launch`
- Test in Devvit playtest environment
- Verify authentication and context
- Test multiplayer with multiple Reddit accounts

---

## Performance Considerations

### Redis Optimization

- **Pipelining**: Batch chunk loading and modification persistence
- **Atomic Operations**: Use HINCRBY and ZINCRBY for scores
- **Hash Structures**: One hash per chunk (not one key per block)
- **TTL**: 7-day expiration on player data

### Network Optimization

- **Position Throttling**: Client sends max 1 update/second
- **Position Broadcasting**: Server broadcasts 10 times/second
- **Modification Batching**: Client batches modifications (1s debounce or 100 mods)
- **Regional Channels**: Players only receive nearby updates

### Memory Optimization

- **In-Memory Maps**: Only store active players (not all players)
- **Cleanup Intervals**: Remove inactive players every 10 seconds
- **Sparse Storage**: Only store block modifications (not entire world)

---

## Security Considerations

### Authentication

**Mock Server**:

- No authentication (development only)
- Username from localStorage or generated
- Not suitable for production

**Reddit Server**:

- Automatic authentication via Devvit context
- Username from `context.userId` (verified by Reddit)
- No manual authentication needed

### Input Validation

- Validate chunk coordinates (within bounds)
- Validate message length (max 200 characters)
- Validate friend username (not self)
- Validate block positions (reasonable bounds)

### Rate Limiting

- Client-side throttling for position updates (1/second)
- Client-side debouncing for modifications (1 second)
- Server-side validation for batch sizes

### Data Isolation

- Level-scoped data (players can't access other levels' data)
- Username-scoped data (players can't modify other players' data)
- Permission checks for block removal (friendedBy array)

---

## Migration Strategy

### Phase 1: Extract Shared Code

1. Create `src/server/types.ts` with all shared types
2. Create `src/server/globals.ts` with global variable declarations
3. Create `src/server/endpoints/helpers.ts` with utility functions
4. Extract helper functions from mock server (no changes to logic)

### Phase 2: Extract Endpoint Handlers

1. Create endpoint handler files in `src/server/endpoints/`
2. Extract logic from mock server routes
3. Modify handlers to use global `redis` and `realtime`
4. Modify handlers to receive username and level as parameters

### Phase 3: Refactor Mock Server

1. Update mock server to set global variables
2. Update routes to call endpoint handlers
3. Remove extracted code
4. Test all endpoints

### Phase 4: Implement Reddit Server

1. Create `src/server/reddit/index.ts`
2. Set up Devvit imports and initialization
3. Implement context extraction logic
4. Implement routes that call endpoint handlers
5. Test in Devvit playtest environment

### Phase 5: Testing and Validation

1. Test mock server locally
2. Test Reddit server in playtest
3. Verify identical behavior
4. Deploy to production

---

## Future Enhancements

### Potential Improvements

1. **Position Broadcasting Optimization**: Move to separate service or worker
2. **Redis Connection Pooling**: Improve Redis performance under load
3. **Metrics and Monitoring**: Add performance tracking and error monitoring
4. **Rate Limiting**: Server-side rate limiting for API endpoints
5. **Caching**: Add Redis caching for frequently accessed data
6. **Horizontal Scaling**: Support multiple server instances with shared state

### Devvit Platform Features

1. **Scheduled Jobs**: Use Devvit's scheduler for cleanup tasks
2. **Key-Value Store**: Explore Devvit's KV store as alternative to Redis
3. **Pub/Sub Optimization**: Leverage Devvit's pub/sub features
4. **Context Enrichment**: Use additional Devvit context data (subreddit, user flair, etc.)

---

## Conclusion

This design provides a clean separation between environment-specific code (mock vs Reddit) and shared business logic (endpoint handlers). The use of global variables for `redis` and `realtime` enables endpoint handlers to remain pure and environment-agnostic, while server-specific files handle initialization and request routing.

The architecture maintains backward compatibility with existing clients, preserves all Redis data structures, and enables rapid local development while supporting production deployment to Reddit's Devvit platform.
