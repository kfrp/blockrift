# Client-Server API Architecture

This document describes the mock interface that simulates Reddit's realtime API for local development.

## Overview

The architecture follows Reddit/Devvit's realtime API constraints:

- **Client → Server**: HTTP only (POST requests)
- **Server → Client**: WebSocket broadcasts only (read-only for client)

## HTTP Endpoints (Client → Server)

### 1. `/api/connect`

**Purpose**: Initial connection, get game state and player identity

**Request**:

```typescript
POST / api / connect;
{
  level: string; // World/level identifier (e.g., "default")
}
```

**Response**:

```typescript
{
  username: string; // Assigned player username
  sessionId: string; // Session identifier (same as username)
  level: string; // Level identifier
  terrainSeeds: {
    seed: number;
    treeSeed: number;
    stoneSeed: number;
    coalSeed: number;
  }
  spawnPosition: {
    x: number;
    y: number;
    z: number;
  }
  initialChunks: Array<{
    chunkX: number;
    chunkZ: number;
    blocks: Array<{
      x: number;
      y: number;
      z: number;
      type: number;
      username: string;
      timestamp: number;
      placed: boolean;
      removed?: boolean;
    }>;
  }>;
  players: Array<{
    username: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }>;
}
```

**Server Actions**:

- Generates unique username
- Initializes terrain seeds for level
- Loads initial chunks around spawn position
- Adds player to `connectedClients` map
- Returns existing players in the same level

---

### 2. `/api/position`

**Purpose**: Update player position and rotation

**Request**:

```typescript
POST /api/position
{
  username: string
  position: { x: number, y: number, z: number }
  rotation: { x: number, y: number }
}
```

**Response**:

```typescript
{
  ok: boolean;
}
```

**Server Actions**:

- Updates player position in `connectedClients` map
- Position is broadcast to regional channels via `broadcastPositionUpdates()` (runs 10x/second)

**Client Behavior**:

- Called every 100ms when position or rotation changes
- Throttled to avoid unnecessary updates

---

### 3. `/api/modifications`

**Purpose**: Batch block modifications (place/remove)

**Request**:

```typescript
POST / api / modifications;
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
  ok: boolean
  failedAt: number | null  // Index where validation failed, null if all succeeded
  message?: string
}
```

**Server Actions**:

- Validates each modification sequentially
- Adds server timestamp to each modification
- Broadcasts each modification to appropriate regional channel immediately
- Persists all validated modifications to Redis in a batch
- Returns validation result

**Client Behavior**:

- Batches modifications with 1-second debounce
- Sends immediately when batch reaches 100 modifications
- Stores failed batches in localStorage for retry

---

### 4. `/api/disconnect`

**Purpose**: Notify server of client disconnect

**Request**:

```typescript
POST / api / disconnect;
{
  username: string;
  level: string;
}
```

**Response**:

```typescript
{
  ok: boolean;
}
```

**Server Actions**:

- Removes player from `connectedClients` map
- Player naturally disappears from next position broadcast

**Client Behavior**:

- Called when player disconnects or closes game
- Ensures clean removal from server state

---

### 5. `/api/chunk-state`

**Purpose**: Request chunk data for specific chunks

**Request**:

```typescript
POST / api / chunk - state;
{
  username: string;
  level: string;
  chunks: Array<{ chunkX: number; chunkZ: number }>;
}
```

**Response**:

```typescript
{
  chunks: Array<{
    chunkX: number;
    chunkZ: number;
    blocks: Array<{
      x: number;
      y: number;
      z: number;
      type: number;
      username: string;
      timestamp: number;
      placed: boolean;
      removed?: boolean;
    }>;
  }>;
  requestTimestamp: number;
  responseTimestamp: number;
}
```

**Server Actions**:

- Validates chunk coordinates
- Uses Redis pipelining to fetch multiple chunks efficiently
- Returns block data for each requested chunk

---

## WebSocket Broadcasts (Server → Client)

### Connection

```typescript
const connection = await connectRealtime({
  channel: string,              // e.g., "region:default:0:0"
  onConnect?: (channel: string) => void,
  onDisconnect?: (channel: string) => void,
  onMessage?: (data: any) => void
});

// Later, to unsubscribe:
await connection.disconnect();
```

**Implementation Details**:

