# Player Mode and Persistence Design Document

## Overview

This design document outlines the architecture for implementing player mode management, persistence, and social features in the multiplayer voxel game. The system builds on top of the existing chunk-state-synchronization architecture and introduces:

1. **Player Mode Management**: Two distinct modes (Player and Viewer) with different capabilities
2. **Player Persistence**: Redis-based storage for player data including scores and friends
3. **Multi-Device Detection**: Preventing duplicate sessions from the same user
4. **Block Ownership Protection**: Friend-based permissions for block removal
5. **Builder Recognition**: UI for displaying and highlighting builders' contributions
6. **Upvote System**: Social recognition with client-side rate limiting

### Key Design Principles

1. **Consistency with Existing Architecture**: Follow the same patterns as chunk-state-synchronization
2. **Redis-First Persistence**: All player data stored in Redis with efficient data structures
3. **Client-Side Rate Limiting**: Prevent upvote abuse without server overhead
4. **Graceful Degradation**: Viewer Mode as fallback for multi-device scenarios
5. **Minimal Server Changes**: Leverage existing endpoints where possible
6. **Friend-Based Collaboration**: Enable teamwork through friend permissions

## Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  Player Connection Flow                      │
│                                                              │
│  1. Client sends POST /api/connect with level                │
│  2. Server checks if username exists in players:${level}     │
│  3a. If exists: Return mode="viewer"                         │
│  3b. If not exists:                                          │
│      - Add username to players:${level} set                  │
│      - Initialize/load player:${username}:${level} data      │
│      - Return mode="player" with player data                 │
│  4. Client enters appropriate mode                           │
│  5. If Player Mode: Start sending position updates           │
│  6. If Viewer Mode: Only receive broadcasts, no updates      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  Block Removal Flow (Player Mode)            │
│                                                              │
│  1. Player clicks to remove block                            │
│  2. Client checks if block is custom                         │
│  3. If not custom: Allow removal (proceed to step 7)         │
│  4. If custom: Check block owner                             │
│  5. If owner is self or in friends list: Allow removal       │
│  6. If owner not in friends: Block removal, show message     │
│  7. Apply optimistic update                                  │
│  8. Add to modification batch                                │
│  9. Send batch to server (existing flow)                     │
└─────────────────────────────────────────────────────────────┘
```

┌─────────────────────────────────────────────────────────────┐
│ Builder Recognition Flow │
│ │
│ 1. Client loads chunks in current region │
│ 2. Extract unique usernames from custom blocks │
│ 3. Filter out current player's username │
│ 4. Display top 10 builders by block count │
│ 5. User clicks builder name │
│ 6. Highlight all blocks by that builder in view │
│ 7. User clicks upvote icon │
│ 8. Check localStorage for upvote cooldown │
│ 9. If allowed: Send POST /api/upvote │
│ 10. Server increments builder's score in Redis │
│ 11. Return updated score │
│ 12. Update UI with new score │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Player Inactivity Cleanup │
│ │
│ 1. Server tracks lastPositionUpdate for each player │
│ 2. Every 10 seconds, check for stale players │
│ 3. If player hasn't updated in 2 minutes: │
│ - Remove from players:${level} set │
│ - Remove from connectedClients map │
│ - Natural removal from position broadcasts │
│ 4. Client-side: Player disappears from other players' views │
└─────────────────────────────────────────────────────────────┘

````

## Components and Interfaces

### 1. Server-Side Components

#### 1.1 Redis Data Structures

```typescript
// Active players in a level (Redis Set)
// Key: players:${level}
// Value: Set of usernames
// TTL: None (manually managed)
// Purpose: Track who is actively playing in Player Mode

// Individual player data (Redis Hash)
// Key: player:${username}:${level}
// Fields:
//   - score: number (integer)
//   - friends: string (JSON array of usernames this player added)
//   - friendedBy: string (JSON array of usernames who added this player)
//   - lastActive: number (timestamp)
//   - totalUpvotesGiven: number
//   - totalUpvotesReceived: number
// TTL: 7 days (refreshed on activity)
// Note: Position is NOT stored in Redis, only in memory for performance

// Player scores sorted set (for leaderboards)
// Key: scores:${level}
// Value: Sorted set of username -> score
// Purpose: Efficient score-based queries
````

#### 1.2 Enhanced Connection Handler

```typescript
interface ConnectRequest {
  level: string;
  // In production, username extracted from Reddit context
}

interface ConnectResponse {
  mode: "player" | "viewer";
  username: string;
  sessionId: string;
  level: string;
  terrainSeeds: TerrainSeeds;
  spawnPosition: Position;
  initialChunks: ChunkStateData[];
  players: PlayerData[];
  playerData?: {
    // Only present in Player Mode
    score: number;
    friends: string[]; // Users this player has added as friends
    friendedBy: string[]; // Users who have added this player as friend (for block removal validation)
  };
  message?: string; // Explanation for Viewer Mode
}
```

// Enhanced /api/connect endpoint
app.post("/api/connect", async (req, res) => {
const { level } = req.body;
const actualLevel = level || "default";
const username = assignUsername(); // From context in production

console.log(`Connection request from ${username} for level "${actualLevel}"`);

// Check if player is already active in this level
const isActive = await redisStore.sIsMember(
`players:${actualLevel}`,
username
);

if (isActive) {
// Player already active - enter Viewer Mode
console.log(`${username} already active, entering Viewer Mode`);

    // Still load terrain and initial chunks for viewing
    await initializeTerrainSeeds(actualLevel);
    const terrainSeeds = await getTerrainSeeds(actualLevel);
    const spawnPosition = { x: 0, y: 20, z: 0 };
    const initialChunks = await loadInitialChunks(actualLevel, spawnPosition);
    const players = getActivePlayers(actualLevel);

    return res.json({
      mode: "viewer",
      username,
      sessionId: `${username}_viewer_${Date.now()}`,
      level: actualLevel,
      terrainSeeds,
      spawnPosition,
      initialChunks,
      players,
      message: "You are already playing from another device. Entering Viewer Mode.",
    });

}

// Player not active - enter Player Mode
console.log(`${username} entering Player Mode`);

// Add to active players set
await redisStore.sAdd(`players:${actualLevel}`, username);

// Initialize or load player data
const playerData = await getOrCreatePlayerData(username, actualLevel);

// Add to connected clients
const client: ConnectedClient = {
username,
level: actualLevel,
lastPositionUpdate: Date.now(),
position: { x: 0, y: 20, z: 0 },
rotation: { x: 0, y: 0 },
};
connectedClients.set(username, client);

// Load terrain and initial chunks
await initializeTerrainSeeds(actualLevel);
const terrainSeeds = await getTerrainSeeds(actualLevel);
const spawnPosition = { x: 0, y: 20, z: 0 };
const initialChunks = await loadInitialChunks(actualLevel, spawnPosition);
const players = getActivePlayers(actualLevel);

res.json({
mode: "player",
username,
sessionId: username,
level: actualLevel,
terrainSeeds,
spawnPosition,
initialChunks,
players,
playerData: {
score: playerData.score,
friends: playerData.friends,
},
});
});

// Get or create player data
async function getOrCreatePlayerData(
username: string,
level: string
): Promise<{ score: number; friends: string[] }> {
const key = `player:${username}:${level}`;
const exists = await redisStore.exists(key);

if (!exists) {
// Initialize new player
await redisStore.hSet(key, {
score: "0",
friends: JSON.stringify([]),
lastActive: Date.now().toString(),
totalUpvotesGiven: "0",
totalUpvotesReceived: "0",
});

    // Add to scores sorted set
    await redisStore.zAdd(`scores:${level}`, { score: 0, value: username });

    // Set TTL to 7 days
    await redisStore.expire(key, 7 * 24 * 60 * 60);

    console.log(`Initialized player data for ${username} in level ${level}`);

    return { score: 0, friends: [] };

}

// Load existing player data
const data = await redisStore.hGetAll(key);

// Refresh TTL
await redisStore.expire(key, 7 _ 24 _ 60 \* 60);

return {
score: parseInt(data.score || "0", 10),
friends: JSON.parse(data.friends || "[]"),
};
}

```

```

#### 1.3 Enhanced Disconnect Handler

```typescript
// Enhanced /api/disconnect endpoint
app.post("/api/disconnect", async (req, res) => {
  const { username, level } = req.body;

  console.log(`Disconnect request from ${username} for level "${level}"`);

  // Remove from active players set
  await redisStore.sRem(`players:${level}`, username);

  // Remove from connected clients
  connectedClients.delete(username);

  // Update last active timestamp
  const playerKey = `player:${username}:${level}`;
  await redisStore.hSet(playerKey, "lastActive", Date.now().toString());

  console.log(`Removed ${username} from active players in level ${level}`);

  res.json({ ok: true });
});

// Enhanced inactivity cleanup (runs every 10 seconds)
async function cleanupInactivePlayers(): Promise<void> {
  const TIMEOUT_MS = 120000; // 2 minutes
  const now = Date.now();

  const staleUsernames: string[] = [];

  for (const [username, client] of connectedClients.entries()) {
    if (now - client.lastPositionUpdate > TIMEOUT_MS) {
      staleUsernames.push(username);
    }
  }

  for (const username of staleUsernames) {
    const client = connectedClients.get(username);
    if (!client) continue;

    console.log(
      `Removing inactive player ${username} from level ${client.level}`
    );

    // Remove from active players set
    await redisStore.sRem(`players:${client.level}`, username);

    // Remove from connected clients
    connectedClients.delete(username);

    // Update last active timestamp
    const playerKey = `player:${username}:${client.level}`;
    await redisStore.hSet(playerKey, "lastActive", now.toString());
  }
}

// Start cleanup interval
setInterval(() => {
  cleanupInactivePlayers().catch((error) => {
    console.error("Error cleaning up inactive players:", error);
  });
}, 10000); // Every 10 seconds
```

#### 1.4 Friend Management Endpoints

```typescript
interface AddFriendRequest {
  username: string;
  level: string;
  friendUsername: string;
}

interface AddFriendResponse {
  ok: boolean;
  friends: string[];
  message?: string;
}

// Add friend endpoint (fire-and-forget with async processing)
app.post("/api/friends/add", async (req, res) => {
  const { username, level, friendUsername } = req.body as AddFriendRequest;

  console.log(`${username} attempting to add friend ${friendUsername}`);

  // Immediate response for snappy UX
  res.json({ ok: true, message: "Friend request processing" });

  // Async processing (don't await) - follows processFriendAddition logic
  processFriendAddition(username, level, friendUsername).catch((error) => {
    console.error("Failed to process friend addition:", error);
    // Send correction message to client if validation fails
    broadcastFriendshipError(username, friendUsername, level);
  });
});

// IMPORTANT: This is the correct implementation that updates BOTH players
async function processFriendAddition(
  username: string,
  level: string,
  friendUsername: string
): Promise<void> {
  // Validate: can't add self
  if (username === friendUsername) {
    throw new Error("Cannot add yourself as friend");
  }

  const playerKey = `player:${username}:${level}`;
  const friendKey = `player:${friendUsername}:${level}`;

  // Ensure friend's player data exists (create if needed)
  const friendExists = await redisStore.exists(friendKey);
  if (!friendExists) {
    // Create minimal player data for friend who hasn't connected yet
    await redisStore.hSet(friendKey, {
      score: "0",
      friends: JSON.stringify([]),
      friendedBy: JSON.stringify([]),
      lastActive: Date.now().toString(),
      totalUpvotesGiven: "0",
      totalUpvotesReceived: "0",
    });

    // Add to scores sorted set
    await redisStore.zAdd(`scores:${level}`, {
      score: 0,
      value: friendUsername,
    });

    // Set TTL to 7 days
    await redisStore.expire(friendKey, 7 * 24 * 60 * 60);

    console.log(
      `Created minimal player data for ${friendUsername} (not yet connected)`
    );
  }

  // Update player's friends list
  const playerFriendsData = await redisStore.hGet(playerKey, "friends");
  const playerFriends: string[] = playerFriendsData
    ? JSON.parse(playerFriendsData)
    : [];

  if (!playerFriends.includes(friendUsername)) {
    playerFriends.push(friendUsername);
    await redisStore.hSet(playerKey, "friends", JSON.stringify(playerFriends));
  }

  // CRITICAL: Update friend's friendedBy list (enables block removal)
  const friendedByData = await redisStore.hGet(friendKey, "friendedBy");
  const friendedBy: string[] = friendedByData ? JSON.parse(friendedByData) : [];

  if (!friendedBy.includes(username)) {
    friendedBy.push(username);
    await redisStore.hSet(friendKey, "friendedBy", JSON.stringify(friendedBy));
  }

  // IMPORTANT: Broadcast to friend if online so they can remove blocks immediately
  const friendClient = connectedClients.get(friendUsername);
  if (friendClient && friendClient.level === level) {
    const position = friendClient.position || { x: 0, y: 20, z: 0 };
    const channel = getRegionalChannelFromPosition(level, position);

    await realtime.send(channel, {
      type: "friendship-update",
      targetUsername: friendUsername,
      friendedBy: friendedBy,
      message: `${username} added you as a friend. You can now remove their blocks!`,
    });
  }

  console.log(
    `${username} added ${friendUsername} as friend (both records updated)`
  );
}

async function broadcastFriendshipError(
  username: string,
  friendUsername: string,
  level: string
): Promise<void> {
  const client = connectedClients.get(username);
  if (client && client.level === level) {
    const position = client.position || { x: 0, y: 20, z: 0 };
    const channel = getRegionalChannelFromPosition(level, position);

    await realtime.send(channel, {
      type: "friendship-error",
      targetUsername: username,
      friendUsername: friendUsername,
      message: "Failed to add friend. Player may not exist.",
    });
  }
}
```