- Single shared WebSocket connection for all channels
- Each `connectRealtime()` call subscribes to a specific channel
- Messages are routed to appropriate handlers based on channel
- `disconnect()` unsubscribes from the channel

---

### Broadcast Message Types

#### 1. `player-positions`

**Frequency**: 10 times per second (every 100ms)

**Format**:

```typescript
{
  type: "player-positions";
  players: Array<{
    username: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }>;
}
```

**Purpose**:

- Contains all players currently in a specific region
- Client automatically creates/removes player entities based on who's in the array
- Only broadcasts if player data has changed since last broadcast

**Client Behavior**:

- Creates player entities for new usernames
- Updates positions for existing players
- Removes player entities that are no longer in the array

---

#### 2. `block-modify`

**Frequency**: Immediate (as modifications occur)

**Format**:

```typescript
{
  type: "block-modify"
  username: string
  position: { x: number, y: number, z: number }
  blockType: number | null
  action: "place" | "remove"
  clientTimestamp: number
  serverTimestamp: number
}
```

**Purpose**:

- Broadcasts block modifications to all clients in the same region
- Includes server timestamp for conflict resolution

**Client Behavior**:

- Ignores modifications from self (already applied locally)
- Checks for conflicts with local modifications
- Applies modification to terrain if no conflict or server timestamp is newer

---

## Regional Channel System

### Channel Naming

```
region:{level}:{regionX}:{regionZ}
```

Example: `region:default:0:0`

### Region Calculation

```typescript
const CHUNK_SIZE = 24;
const REGION_SIZE = 15; // 15 chunks per region

// From world position
const chunkX = Math.floor(position.x / CHUNK_SIZE);
const chunkZ = Math.floor(position.z / CHUNK_SIZE);
const regionX = Math.floor(chunkX / REGION_SIZE);
const regionZ = Math.floor(chunkZ / REGION_SIZE);
```

### Subscription Management

- Client calculates required regions based on player position and draw distance
- Subscribes to new regions as player moves
- Unsubscribes from regions that are too far away
- Each region has its own `connectRealtime()` connection

---

## Data Flow Examples

### Player Connects

1. Client: `POST /api/connect` with level
2. Server: Generates username, loads initial chunks, returns game state
3. Client: Calculates spawn region channels
4. Client: Calls `connectRealtime()` for each region
5. Server: Adds WebSocket to channel subscribers
6. Server: Sends `subscribed` confirmation
7. Client: Starts receiving `player-positions` and `block-modify` broadcasts

### Player Moves

1. Client: Detects position change
2. Client: `POST /api/position` with new position
3. Server: Updates position in `connectedClients`
4. Server: Next `broadcastPositionUpdates()` includes new position
5. Server: Broadcasts to regional channel
6. Other clients: Receive `player-positions` and update player entity

### Player Places Block

1. Client: Applies block locally
2. Client: Adds to modification batch
3. Client: After 1 second or 100 modifications, `POST /api/modifications`
4. Server: Validates, adds server timestamp
5. Server: Broadcasts to regional channel immediately
6. Server: Persists to Redis
7. Other clients: Receive `block-modify` and apply to terrain

### Player Changes Regions

1. Client: Detects position crossed region boundary
2. Client: Calculates new required regions
3. Client: Calls `connection.disconnect()` for old regions
4. Client: Calls `connectRealtime()` for new regions
5. Server: Updates channel subscriptions
6. Client: Receives broadcasts from new regions

### Player Disconnects

1. Client: `POST /api/disconnect`
2. Server: Removes from `connectedClients`
3. Server: Next `broadcastPositionUpdates()` excludes player
4. Other clients: Receive `player-positions` without player, remove entity
5. Client: Calls `connection.disconnect()` for all regions
6. Server: Removes WebSocket from all channel subscribers

---

## Mock vs Production Differences

### Development (Mock)

- Uses WebSocket (`ws` library) for realtime
- Uses Redis pub/sub for channel broadcasts
- Uses Express for HTTP endpoints
- Generates random usernames

### Production (Reddit/Devvit)

- Uses Devvit's realtime API
- Uses Devvit's pub/sub system
- Uses Devvit's HTTP handlers
- Extracts username from Reddit context

### Compatibility

The mock interface is designed to be a drop-in replacement for Reddit's API:

- Same message formats
- Same constraints (HTTP for client→server, broadcasts for server→client)
- Same channel subscription model
- Easy to swap implementations without changing game logic