interface RemoveFriendRequest {
username: string;
level: string;
friendUsername: string;
}

interface RemoveFriendResponse {
ok: boolean;
friends: string[];
message?: string;
}

// Remove friend endpoint (fire-and-forget with async processing)
app.post("/api/friends/remove", async (req, res) => {
const { username, level, friendUsername } = req.body as RemoveFriendRequest;

console.log(`${username} attempting to remove friend ${friendUsername}`);

// Immediate response
res.json({ ok: true, message: "Friend removal processing" });

// Async processing
processFriendRemoval(username, level, friendUsername).catch((error) => {
console.error("Failed to process friend removal:", error);
});
});

// IMPORTANT: This updates BOTH players' records
async function processFriendRemoval(
username: string,
level: string,
friendUsername: string
): Promise<void> {
const playerKey = `player:${username}:${level}`;
const friendKey = `player:${friendUsername}:${level}`;

// Remove from player's friends list
const playerFriendsData = await redisStore.hGet(playerKey, "friends");
const playerFriends: string[] = playerFriendsData ? JSON.parse(playerFriendsData) : [];
const updatedPlayerFriends = playerFriends.filter((f) => f !== friendUsername);

if (updatedPlayerFriends.length !== playerFriends.length) {
await redisStore.hSet(playerKey, "friends", JSON.stringify(updatedPlayerFriends));
}

// CRITICAL: Remove from friend's friendedBy list (revokes block removal permission)
const friendedByData = await redisStore.hGet(friendKey, "friendedBy");
const friendedBy: string[] = friendedByData ? JSON.parse(friendedByData) : [];
const updatedFriendedBy = friendedBy.filter((f) => f !== username);

if (updatedFriendedBy.length !== friendedBy.length) {
await redisStore.hSet(friendKey, "friendedBy", JSON.stringify(updatedFriendedBy));
}

// IMPORTANT: Broadcast to friend if online so they lose block removal permission immediately
const friendClient = connectedClients.get(friendUsername);
if (friendClient && friendClient.level === level) {
const position = friendClient.position || { x: 0, y: 20, z: 0 };
const channel = getRegionalChannelFromPosition(level, position);

await realtime.send(channel, {
type: "friendship-update",
targetUsername: friendUsername,
friendedBy: updatedFriendedBy,
message: `${username} removed you as a friend.`,
});
}

console.log(`${username} removed ${friendUsername} from friends (both records updated)`);
}

````

#### 1.5 Upvote Endpoint

```typescript
interface UpvoteRequest {
  username: string; // The upvoter
  level: string;
  builderUsername: string; // The builder being upvoted
}

interface UpvoteResponse {
  ok: boolean;
  newScore: number;
  message?: string;
}

// Upvote endpoint
app.post("/api/upvote", async (req, res) => {
  const { username, level, builderUsername } = req.body as UpvoteRequest;

  console.log(`${username} upvoting ${builderUsername} in level ${level}`);

  // Validate: can't upvote self
  if (username === builderUsername) {
    return res.json({
      ok: false,
      newScore: 0,
      message: "You cannot upvote yourself",
    });
  }

  // Validate: builder must exist
  const builderKey = `player:${builderUsername}:${level}`;
  const builderExists = await redisStore.exists(builderKey);

  if (!builderExists) {
    return res.json({
      ok: false,
      newScore: 0,
      message: "Builder not found",
    });
  }

  // Increment builder's score
  const newScore = await redisStore.hIncrBy(builderKey, "score", 1);

  // Increment builder's total upvotes received
  await redisStore.hIncrBy(builderKey, "totalUpvotesReceived", 1);

  // Increment upvoter's total upvotes given
  const upvoterKey = `player:${username}:${level}`;
  await redisStore.hIncrBy(upvoterKey, "totalUpvotesGiven", 1);

  // Update sorted set for leaderboard
  await redisStore.zIncrBy(`scores:${level}`, 1, builderUsername);

  console.log(
    `${builderUsername}'s score increased to ${newScore} in level ${level}`
  );

  res.json({
    ok: true,
    newScore,
    message: `Upvoted ${builderUsername}`,
  });
});
````

#### 1.6 Leaderboard Endpoint (Future Extension)

```typescript
interface LeaderboardRequest {
  level: string;
  limit?: number; // Default 10
}

interface LeaderboardResponse {
  players: Array<{
    username: string;
    score: number;
    rank: number;
  }>;
}

// Get top players by score
app.post("/api/leaderboard", async (req, res) => {
  const { level, limit = 10 } = req.body as LeaderboardRequest;

  console.log(`Leaderboard request for level ${level}, limit ${limit}`);

  // Get top players from sorted set (descending order)
  const topPlayers = await redisStore.zRangeWithScores(
    `scores:${level}`,
    0,
    limit - 1,
    { REV: true }
  );

  const players = topPlayers.map((entry, index) => ({
    username: entry.value,
    score: entry.score,
    rank: index + 1,
  }));

  res.json({ players });
});
```

### 2. Client-Side Components

#### 2.1 Player Mode Manager

```typescript
/**
 * PlayerModeManager - Manages player mode state and capabilities
 */
export class PlayerModeManager {
  private mode: "player" | "viewer" = "player";
  private username: string = "";
  private level: string = "";
  private score: number = 0;
  private friends: string[] = []; // Users this player has added
  private friendedBy: string[] = []; // Users who added this player (for block removal)

  /**
   * Initialize player mode from connection response
   */
  initialize(connectResponse: ConnectResponse): void {
    this.mode = connectResponse.mode;
    this.username = connectResponse.username;
    this.level = connectResponse.level;

    if (connectResponse.playerData) {
      this.score = connectResponse.playerData.score;
      this.friends = connectResponse.playerData.friends;
      this.friendedBy = connectResponse.playerData.friendedBy;
    }

    console.log(
      `PlayerModeManager: Initialized in ${this.mode} mode for ${this.username}`
    );

    if (this.mode === "viewer") {
      this.showViewerModeNotification(connectResponse.message);
    }
  }

  /**
   * Check if currently in Player Mode
   */
  isPlayerMode(): boolean {
    return this.mode === "player";
  }

  /**
   * Check if currently in Viewer Mode
   */
  isViewerMode(): boolean {
    return this.mode === "viewer";
  }

  /**
   * Check if block modifications are allowed
   */
  canModifyBlocks(): boolean {
    return this.mode === "player";
  }

  /**
   * Check if position updates should be sent
   */
  shouldSendPositionUpdates(): boolean {
    return this.mode === "player";
  }

  /**
   * Check if a block can be removed based on ownership
   */
  canRemoveBlock(block: Block): { allowed: boolean; reason?: string } {
    if (this.mode === "viewer") {
      return { allowed: false, reason: "Viewer Mode: Cannot modify blocks" };
    }

    // Non-custom blocks can always be removed
    if (!block.placed) {
      return { allowed: true };
    }

    // Own blocks can be removed
    if (block.username === this.username) {
      return { allowed: true };
    }

    // Blocks from users who added this player as friend can be removed
    if (this.friendedBy.includes(block.username)) {
      return { allowed: true };
    }

    // Other players' blocks cannot be removed
    return {
      allowed: false,
      reason: `Cannot remove ${block.username}'s block. Add them as a friend to collaborate.`,
    };
  }

  /**
   * Get current player score
   */
  getScore(): number {
    return this.score;
  }

  /**
   * Update score (called when receiving upvote)
   */
  updateScore(newScore: number): void {
    this.score = newScore;
    console.log(`PlayerModeManager: Score updated to ${newScore}`);
  }

  /**
   * Get friends list
   */
  getFriends(): string[] {
    return [...this.friends];
  }

  /**
   * Add a friend (optimistic update)
   */
  async addFriend(friendUsername: string): Promise<boolean> {
    if (this.mode === "viewer") {
      console.warn("Cannot add friends in Viewer Mode");
      return false;
    }

    // Optimistic update - add immediately
    if (!this.friends.includes(friendUsername)) {
      this.friends.push(friendUsername);
      console.log(`Optimistically added ${friendUsername} as friend`);
    }

    // Fire-and-forget server request
    fetch("http://localhost:3000/api/friends/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: this.username,
        level: this.level,
        friendUsername,
      }),
    }).catch((error) => {
      console.error("Failed to send friend addition to server:", error);
      // Server will send correction if validation fails
    });

    return true;
  }

  /**
   * Revert friend addition (called when server rejects)
   */
  revertFriendAddition(friendUsername: string): void {
    this.friends = this.friends.filter((f) => f !== friendUsername);
    console.log(`Reverted friend addition for ${friendUsername}`);
  }

  /**
   * Update friendedBy list (called when receiving broadcast)
   */
  updateFriendedBy(friendedBy: string[]): void {
    this.friendedBy = friendedBy;
    console.log(`Updated friendedBy list: ${friendedBy.length} users`);
  }

  /**
   * Remove a friend
   */
  async removeFriend(friendUsername: string): Promise<boolean> {
    if (this.mode === "viewer") {
      console.warn("Cannot remove friends in Viewer Mode");
      return false;
    }

    try {
      const response = await fetch("http://localhost:3000/api/friends/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username,
          level: this.level,
          friendUsername,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        this.friends = result.friends;
        console.log(`Removed ${friendUsername} from friends`);
        return true;
      } else {
        console.warn(`Failed to remove friend: ${result.message}`);
        return false;
      }
    } catch (error) {
      console.error("Failed to remove friend:", error);
      return false;
    }
  }

  /**
   * Show notification for Viewer Mode
   */
  private showViewerModeNotification(message?: string): void {
    const notification = message || "You are in Viewer Mode";
    // TODO: Integrate with UI notification system
    console.log(`VIEWER MODE: ${notification}`);
    alert(notification);
  }

  /**
   * Get current username
   */
  getUsername(): string {
    return this.username;
  }

  /**
   * Get current level
   */
  getLevel(): string {
    return this.level;
  }
}
```

#### 2.2 Builder Recognition Manager

```typescript
/**
 * BuilderInfo - Information about a builder in the current region
 */
interface BuilderInfo {
  username: string;
  blockCount: number;
  score?: number;
}

/**
 * BuilderRecognitionManager - Manages builder display and highlighting
 */
export class BuilderRecognitionManager {
  private currentBuilders: BuilderInfo[] = [];
  private highlightedBuilder: string | null = null;
  private terrain: Terrain;
  private playerModeManager: PlayerModeManager;

  constructor(terrain: Terrain, playerModeManager: PlayerModeManager) {
    this.terrain = terrain;
    this.playerModeManager = playerModeManager;
  }

  /**
   * Update builders list based on currently loaded chunks
   */
  updateBuilders(): void {
    const currentUsername = this.playerModeManager.getUsername();
    const builderCounts = new Map<string, number>();

    // Count blocks per builder in custom blocks
    for (const block of this.terrain.customBlocks) {
      if (!block.placed) continue; // Skip removed blocks
      if (block.username === currentUsername) continue; // Skip own blocks

      const count = builderCounts.get(block.username) || 0;
      builderCounts.set(block.username, count + 1);
    }

    // Convert to array and sort by block count
    this.currentBuilders = Array.from(builderCounts.entries())
      .map(([username, blockCount]) => ({ username, blockCount }))
      .sort((a, b) => b.blockCount - a.blockCount)
      .slice(0, 10); // Top 10 builders

    console.log(
      `BuilderRecognitionManager: Updated builders list (${this.currentBuilders.length} builders)`
    );

    // Clear highlights if highlighted builder is no longer in list
    if (
      this.highlightedBuilder &&
      !this.currentBuilders.find((b) => b.username === this.highlightedBuilder)
    ) {
      this.clearHighlight();
    }

    // Trigger UI update
    this.renderBuildersUI();
  }

  /**
   * Toggle highlight for a builder's blocks
   */
  toggleBuilderHighlight(username: string): void {
    if (this.highlightedBuilder === username) {
      // Already highlighted, clear it
      this.clearHighlight();
    } else {
      // Highlight this builder
      this.highlightBuilder(username);
    }
  }

  /**
   * Highlight all blocks by a specific builder
   */
  private highlightBuilder(username: string): void {
    this.clearHighlight();

    const blocksToHighlight: THREE.Vector3[] = [];

    for (const block of this.terrain.customBlocks) {
      if (block.placed && block.username === username) {
        blocksToHighlight.push(new THREE.Vector3(block.x, block.y, block.z));
      }
    }

    // Use existing highlight system with builder color
    // Assuming highlight.ts has a method to highlight multiple blocks
    // with a specific color
    for (const position of blocksToHighlight) {
      this.highlightBlock(position, 0x00ffff); // Cyan for builder blocks
    }

    this.highlightedBuilder = username;
    console.log(
      `BuilderRecognitionManager: Highlighted ${blocksToHighlight.length} blocks by ${username}`
    );
  }

  /**
   * Clear all builder highlights
   */
  clearHighlight(): void {
    if (!this.highlightedBuilder) return;

    // Clear all highlights
    // Assuming highlight.ts has a clearAll method
    this.clearAllHighlights();

    this.highlightedBuilder = null;
    console.log("BuilderRecognitionManager: Cleared builder highlights");
  }

  /**
   * Get current builders list
   */
  getBuilders(): BuilderInfo[] {
    return [...this.currentBuilders];
  }

  /**
   * Get currently highlighted builder
   */
  getHighlightedBuilder(): string | null {
    return this.highlightedBuilder;
  }

  /**
   * Render builders UI (placeholder - integrate with actual UI system)
   */
  private renderBuildersUI(): void {
    // TODO: Integrate with actual UI system
    console.log("Builders in region:", this.currentBuilders);
  }

  /**
   * Highlight a single block (placeholder - integrate with highlight.ts)
   */
  private highlightBlock(position: THREE.Vector3, color: number): void {
    // TODO: Integrate with existing highlight system
    console.log(
      `Highlighting block at (${position.x}, ${position.y}, ${position.z})`
    );
  }

  /**
   * Clear all highlights (placeholder - integrate with highlight.ts)
   */
  private clearAllHighlights(): void {
    // TODO: Integrate with existing highlight system
    console.log("Clearing all highlights");
  }
}
```

#### 2.3 Upvote Manager

```typescript
/**
 * UpvoteRecord - Record of an upvote in localStorage
 */
interface UpvoteRecord {
  timestamp: number;
}

/**
 * UpvoteManager - Manages upvote rate limiting and submission
 */
export class UpvoteManager {
  private readonly COOLDOWN_MS = 60000; // 1 minute
  private readonly MAX_UPVOTES_PER_DAY = 5;
  private readonly DAY_MS = 24 * 60 * 60 * 1000;
  private level: string;
  private playerModeManager: PlayerModeManager;

  constructor(level: string, playerModeManager: PlayerModeManager) {
    this.level = level;
    this.playerModeManager = playerModeManager;
  }

  /**
   * Check if upvote is allowed for a builder
   */
  canUpvote(builderUsername: string): { allowed: boolean; reason?: string } {
    const currentUsername = this.playerModeManager.getUsername();

    // Can't upvote self
    if (builderUsername === currentUsername) {
      return { allowed: false, reason: "You cannot upvote yourself" };
    }

    // Can't upvote in Viewer Mode
    if (this.playerModeManager.isViewerMode()) {
      return { allowed: false, reason: "Cannot upvote in Viewer Mode" };
    }

    const records = this.getUpvoteRecords(builderUsername);

    // Check cooldown (last upvote within 1 minute)
    if (records.length > 0) {
      const lastUpvote = records[records.length - 1];
      const timeSinceLastUpvote = Date.now() - lastUpvote.timestamp;

      if (timeSinceLastUpvote < this.COOLDOWN_MS) {
        const remainingSeconds = Math.ceil(
          (this.COOLDOWN_MS - timeSinceLastUpvote) / 1000
        );
        return {
          allowed: false,
          reason: `Please wait ${remainingSeconds} seconds before upvoting again`,
        };
      }
    }

    // Check daily limit
    const recentUpvotes = records.filter(
      (r) => Date.now() - r.timestamp < this.DAY_MS
    );

    if (recentUpvotes.length >= this.MAX_UPVOTES_PER_DAY) {
      return {
        allowed: false,
        reason: `You have reached the daily limit of ${this.MAX_UPVOTES_PER_DAY} upvotes for this builder`,
      };
    }

    return { allowed: true };
  }

  /**
   * Submit an upvote for a builder (optimistic update)
   */
  async upvote(builderUsername: string): Promise<{
    success: boolean;
    optimisticScore?: number;
    message?: string;
  }> {
    const check = this.canUpvote(builderUsername);

    if (!check.allowed) {
      return { success: false, message: check.reason };
    }

    const currentUsername = this.playerModeManager.getUsername();

    // Record upvote in localStorage immediately
    this.recordUpvote(builderUsername);

    // Calculate optimistic score (current + 1)
    const optimisticScore = this.getOptimisticScore(builderUsername);

    console.log(
      `Optimistically upvoted ${builderUsername}, estimated score: ${optimisticScore}`
    );

    // Fire-and-forget server request
    fetch("http://localhost:3000/api/upvote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: currentUsername,
        level: this.level,
        builderUsername,
      }),
    }).catch((error) => {
      console.error("Failed to send upvote to server:", error);
      // Server will broadcast actual score update
    });

    return {
      success: true,
      optimisticScore,
      message: `Upvoted ${builderUsername}`,
    };
  }

  /**
   * Get optimistic score for a builder (current + 1)
   */
  private getOptimisticScore(builderUsername: string): number {
    // This would need to be tracked or estimated
    // For now, return a placeholder
    return 0;
  }

  /**
   * Get upvote records for a builder from localStorage
   */
  private getUpvoteRecords(builderUsername: string): UpvoteRecord[] {
    const key = `upvotes:${this.level}:${builderUsername}`;
    const stored = localStorage.getItem(key);

    if (!stored) return [];

    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  /**
   * Record an upvote in localStorage
   */
  private recordUpvote(builderUsername: string): void {
    const key = `upvotes:${this.level}:${builderUsername}`;
    const records = this.getUpvoteRecords(builderUsername);

    records.push({ timestamp: Date.now() });

    // Clean up old records (older than 1 day)
    const recentRecords = records.filter(
      (r) => Date.now() - r.timestamp < this.DAY_MS
    );

    localStorage.setItem(key, JSON.stringify(recentRecords));
  }

  /**
   * Get remaining cooldown time in seconds
   */
  getRemainingCooldown(builderUsername: string): number {
    const records = this.getUpvoteRecords(builderUsername);

    if (records.length === 0) return 0;

    const lastUpvote = records[records.length - 1];
    const timeSinceLastUpvote = Date.now() - lastUpvote.timestamp;

    if (timeSinceLastUpvote >= this.COOLDOWN_MS) return 0;

    return Math.ceil((this.COOLDOWN_MS - timeSinceLastUpvote) / 1000);
  }

  /**
   * Get remaining upvotes for today
   */
  getRemainingUpvotes(builderUsername: string): number {
    const records = this.getUpvoteRecords(builderUsername);
    const recentUpvotes = records.filter(
      (r) => Date.now() - r.timestamp < this.DAY_MS
    );

    return Math.max(0, this.MAX_UPVOTES_PER_DAY - recentUpvotes.length);
  }
}
```

#### 2.4 Integration with Existing Components

```typescript
// Enhanced MultiplayerManager integration
class MultiplayerManager {
  private playerModeManager: PlayerModeManager;
  private builderRecognitionManager: BuilderRecognitionManager;
  private upvoteManager: UpvoteManager;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    terrain: Terrain
  ) {
    // ... existing code ...
    this.playerModeManager = new PlayerModeManager();
    this.builderRecognitionManager = new BuilderRecognitionManager(
      terrain,
      this.playerModeManager
    );
    this.upvoteManager = new UpvoteManager("default", this.playerModeManager);
  }

  async connect(level: string = "default"): Promise<void> {
    // ... existing connection code ...

    // Initialize player mode from response
    this.playerModeManager.initialize(data);

    // Update upvote manager with level
    this.upvoteManager = new UpvoteManager(level, this.playerModeManager);

    // ... rest of connection code ...
  }

  async sendPositionUpdate(
    position: THREE.Vector3,
    rotation: Rotation
  ): Promise<void> {
    // Only send if in Player Mode
    if (!this.playerModeManager.shouldSendPositionUpdates()) {
      return;
    }

    // ... existing position update code ...
  }

  sendBlockModification(
    position: THREE.Vector3,
    blockType: BlockType | null,
    action: "place" | "remove"
  ): void {
    // Check if modifications are allowed
    if (!this.playerModeManager.canModifyBlocks()) {
      console.warn("Block modifications not allowed in current mode");
      return;
    }

    // For removal, check ownership
    if (action === "remove") {
      const block = this.findBlockAt(position);
      if (block) {
        const check = this.playerModeManager.canRemoveBlock(block);
        if (!check.allowed) {
          console.warn(`Block removal prevented: ${check.reason}`);
          // TODO: Show UI message
          return;
        }
      }
    }

    // ... existing modification code ...
  }

  private findBlockAt(position: THREE.Vector3): Block | null {
    for (const block of this.terrain.customBlocks) {
      if (
        block.x === position.x &&
        block.y === position.y &&
        block.z === position.z
      ) {
        return block;
      }
    }
    return null;
  }

  // New method: Update builders when chunks change
  onChunksUpdated(): void {
    this.builderRecognitionManager.updateBuilders();
  }

  // New method: Get player mode manager for UI access
  getPlayerModeManager(): PlayerModeManager {
    return this.playerModeManager;
  }

  // New method: Get builder recognition manager for UI access
  getBuilderRecognitionManager(): BuilderRecognitionManager {
    return this.builderRecognitionManager;
  }

  // New method: Get upvote manager for UI access
  getUpvoteManager(): UpvoteManager {
    return this.upvoteManager;
  }
}
```

## Data Models

### Redis Data Structures

```typescript
// Active players set
// Key: players:${level}
// Type: Set
// Members: username strings
// Example: players:default -> {"Player1234", "Player5678"}

// Individual player data
// Key: player:${username}:${level}
// Type: Hash
// Fields:
//   score: "0"
//   friends: '["Player5678", "Player9012"]'
//   lastActive: "1698765432000"
//   totalUpvotesGiven: "10"
//   totalUpvotesReceived: "25"
// TTL: 7 days (604800 seconds)

// Scores sorted set
// Key: scores:${level}
// Type: Sorted Set
// Members: username -> score
// Example: scores:default -> {Player1234: 25, Player5678: 10}
```

### LocalStorage Data Structures

```typescript
// Upvote records
// Key: upvotes:${level}:${builderUsername}
// Value: JSON array of UpvoteRecord
// Example: upvotes:default:Player1234 -> [{"timestamp": 1698765432000}]

// Offline modifications (existing)
// Key: offline_mods_${level}
// Value: JSON array of PendingModification
```

## Error Handling

### Server-Side Error Handling

```typescript
// Redis connection errors
try {
  await redisStore.sAdd(`players:${level}`, username);
} catch (error) {
  console.error("Redis error:", error);
  return res.status(500).json({
    error: "Database unavailable",
    mode: "viewer", // Fallback to viewer mode
  });
}

// Player data corruption
try {
  const data = await redisStore.hGetAll(playerKey);
  const score = parseInt(data.score || "0", 10);
  if (isNaN(score)) {
    throw new Error("Corrupted score data");
  }
} catch (error) {
  console.error("Corrupted player data, reinitializing:", error);
  await redisStore.hSet(playerKey, {
    score: "0",
    friends: "[]",
    lastActive: Date.now().toString(),
  });
}
```

### Client-Side Error Handling

```typescript
// Connection failure
try {
  const response = await fetch("http://localhost:3000/api/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  this.playerModeManager.initialize(data);
} catch (error) {
  console.error("Connection failed:", error);
  // Show error UI and retry
  this.showConnectionError();
}

// Upvote failure
try {
  const result = await this.upvoteManager.upvote(builderUsername);
  if (!result.success) {
    this.showMessage(result.message || "Upvote failed");
  }
} catch (error) {
  console.error("Upvote error:", error);
  this.showMessage("Network error, please try again");
}
```

## Performance Optimizations

### Client-Side Optimistic Updates

The design prioritizes perceived performance through aggressive client-side optimistic updates:

1. **Block Removal Validation**: All block removal checks happen client-side using the `friendedBy` list sent at connection time. No server round-trip needed.

2. **Friend Management**: When adding/removing friends, the UI updates immediately and the server request is fire-and-forget. The server broadcasts updates to affected players asynchronously.

3. **Upvoting**: Score increments happen immediately in the UI. The server processes the upvote asynchronously and broadcasts the update to all clients.

4. **Position Updates**: Positions are stored only in memory (connectedClients map), never written to Redis, for maximum performance.

### Server-Side Async Processing

```typescript
// Fire-and-forget pattern for friend additions
app.post("/api/friends/add", async (req, res) => {
  const { username, level, friendUsername } = req.body;

  // Immediate response
  res.json({ ok: true, message: "Friend request processing" });

  // Async processing (don't await)
  processFriendAddition(username, level, friendUsername).catch((error) => {
    console.error("Failed to process friend addition:", error);
    // Send correction message to client if needed
    broadcastFriendshipError(username, friendUsername, level);
  });
});

async function processFriendAddition(
  username: string,
  level: string,
  friendUsername: string
): Promise<void> {
  // Validate friend exists
  const friendKey = `player:${friendUsername}:${level}`;
  const friendExists = await redisStore.exists(friendKey);

  if (!friendExists) {
    throw new Error("Friend not found");
  }

  // Update both players' data
  const playerKey = `player:${username}:${level}`;

  // Add to player's friends list
  const playerData = await redisStore.hGet(playerKey, "friends");
  const friends: string[] = playerData ? JSON.parse(playerData) : [];

  if (!friends.includes(friendUsername)) {
    friends.push(friendUsername);
    await redisStore.hSet(playerKey, "friends", JSON.stringify(friends));
  }

  // Add to friend's friendedBy list
  const friendData = await redisStore.hGet(friendKey, "friendedBy");
  const friendedBy: string[] = friendData ? JSON.parse(friendData) : [];

  if (!friendedBy.includes(username)) {
    friendedBy.push(username);
    await redisStore.hSet(friendKey, "friendedBy", JSON.stringify(friendedBy));
  }

  // Broadcast update to friend if online
  const friendClient = connectedClients.get(friendUsername);
  if (friendClient && friendClient.level === level) {
    // Send via regional channel
    const position = friendClient.position || { x: 0, y: 20, z: 0 };
    const channel = getRegionalChannelFromPosition(level, position);

    await realtime.send(channel, {
      type: "friendship-update",
      targetUsername: friendUsername,
      friendedBy: friendedBy,
    });
  }

  console.log(`${username} added ${friendUsername} as friend (async)`);
}
```

### Upvote Async Processing

```typescript
// Fire-and-forget upvote
app.post("/api/upvote", async (req, res) => {
  const { username, level, builderUsername } = req.body;

  // Immediate response
  res.json({ ok: true, message: "Upvote processing" });

  // Async processing
  processUpvote(username, level, builderUsername).catch((error) => {
    console.error("Failed to process upvote:", error);
  });
});

async function processUpvote(
  username: string,
  level: string,
  builderUsername: string
): Promise<void> {
  const builderKey = `player:${builderUsername}:${level}`;

  // Increment score
  const newScore = await redisStore.hIncrBy(builderKey, "score", 1);

  // Update sorted set
  await redisStore.zIncrBy(`scores:${level}`, 1, builderUsername);

  // Increment counters
  await redisStore.hIncrBy(builderKey, "totalUpvotesReceived", 1);
  const upvoterKey = `player:${username}:${level}`;
  await redisStore.hIncrBy(upvoterKey, "totalUpvotesGiven", 1);

  // Broadcast score update to all clients in level
  // Use a global level channel for score updates
  await realtime.send(`scores:${level}`, {
    type: "score-update",
    username: builderUsername,
    newScore: newScore,
  });

  console.log(
    `${builderUsername} upvoted by ${username}, new score: ${newScore}`
  );
}
```

### Client-Side Correction Handling

```typescript
// In MultiplayerManager or PlayerModeManager
private handleMessage(data: any): void {
  switch (data.type) {
    case "friendship-update":
      if (data.targetUsername === this.username) {
        // Update local friendedBy list
        this.playerModeManager.updateFriendedBy(data.friendedBy);
      }
      break;

    case "friendship-error":
      if (data.targetUsername === this.username) {
        // Revert optimistic friend addition
        this.playerModeManager.revertFriendAddition(data.friendUsername);
        this.showMessage(data.message);
      }
      break;

    case "score-update":
      // Update displayed score for builder
      this.builderRecognitionManager.updateBuilderScore(
        data.username,
        data.newScore
      );
      break;

    // ... existing cases ...
  }
}
```

### Pre-loading Strategy

```typescript
// At connection time, load all necessary data for client-side validation
app.post("/api/connect", async (req, res) => {
  // ... existing code ...

  const playerData = await getOrCreatePlayerData(username, actualLevel);

  // Pre-load builder information for initial chunks
  const buildersInView = await getBuildersInChunks(initialChunks);

  res.json({
    mode: "player",
    username,
    sessionId: username,
    level: actualLevel,
    terrainSeeds,
    spawnPosition,
    initialChunks,
    players,
    playerData: {
      score: playerData.score,
      friends: playerData.friends,
      friendedBy: playerData.friendedBy, // Critical for client-side validation
    },
    buildersInView, // Optional: pre-load builder scores
  });
});
```

## Testing Strategy

### Performance Testing

1. **Latency Simulation**: Test with artificial Redis latency (100-500ms) to ensure optimistic updates feel instant
2. **Concurrent Users**: Test with 50+ concurrent users in same level to verify broadcast performance
3. **Rapid Actions**: Test rapid block placement/removal to ensure batching works correctly
4. **Network Failures**: Test offline mode and reconnection with pending operations

### Client-Side Validation Testing

1. **Block Removal**: Verify blocks can only be removed based on friendedBy list
2. **Optimistic Rollback**: Verify UI reverts when server rejects optimistic updates
3. **Race Conditions**: Test simultaneous friend additions from multiple clients
4. **Upvote Limits**: Verify client-side rate limiting works correctly

## Summary of Optimizations

### Key Performance Principles

1. **Client-Side Validation First**: All block removal checks happen instantly using the `friendedBy` list sent at connection time. Zero server round-trips for validation.

2. **Optimistic UI Updates**: Friend additions, upvotes, and score updates happen immediately in the UI. The server processes asynchronously and broadcasts corrections only if needed.

3. **Fire-and-Forget Requests**: Non-critical operations (friends, upvotes) use fire-and-forget HTTP requests that don't block the UI.

4. **Memory-Only Position Tracking**: Player positions are never written to Redis, only kept in the in-memory `connectedClients` map for maximum performance.

5. **Async Redis Operations**: All Redis writes happen asynchronously after the HTTP response is sent, never blocking the client.

6. **Broadcast-Based Corrections**: When server validation fails, corrections are sent via regional broadcasts rather than synchronous responses.

### Data Flow Comparison

**Traditional (Slow)**:

```
Client → Server (validate) → Redis (write) → Response → Client (update UI)
Total: 200-500ms perceived latency
```

**Optimized (Fast)**:

```
Client (update UI immediately) → Server (fire-and-forget) → Redis (async) → Broadcast (corrections if needed)
Total: 0ms perceived latency for user, eventual consistency
```

### Trade-offs

- **Consistency**: Eventual consistency instead of strong consistency
- **Complexity**: Need to handle correction messages and rollbacks
- **Benefits**: Instant perceived performance, better user experience, scales better with slow Redis

This design ensures the game feels snappy and responsive even when running on Reddit's infrastructure with potentially slow Redis operations.

## Viewer Mode Implementation Details

### Server-Side Viewer Handling

```typescript
// Helper function to get active players (excludes viewers)
function getActivePlayers(level: string): PlayerData[] {
  // Only return players from connectedClients (viewers are never added to this map)
  return Array.from(connectedClients.values())
    .filter((c) => c.level === level)
    .map((c) => ({
      username: c.username,
      position: c.position || { x: 0, y: 20, z: 0 },
      rotation: c.rotation || { x: 0, y: 0, z: 0 },
    }));
}

// Viewer mode connection response
if (isActive) {
  // Player already active - enter Viewer Mode
  console.log(`${username} already active, entering Viewer Mode`);

  // Load terrain and initial chunks for viewing
  await initializeTerrainSeeds(actualLevel);
  const terrainSeeds = await getTerrainSeeds(actualLevel);
  const spawnPosition = { x: 0, y: 20, z: 0 };
  const initialChunks = await loadInitialChunks(actualLevel, spawnPosition);

  // Get active players (viewers are NOT included)
  const players = getActivePlayers(actualLevel);

  // CRITICAL: Do NOT add viewer to connectedClients map
  // Viewers are invisible and don't send position updates

  return res.json({
    mode: "viewer",
    username,
    sessionId: `${username}_viewer_${Date.now()}`,
    level: actualLevel,
    terrainSeeds,
    spawnPosition,
    initialChunks,
    players, // Only active players, not viewers
    message:
      "You are already playing from another device. Entering Viewer Mode.",
  });
}
```

### Client-Side Viewer Handling

```typescript
// In MultiplayerManager.connect()
async connect(level: string = "default"): Promise<void> {
  const response = await fetch("http://localhost:3000/api/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level }),
  });

  const data = await response.json();

  // Initialize player mode
  this.playerModeManager.initialize(data);

  // Load terrain and chunks
  if (data.terrainSeeds) {
    this.terrain.setSeeds(data.terrainSeeds.seed);
  }

  if (data.initialChunks) {
    for (const chunkData of data.initialChunks) {
      this.loadChunkState(chunkData);
    }
    this.terrain.generate();
  }

  // Create player entities for other players
  if (data.players) {
    for (const playerData of data.players) {
      // CRITICAL: Never create entity for self, even in player mode
      // The local player is controlled by the camera, not a PlayerEntityRenderer
      if (playerData.username !== data.username) {
        const position = new THREE.Vector3(
          playerData.position.x,
          playerData.position.y,
          playerData.position.z
        );
        this.createPlayerEntity(playerData.username, position);
      }
    }
  }

  // Subscribe to regional channels (both modes can view)
  if (data.spawnPosition) {
    const spawnChunkX = Math.floor(data.spawnPosition.x / this.terrain.chunkSize);
    const spawnChunkZ = Math.floor(data.spawnPosition.z / this.terrain.chunkSize);

    await this.chunkStateManager.updateSubscriptions(
      spawnChunkX,
      spawnChunkZ,
      (broadcastData) => this.handleMessage(broadcastData)
    );
  }

  // Only sync offline mods in player mode
  if (this.playerModeManager.isPlayerMode()) {
    this.chunkStateManager.syncOfflineModifications();
  }
}

// Position updates only sent in player mode
async sendPositionUpdate(position: THREE.Vector3, rotation: Rotation): Promise<void> {
  // Check mode before sending
  if (!this.playerModeManager.shouldSendPositionUpdates()) {
    return; // Viewers don't send position updates
  }

  // ... existing position update code ...
}
```

### Key Viewer Mode Behaviors

1. **Invisible**: Viewers are never added to `connectedClients`, so they never appear in position broadcasts
2. **Silent**: Viewers don't send position updates to the server
3. **Read-Only**: Viewers can't modify blocks (checked by `canModifyBlocks()`)
4. **Observable**: Viewers can see all other players and block modifications via regional channels
5. **No Avatar**: The local player never creates a `PlayerEntityRenderer` for themselves (this is true for both modes)

## Design Refinements Based on Feedback

### 1. Fixed: Bidirectional Friend Data Updates

**Problem**: Initial endpoint examples only updated one player's record, breaking the `friendedBy` system.

**Solution**: All friend management operations now correctly update BOTH players:

- Adding friend: Updates player's `friends` list AND friend's `friendedBy` list
- Removing friend: Updates player's `friends` list AND friend's `friendedBy` list
- This ensures block removal permissions work correctly

### 2. Added: Real-Time Friendship Updates

**Problem**: Without real-time updates, players would need to reconnect to get updated `friendedBy` lists.

**Solution**: When a friendship is added/removed, the server broadcasts a `friendship-update` message to the affected player if they're online:

```typescript
{
  type: "friendship-update",
  targetUsername: "Player5678",
  friendedBy: ["Player1234", "Player9012"],
  message: "Player1234 added you as a friend. You can now remove their blocks!"
}
```

The client's `PlayerModeManager` handles this message and updates the local `friendedBy` list immediately, enabling instant block removal permissions without reconnecting.

### 3. Clarified: Viewer Mode Invisibility

**Server-Side**:

- Viewers are NEVER added to `connectedClients` map
- `getActivePlayers()` only returns players from `connectedClients`
- Viewers don't appear in position broadcasts

**Client-Side**:

- Viewers don't send position updates
- Viewers don't create a local player avatar (neither mode does)
- Viewers can see all other players and modifications via regional channels
- All block modification controls are disabled in viewer mode

This ensures viewers are completely invisible to other players while still being able to observe the game.
