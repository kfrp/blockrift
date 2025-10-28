import express from "express";
import { createClient } from "redis";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { calculateInitialChunks } from "./server-utils";

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const PORT = 3000;

// Redis clients
const publisher = createClient();
const subscriber = createClient();
const redisStore = createClient(); // For persistent storage operations

// Track active channels and their subscribers
const channelSubscribers = new Map<string, Set<WebSocket>>();

// Task 1.1: Environment detection (development vs production)
const isDevelopment = process.env.NODE_ENV !== "production";

// Task 1.1: Player data interfaces
interface PlayerData {
  score: number;
  friends: string[];
  friendedBy: string[];
  lastActive: number;
  totalUpvotesGiven: number;
  totalUpvotesReceived: number;
}

type Position = { x: number; y: number; z: number };
type Rotation = { x: number; y: number };
type Player = {
  username: string;
  position: Position;
  rotation: Rotation;
};
type Block = {
  x: number;
  y: number;
  z: number;
  type?: number;
  username: string;
  timestamp: number;
  placed: boolean;
  removed?: boolean;
};
type ChunkBlock = {
  x: number;
  y: number;
  z: number;
  type: number;
  username: string;
  timestamp: number;
};
// Task 1.3: Session tracking for connected clients
interface ConnectedClient {
  username: string;
  level: string; // Level/world identifier
  lastPositionUpdate: number;
  position?: Position;
  rotation?: Rotation;
}

// Track clients by username (not WebSocket connection)
const connectedClients = new Map<string, ConnectedClient>();

// Task 1.2: Random username generation for development
function generateUsername(): string {
  const randomNum = Math.floor(Math.random() * 10000);
  console.log("generated: " + randomNum);
  return `Player${randomNum}`;
}

// Assign username based on environment
function assignUsername(): string {
  if (isDevelopment) {
    // Generate random username for development
    return generateUsername();
  } else {
    // In production, this would come from Devvit context
    // For now, return a placeholder
    return "DevvitUser";
  }
}

// Task 1b.1: Chunk coordinate calculation constants and helpers
const CHUNK_SIZE = 24; // Matches client-side chunk system

/**
 * Convert block position to chunk coordinates
 * @param x Block x position
 * @param z Block z position
 * @returns Chunk coordinates {chunkX, chunkZ}
 */
function getChunkCoordinates(
  x: number,
  z: number
): { chunkX: number; chunkZ: number } {
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkZ = Math.floor(z / CHUNK_SIZE);
  return { chunkX, chunkZ };
}

/**
 * Generate Redis key for a chunk in a specific level
 */
function getChunkKey(level: string, chunkX: number, chunkZ: number): string {
  return `level:${level || "default"}:chunk:${chunkX}:${chunkZ}`;
}

/**
 * Generate Redis key for a block within a chunk
 */
function getBlockKey(x: number, y: number, z: number): string {
  return `block:${x}:${y}:${z}`;
}

// Task 1b.2: Chunk-based Redis operations

/**
 * Store a block placement in Redis using chunk-based hash storage
 */
async function storeBlockPlacement(
  level: string,
  x: number,
  y: number,
  z: number,
  blockType: number,
  username: string
): Promise<void> {
  const { chunkX, chunkZ } = getChunkCoordinates(x, z);
  const chunkKey = getChunkKey(level, chunkX, chunkZ);
  const blockKey = getBlockKey(x, y, z);

  const blockData = JSON.stringify({
    type: blockType,
    username: username,
    timestamp: Date.now(),
  });

  await redisStore.hSet(chunkKey, blockKey, blockData);
}

/**
 * Remove a block from Redis chunk hash
 */
async function removeBlock(
  level: string,
  x: number,
  y: number,
  z: number
): Promise<void> {
  const { chunkX, chunkZ } = getChunkCoordinates(x, z);
  const chunkKey = getChunkKey(level, chunkX, chunkZ);
  const blockKey = getBlockKey(x, y, z);

  await redisStore.hDel(chunkKey, blockKey);
}

/**
 * Retrieve all blocks in a chunk
 */
async function getChunkBlocks(
  level: string,
  chunkX: number,
  chunkZ: number
): Promise<Array<ChunkBlock>> {
  const chunkKey = getChunkKey(level, chunkX, chunkZ);
  const chunkData = await redisStore.hGetAll(chunkKey);

  const blocks = Object.entries(chunkData).map(([key, value]) => {
    // Parse block key: "block:x:y:z"
    const [_, xStr, yStr, zStr] = key.split(":");
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);
    const z = parseInt(zStr, 10);

    // Parse block data
    const data = JSON.parse(value);

    return {
      x,
      y,
      z,
      type: data.type,
      username: data.username,
      timestamp: data.timestamp,
    };
  });

  return blocks;
}

// Task 1b.3: Terrain seed management

interface TerrainSeeds {
  seed: number;
  treeSeed: number;
  stoneSeed: number;
  coalSeed: number;
}

/**
 * Get Redis key for terrain seeds by level
 */
function getTerrainSeedsKey(level: string): string {
  return `terrain:seeds:${level}`;
}

/**
 * Initialize terrain seeds in Redis for a specific level if they don't exist
 */
async function initializeTerrainSeeds(level: string): Promise<void> {
  const key = getTerrainSeedsKey(level);
  const exists = await redisStore.exists(key);

  if (!exists) {
    // Generate deterministic seeds based on level name
    // This ensures the same level always gets the same seeds
    const levelHash = hashString(level);
    const seeds: TerrainSeeds = {
      seed: levelHash,
      treeSeed: levelHash * 0.7,
      stoneSeed: levelHash * 0.4,
      coalSeed: levelHash * 0.5,
    };

    await redisStore.set(key, JSON.stringify(seeds));
    console.log(`Initialized terrain seeds for level "${level}":`, seeds);
  } else {
    const existingSeeds = await getTerrainSeeds(level);
    console.log(
      `Terrain seeds already exist for level "${level}":`,
      existingSeeds
    );
  }
}

/**
 * Retrieve terrain seeds from Redis for a specific level
 */
async function getTerrainSeeds(level: string): Promise<TerrainSeeds> {
  const key = getTerrainSeedsKey(level);
  const seedsData = await redisStore.get(key);

  if (!seedsData) {
    throw new Error(`Terrain seeds not found in Redis for level "${level}"`);
  }

  return JSON.parse(seedsData.toString());
}

/**
 * Generate a deterministic hash from a string (for level-based seeds)
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Normalize to 0-1 range
  return Math.abs(hash) / 2147483647;
}

// Task 1.1: Player data management helper functions

/**
 * Get or create player data in Redis
 * Initializes new player with score=0, empty friends lists
 */
async function getOrCreatePlayerData(
  username: string,
  level: string
): Promise<PlayerData> {
  const key = `player:${username}:${level}`;
  const exists = await redisStore.exists(key);

  if (!exists) {
    // Initialize new player
    const initialData: PlayerData = {
      score: 0,
      friends: [],
      friendedBy: [],
      lastActive: Date.now(),
      totalUpvotesGiven: 0,
      totalUpvotesReceived: 0,
    };

    await redisStore.hSet(key, {
      score: "0",
      friends: JSON.stringify([]),
      friendedBy: JSON.stringify([]),
      lastActive: Date.now().toString(),
      totalUpvotesGiven: "0",
      totalUpvotesReceived: "0",
    });

    // Add to scores sorted set for leaderboard
    await redisStore.zAdd(`scores:${level}`, { score: 0, value: username });

    // Set TTL to 7 days
    await redisStore.expire(key, 7 * 24 * 60 * 60);

    console.log(`Initialized player data for ${username} in level ${level}`);

    return initialData;
  }

  // Load existing player data
  const data = await redisStore.hGetAll(key);

  // Refresh TTL
  await redisStore.expire(key, 7 * 24 * 60 * 60);

  // Type assertion for Redis hash result
  const hashData = data as unknown as Record<string, string>;

  return {
    score: parseInt(hashData.score || "0", 10),
    friends: JSON.parse(hashData.friends || "[]"),
    friendedBy: JSON.parse(hashData.friendedBy || "[]"),
    lastActive: parseInt(hashData.lastActive || "0", 10),
    totalUpvotesGiven: parseInt(hashData.totalUpvotesGiven || "0", 10),
    totalUpvotesReceived: parseInt(hashData.totalUpvotesReceived || "0", 10),
  };
}

/**
 * Update player score atomically
 * Returns the new score value
 */
async function updatePlayerScore(
  username: string,
  level: string,
  increment: number
): Promise<number> {
  const key = `player:${username}:${level}`;

  // Atomic increment in Redis hash
  const newScore = await redisStore.hIncrBy(key, "score", increment);

  // Update sorted set for leaderboard
  await redisStore.zIncrBy(`scores:${level}`, increment, username);

  // Update last active timestamp
  await redisStore.hSet(key, "lastActive", Date.now().toString());

  console.log(
    `Updated ${username}'s score by ${increment} to ${newScore} in level ${level}`
  );

  return Number(newScore);
}

/**
 * Add a friend to player's friends list and update friend's friendedBy list
 * This is CRITICAL - both records must be updated for block removal permissions
 */
async function addPlayerFriend(
  username: string,
  level: string,
  friendUsername: string
): Promise<void> {
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
    ? JSON.parse(playerFriendsData.toString())
    : [];

  if (!playerFriends.includes(friendUsername)) {
    playerFriends.push(friendUsername);
    await redisStore.hSet(playerKey, "friends", JSON.stringify(playerFriends));
  }

  // CRITICAL: Update friend's friendedBy list (enables block removal)
  const friendedByData = await redisStore.hGet(friendKey, "friendedBy");
  const friendedBy: string[] = friendedByData
    ? JSON.parse(friendedByData.toString())
    : [];

  if (!friendedBy.includes(username)) {
    friendedBy.push(username);
    await redisStore.hSet(friendKey, "friendedBy", JSON.stringify(friendedBy));
  }

  // Update last active for both players
  const now = Date.now().toString();
  await redisStore.hSet(playerKey, "lastActive", now);
  await redisStore.hSet(friendKey, "lastActive", now);

  console.log(
    `${username} added ${friendUsername} as friend (both records updated)`
  );
}

/**
 * Remove a friend from player's friends list and update friend's friendedBy list
 * This revokes block removal permissions immediately
 */
async function removePlayerFriend(
  username: string,
  level: string,
  friendUsername: string
): Promise<void> {
  const playerKey = `player:${username}:${level}`;
  const friendKey = `player:${friendUsername}:${level}`;

  // Remove from player's friends list
  const playerFriendsData = await redisStore.hGet(playerKey, "friends");
  const playerFriends: string[] = playerFriendsData
    ? JSON.parse(playerFriendsData.toString())
    : [];
  const updatedPlayerFriends = playerFriends.filter(
    (f) => f !== friendUsername
  );

  if (updatedPlayerFriends.length !== playerFriends.length) {
    await redisStore.hSet(
      playerKey,
      "friends",
      JSON.stringify(updatedPlayerFriends)
    );
  }

  // CRITICAL: Remove from friend's friendedBy list (revokes block removal permission)
  const friendExists = await redisStore.exists(friendKey);
  if (friendExists) {
    const friendedByData = await redisStore.hGet(friendKey, "friendedBy");
    const friendedBy: string[] = friendedByData
      ? JSON.parse(friendedByData.toString())
      : [];
    const updatedFriendedBy = friendedBy.filter((f) => f !== username);

    if (updatedFriendedBy.length !== friendedBy.length) {
      await redisStore.hSet(
        friendKey,
        "friendedBy",
        JSON.stringify(updatedFriendedBy)
      );
    }

    // Update last active for friend
    await redisStore.hSet(friendKey, "lastActive", Date.now().toString());
  }

  // Update last active for player
  await redisStore.hSet(playerKey, "lastActive", Date.now().toString());

  console.log(
    `${username} removed ${friendUsername} from friends (both records updated)`
  );
}

// Task 1.2: Active players tracking helper functions

/**
 * Check if a player is currently active in a level
 */
async function isPlayerActive(
  username: string,
  level: string
): Promise<boolean> {
  const key = `players:${level}`;
  const result = await redisStore.sIsMember(key, username);
  return Boolean(result);
}

/**
 * Add a player to the active players set for a level
 */
async function addActivePlayer(username: string, level: string): Promise<void> {
  const key = `players:${level}`;
  await redisStore.sAdd(key, username);
  console.log(`Added ${username} to active players in level ${level}`);
}

/**
 * Remove a player from the active players set for a level
 */
async function removeActivePlayer(
  username: string,
  level: string
): Promise<void> {
  const key = `players:${level}`;
  await redisStore.sRem(key, username);
  console.log(`Removed ${username} from active players in level ${level}`);
}

// Task 6: Block modification message interface
export interface BlockModificationMessage {
  type: "block-modify";
  username: string;
  position: Position;
  blockType: number | null; // null for removal, number for placement
  action: "place" | "remove";
  clientTimestamp: number;
}

// Task 6: Block modification broadcast interface
export interface BlockModificationBroadcast extends BlockModificationMessage {
  serverTimestamp: number;
}

// Task 12: Position update message interface
interface PositionUpdateMessage {
  type: "player-position";
  username: string;
  position: Position;
  rotation: Rotation;
}

// Task 12: Batched position updates broadcast interface
interface PositionUpdatesBroadcast {
  type: "player-positions";
  players: Array<Player>;
}

/**
 * Task 6: Persist block modification to Redis with retry logic
 * Implements exponential backoff for Redis failures (Requirement 10.5)
 */
async function persistBlockModification(
  level: string,
  data: BlockModificationMessage,
  retries = 3
): Promise<void> {
  const { position, blockType, action, username } = data;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (action === "place" && blockType !== null) {
        // Add block to chunk hash
        await storeBlockPlacement(
          level,
          position.x,
          position.y,
          position.z,
          blockType,
          username
        );
      } else if (action === "remove") {
        // Remove block from chunk hash
        await removeBlock(level, position.x, position.y, position.z);
      }

      console.log(
        `Successfully persisted ${action} at (${position.x}, ${position.y}, ${position.z}) by ${username} in level "${level}"`
      );
      return; // Success
    } catch (error) {
      console.error(
        `Redis persistence failed (attempt ${attempt}/${retries}):`,
        error
      );

      if (attempt === retries) {
        // Log critical error for monitoring (Requirement 10.5)
        console.error(
          "CRITICAL: Failed to persist block modification after all retries",
          data
        );
        // In production, this would be sent to error tracking service
      } else {
        // Exponential backoff: 100ms, 200ms, 400ms
        const backoffMs = Math.pow(2, attempt) * 100;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }
}

/**
 * Broadcast position updates for all connected clients
 * - Called 10 times per second
 * - Batches all player positions by region
 * - Broadcasts via Redis pub/sub
 */
// Track last broadcast state to avoid sending duplicate data
const lastBroadcastState = new Map<
  string,
  Map<string, { position: string; rotation: string }>
>();

/**
 * Clean up inactive players (called every 10 seconds)
 * Removes players who haven't sent position updates in 2 minutes
 */
async function cleanupInactivePlayers(): Promise<void> {
  const TIMEOUT_MS = 120000; // 120 seconds (2 minutes)
  const now = Date.now();

  const staleUsernames: string[] = [];

  for (const [username, client] of Array.from(connectedClients.entries())) {
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
    await removeActivePlayer(username, client.level);

    // Remove from connected clients
    connectedClients.delete(username);

    // Update last active timestamp
    const playerKey = `player:${username}:${client.level}`;
    const exists = await redisStore.exists(playerKey);
    if (exists) {
      await redisStore.hSet(playerKey, "lastActive", now.toString());
    }
  }
}

async function broadcastPositionUpdates(): Promise<void> {
  const REGION_SIZE = 15;
  const CHUNK_SIZE = 24;

  // Group players by region based on their position
  const regionPlayers = new Map<string, Array<Player>>();

  for (const client of Array.from(connectedClients.values())) {
    // Always include players, use default position/rotation if not set
    const position = client.position || { x: 0, y: 20, z: 0 };
    const rotation = client.rotation || { x: 0, y: 0 };

    // Calculate which region this player is in
    const chunkX = Math.floor(position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(position.z / CHUNK_SIZE);
    const regionX = Math.floor(chunkX / REGION_SIZE);
    const regionZ = Math.floor(chunkZ / REGION_SIZE);
    const channel = `region:${client.level}:${regionX}:${regionZ}`;

    if (!regionPlayers.has(channel)) {
      regionPlayers.set(channel, []);
    }

    regionPlayers.get(channel)!.push({
      username: client.username,
      position: position,
      rotation: rotation,
    });
  }

  // Broadcast batched position updates to each region (only if changed)
  for (const [channel, players] of Array.from(regionPlayers.entries())) {
    // Check if this channel's data has changed since last broadcast
    const lastState = lastBroadcastState.get(channel) || new Map();
    let hasChanges = false;

    const currentState = new Map<
      string,
      { position: string; rotation: string }
    >();

    for (const player of players) {
      const posKey = `${player.position.x},${player.position.y},${player.position.z}`;
      const rotKey = `${player.rotation.x},${player.rotation.y}`;
      currentState.set(player.username, { position: posKey, rotation: rotKey });

      const last = lastState.get(player.username);
      if (!last || last.position !== posKey || last.rotation !== rotKey) {
        hasChanges = true;
      }
    }

    // Also check if player count changed
    if (lastState.size !== currentState.size) {
      hasChanges = true;
    }

    // Only broadcast if something changed
    if (hasChanges) {
      const broadcast: PositionUpdatesBroadcast = {
        type: "player-positions",
        players,
      };

      await realtime.send(channel, broadcast);
      lastBroadcastState.set(channel, currentState);
    }
  }
}

// Initialize Redis connections
async function initRedis() {
  await publisher.connect();
  await subscriber.connect();
  await redisStore.connect();
  console.log("Redis connected");

  // Terrain seeds are now initialized per-level when clients connect
}

// Mock Devvit realtime API
export const realtime = {
  send: async (channel: string, data: any) => {
    await publisher.publish(channel, JSON.stringify(data));
    // Only log block modifications, not position updates
    if (data.type === "block-modify") {
      console.log(`Published to ${channel}:`, data);
    }
  },
};

// Handle WebSocket connections (for broadcast channel subscriptions only)
wss.on("connection", (ws: WebSocket) => {
  console.log("WebSocket connected (broadcast channel)");

  ws.on("message", async (message: string) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.type === "subscribe") {
        const channel = msg.channel;

        console.log(`Subscribing to channel: ${channel}`);

        // Add client to channel subscribers
        if (!channelSubscribers.has(channel)) {
          channelSubscribers.set(channel, new Set());

          // Subscribe to Redis channel for broadcasts
          await subscriber.subscribe(channel, (redisMessage) => {
            const data = JSON.parse(redisMessage);
            const subscribers = channelSubscribers.get(channel);

            if (subscribers) {
              subscribers.forEach((clientWs) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify(data));
                }
              });
            }
          });
        }

        channelSubscribers.get(channel)?.add(ws);

        // Send simple confirmation
        ws.send(
          JSON.stringify({
            type: "subscribed",
            channel,
          })
        );

        console.log(`Subscribed to channel: ${channel}`);
      }

      if (msg.type === "unsubscribe") {
        const channel = msg.channel;
        console.log(`Unsubscribing from channel: ${channel}`);

        const subscribers = channelSubscribers.get(channel);
        if (subscribers) {
          subscribers.delete(ws);

          // If no more subscribers, unsubscribe from Redis
          if (subscribers.size === 0) {
            channelSubscribers.delete(channel);
            await subscriber.unsubscribe(channel);
          }
        }

        ws.send(
          JSON.stringify({
            type: "disconnected",
            channel,
          })
        );
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
    }
  });

  ws.on("close", async () => {
    console.log("WebSocket disconnected");

    // Remove this WebSocket from all channel subscriptions
    channelSubscribers.forEach(async (subscribers, channel) => {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        channelSubscribers.delete(channel);
        await subscriber.unsubscribe(channel).catch(console.error);
      }
    });
  });
});

// Express routes
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// HTTP endpoint for initial connection
interface InitialConnectionRequest {
  level: string;
}

interface InitialConnectionResponse {
  mode: "player" | "viewer";
  username: string;
  sessionId: string;
  level: string;
  terrainSeeds: {
    seed: number;
    treeSeed: number;
    stoneSeed: number;
    coalSeed: number;
  };
  spawnPosition: Position;
  initialChunks: Array<{
    chunkX: number;
    chunkZ: number;
    blocks: Array<Block>;
  }>;
  players: Array<Player>;
  playerData?: {
    score: number;
    friends: string[];
    friendedBy: string[];
  };
  message?: string;
}

app.post("/api/connect", async (req, res) => {
  const { level } = req.body as InitialConnectionRequest;
  const actualLevel = level || "default";

  // Generate username
  const username = assignUsername();

  console.log(
    `HTTP connect request from ${username} for level "${actualLevel}"`
  );

  // Check if player is already active in this level
  const isActive = await isPlayerActive(username, actualLevel);

  // Initialize and get terrain seeds
  await initializeTerrainSeeds(actualLevel);
  const terrainSeeds = await getTerrainSeeds(actualLevel);

  // Calculate initial chunks
  const spawnPosition = { x: 0, y: 20, z: 0 };
  const drawDistance = 3;
  const chunksToLoad = calculateInitialChunks(spawnPosition, drawDistance);

  console.log(
    `Calculating initial chunks for ${username}: ${chunksToLoad.length} chunks`
  );

  // Fetch chunks from Redis
  const pipeline = redisStore.multi();
  for (const { chunkX, chunkZ } of chunksToLoad) {
    const chunkKey = getChunkKey(actualLevel, chunkX, chunkZ);
    pipeline.hGetAll(chunkKey);
  }

  const chunkResults = await pipeline.exec();

  // Parse chunk data
  const initialChunks: InitialConnectionResponse["initialChunks"] = [];
  let totalBlocks = 0;

  for (let i = 0; i < chunksToLoad.length; i++) {
    const { chunkX, chunkZ } = chunksToLoad[i];
    const result = chunkResults?.[i];
    const blocks: InitialConnectionResponse["initialChunks"][0]["blocks"] = [];

    if (result && typeof result === "object" && !Array.isArray(result)) {
      const chunkData = result;
      if (Object.keys(chunkData).length > 0) {
        for (const [key, value] of Object.entries(chunkData)) {
          const [_, xStr, yStr, zStr] = key.split(":");
          const data = JSON.parse(value);
          blocks.push({
            x: parseInt(xStr, 10),
            y: parseInt(yStr, 10),
            z: parseInt(zStr, 10),
            type: data.type,
            username: data.username,
            timestamp: data.timestamp,
            placed: data.placed !== undefined ? data.placed : true,
            removed: data.removed,
          });
        }
      }
    }

    totalBlocks += blocks.length;
    initialChunks.push({ chunkX, chunkZ, blocks });
  }

  console.log(
    `Sending ${initialChunks.length} initial chunks with ${totalBlocks} total blocks to ${username}`
  );

  // Get existing players from connectedClients (filtered by level)
  const players: InitialConnectionResponse["players"] = Array.from(
    connectedClients.values()
  )
    .filter((c) => c.level === actualLevel) // Only include players in the same level
    .map((c) => ({
      username: c.username,
      position: c.position || { x: 0, y: 20, z: 0 },
      rotation: c.rotation || { x: 0, y: 0, z: 0 },
    }));

  if (isActive) {
    // Player already active - enter Viewer Mode
    console.log(`${username} already active, entering Viewer Mode`);

    // Do NOT add to connectedClients map (viewers are invisible)
    const response: InitialConnectionResponse = {
      mode: "viewer",
      username,
      sessionId: `${username}_viewer_${Date.now()}`,
      level: actualLevel,
      terrainSeeds,
      spawnPosition,
      initialChunks,
      players,
      message:
        "You are already playing from another device. Entering Viewer Mode.",
    };

    return res.json(response);
  }

  // Player not active - enter Player Mode
  console.log(`${username} entering Player Mode`);

  // Add to active players set
  await addActivePlayer(username, actualLevel);

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

  const response: InitialConnectionResponse = {
    mode: "player",
    username,
    sessionId: username, // Use username as sessionId for compatibility
    level: actualLevel,
    terrainSeeds,
    spawnPosition,
    initialChunks,
    players,
    playerData: {
      score: playerData.score,
      friends: playerData.friends,
      friendedBy: playerData.friendedBy,
    },
  };

  res.json(response);
});

// HTTP endpoint for disconnect
interface DisconnectRequest {
  username: string;
  level: string;
}

app.post("/api/disconnect", async (req, res) => {
  const { username, level } = req.body as DisconnectRequest;

  console.log(`HTTP disconnect request from ${username} for level "${level}"`);

  // Remove from active players set
  await removeActivePlayer(username, level);

  // Remove client from connected clients
  connectedClients.delete(username);

  // Update last active timestamp in player data
  const playerKey = `player:${username}:${level}`;
  const exists = await redisStore.exists(playerKey);
  if (exists) {
    await redisStore.hSet(playerKey, "lastActive", Date.now().toString());
  }

  // No need to broadcast - the next position update will naturally exclude this player
  console.log(`Removed ${username} from connected clients and active players`);

  res.json({ ok: true });
});

// Task 2.1: Friend management endpoint interfaces
interface AddFriendRequest {
  username: string;
  level: string;
  friendUsername: string;
}

interface AddFriendResponse {
  ok: boolean;
  message?: string;
}

interface RemoveFriendRequest {
  username: string;
  level: string;
  friendUsername: string;
}

interface RemoveFriendResponse {
  ok: boolean;
  message?: string;
}

// Task 2.1: Add friend endpoint (synchronous HTTP request/response)
app.post("/api/friends/add", async (req, res) => {
  const { username, level, friendUsername } = req.body as AddFriendRequest;

  console.log(`${username} attempting to add friend ${friendUsername}`);

  try {
    // Validate: can't add self
    if (username === friendUsername) {
      return res.status(400).json({
        ok: false,
        message: "Cannot add yourself as friend",
      });
    }

    // Add friend (creates player data if needed)
    await addPlayerFriend(username, level, friendUsername);

    // Get updated friends list to return
    const playerKey = `player:${username}:${level}`;
    const friendsData = await redisStore.hGet(playerKey, "friends");
    const friends: string[] = friendsData
      ? JSON.parse(friendsData.toString())
      : [];

    console.log(`${username} successfully added ${friendUsername} as friend`);

    res.json({
      ok: true,
      friends,
      message: `Added ${friendUsername} as friend`,
    });
  } catch (error) {
    console.error("Failed to add friend:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to add friend",
    });
  }
});

// Task 2.2: Remove friend endpoint (synchronous HTTP request/response)
app.post("/api/friends/remove", async (req, res) => {
  const { username, level, friendUsername } = req.body as RemoveFriendRequest;

  console.log(`${username} attempting to remove friend ${friendUsername}`);

  try {
    // Remove friend
    await removePlayerFriend(username, level, friendUsername);

    // Get updated friends list to return
    const playerKey = `player:${username}:${level}`;
    const friendsData = await redisStore.hGet(playerKey, "friends");
    const friends: string[] = friendsData
      ? JSON.parse(friendsData.toString())
      : [];

    console.log(
      `${username} successfully removed ${friendUsername} from friends`
    );

    res.json({
      ok: true,
      friends,
      message: `Removed ${friendUsername} from friends`,
    });
  } catch (error) {
    console.error("Failed to remove friend:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to remove friend",
    });
  }
});

// Task 3.1: Upvote endpoint interfaces
interface UpvoteRequest {
  username: string; // The upvoter
  level: string;
  builderUsername: string; // The builder being upvoted
}

interface UpvoteResponse {
  ok: boolean;
  message?: string;
}

/**
 * Task 3.1: Process upvote asynchronously
 * Increments builder's score and broadcasts update to all clients in level
 */
async function processUpvote(
  username: string,
  level: string,
  builderUsername: string
): Promise<void> {
  // Validate: can't upvote self
  if (username === builderUsername) {
    throw new Error("Cannot upvote yourself");
  }

  // Validate: builder must exist
  const builderKey = `player:${builderUsername}:${level}`;
  const builderExists = await redisStore.exists(builderKey);

  if (!builderExists) {
    throw new Error("Builder not found");
  }

  // Increment builder's score in Redis using hIncrBy
  const newScore = await redisStore.hIncrBy(builderKey, "score", 1);

  // Update scores sorted set using zIncrBy for leaderboard
  await redisStore.zIncrBy(`scores:${level}`, 1, builderUsername);

  // Increment totalUpvotesReceived counter for builder
  await redisStore.hIncrBy(builderKey, "totalUpvotesReceived", 1);

  // Increment totalUpvotesGiven counter for upvoter
  const upvoterKey = `player:${username}:${level}`;
  await redisStore.hIncrBy(upvoterKey, "totalUpvotesGiven", 1);

  console.log(
    `${builderUsername} upvoted by ${username}, new score: ${newScore}`
  );
}

// Task 3.1: Upvote endpoint (fire-and-forget with async processing)
app.post("/api/upvote", async (req, res) => {
  const { username, level, builderUsername } = req.body as UpvoteRequest;

  console.log(`${username} upvoting ${builderUsername} in level ${level}`);

  // Immediate response for snappy UX (fire-and-forget pattern)
  res.json({ ok: true, message: "Upvote processing" });

  // Async processing (don't await) - fire-and-forget pattern
  processUpvote(username, level, builderUsername).catch((error) => {
    console.error("Failed to process upvote:", error);
    // In production, this would be sent to error tracking service
  });
});

// Task 5.1: Chat endpoint interfaces
interface ChatRequest {
  username: string;
  level: string;
  message: string;
}

interface ChatResponse {
  ok: boolean;
  message?: string;
}

interface ChatBroadcast {
  type: "chat-message";
  username: string;
  message: string;
  timestamp: number;
}

// Task 5.2-5.4: POST /api/chat endpoint
app.post("/api/chat", async (req, res) => {
  const { username, level, message } = req.body as ChatRequest;

  // Task 5.4: Log incoming chat message
  console.log(`Chat from ${username}: ${message}`);

  // Task 5.2: Validate message is not empty
  if (!message || !message.trim()) {
    return res.status(400).json({ ok: false, message: "Message is required" });
  }

  // Task 5.2: Validate message length <= 200 characters
  if (message.length > 200) {
    return res
      .status(400)
      .json({ ok: false, message: "Message too long (max 200 characters)" });
  }

  // Task 5.2: Get player's current position from connectedClients
  const client = connectedClients.get(username);
  if (!client) {
    return res.status(404).json({ ok: false, message: "Player not connected" });
  }

  // Task 5.3: Calculate regional channel from position
  const position = client.position || { x: 0, y: 20, z: 0 };
  const channel = getRegionalChannelFromPosition(level, position);

  // Task 5.3: Create ChatBroadcast object
  const broadcast: ChatBroadcast = {
    type: "chat-message",
    username,
    message: message.trim(),
    timestamp: Date.now(),
  };

  // Task 5.3: Broadcast to regional channel
  await realtime.send(channel, broadcast);

  // Task 5.4: Log broadcast with channel name
  console.log(`Broadcast chat to channel ${channel}`);

  // Task 5.3: Return immediate response
  res.json({ ok: true });
});

// Task 2.1: Define interfaces for modification batch endpoint
interface ModificationBatchRequest {
  username: string;
  level: string;
  modifications: Array<{
    position: Position;
    blockType: number | null; // null for removal
    action: "place" | "remove";
    clientTimestamp: number;
  }>;
}

interface ModificationBatchResponse {
  ok: boolean;
  failedAt: number | null; // Index where validation failed, null if all succeeded
  message?: string;
}

// Task 2.2: Validate a single modification and return the existing block type if removing
async function validateModification(
  level: string,
  mod: {
    position: Position;
    blockType: number | null;
    action: "place" | "remove";
  }
): Promise<{ valid: boolean; existingType?: number }> {
  // No validation for now - just return valid and use client's block type
  return { valid: true, existingType: mod.blockType ?? undefined };
}

// Task 2.5: Persist batch to Redis using pipeline
async function persistModificationBatch(
  level: string,
  modifications: Array<{
    position: Position;
    blockType: number | null;
    action: "place" | "remove";
    username: string;
    serverTimestamp: number;
  }>
): Promise<void> {
  const pipeline = redisStore.multi();

  console.log(
    `=== PERSISTING ${modifications.length} MODIFICATIONS TO REDIS ===`
  );

  for (const mod of modifications) {
    const { position, action, blockType, username, serverTimestamp } = mod;
    const { chunkX, chunkZ } = getChunkCoordinates(position.x, position.z);
    const chunkKey = getChunkKey(level, chunkX, chunkZ);
    const blockKey = getBlockKey(position.x, position.y, position.z);

    if (action === "place" && blockType !== null) {
      const value = JSON.stringify({
        type: blockType,
        username,
        timestamp: serverTimestamp,
        placed: true,
      });
      console.log(`REDIS HSET ${chunkKey} ${blockKey} = ${value}`);
      pipeline.hSet(chunkKey, blockKey, value);
    } else if (action === "remove") {
      const value = JSON.stringify({
        username,
        timestamp: serverTimestamp,
        placed: false,
      });
      console.log(`REDIS HSET ${chunkKey} ${blockKey} = ${value}`);
      pipeline.hSet(chunkKey, blockKey, value);
    }
  }

  await pipeline.exec();
  console.log(`Persisted ${modifications.length} modifications to Redis`);
}

// Task 2.4: Calculate regional channel from block position
function getRegionalChannelFromPosition(
  level: string,
  position: Position
): string {
  const REGION_SIZE = 15; // Must match client-side REGION_SIZE
  const { chunkX, chunkZ } = getChunkCoordinates(position.x, position.z);
  const regionX = Math.floor(chunkX / REGION_SIZE);
  const regionZ = Math.floor(chunkZ / REGION_SIZE);
  return `region:${level}:${regionX}:${regionZ}`;
}

// Task 2.1-2.6: HTTP modification endpoint
app.post("/api/modifications", async (req, res) => {
  const batch: ModificationBatchRequest = req.body;

  // Task 2.1: Log batch size and username
  console.log(
    `Received batch of ${batch.modifications.length} modifications from ${batch.username}`
  );

  const validatedMods: Array<{
    position: Position;
    blockType: number | null;
    action: "place" | "remove";
    username: string;
    clientTimestamp: number;
    serverTimestamp: number;
  }> = [];
  let failedAt: number | null = null;

  // Task 2.3: Sequential validation loop
  for (let i = 0; i < batch.modifications.length; i++) {
    const mod = batch.modifications[i];

    // Task 2.2: Validate modification
    const validation = await validateModification(batch.level, mod);

    if (!validation.valid) {
      // Task 2.3: Set failedAt index and break
      failedAt = i;
      console.log(`Validation failed at index ${i}`);
      break;
    }

    // Task 2.4: Add server timestamp
    const serverTimestamp = Date.now();

    const validatedMod = {
      ...mod,
      username: batch.username,
      serverTimestamp,
    };

    validatedMods.push(validatedMod);

    // Task 2.4: Immediately broadcast to regional channel
    const regionalChannel = getRegionalChannelFromPosition(
      batch.level,
      mod.position
    );

    await realtime.send(regionalChannel, {
      type: "block-modify",
      ...validatedMod,
    });

    console.log(
      `Broadcast ${mod.action} to regional channel ${regionalChannel}`
    );
  }

  // Task 2.5: Persist validated modifications to Redis (batched)
  if (validatedMods.length > 0) {
    await persistModificationBatch(batch.level, validatedMods);
  }

  // Task 2.6: Send response to client
  const response: ModificationBatchResponse = {
    ok: failedAt === null,
    failedAt: failedAt,
    message:
      failedAt === null
        ? `${validatedMods.length} modifications applied`
        : `Validation failed at modification ${failedAt}`,
  };

  res.json(response);
});

// Task 3.1: Define interfaces for chunk state endpoint
interface ChunkStateRequest {
  username: string;
  level: string;
  chunks: Array<{ chunkX: number; chunkZ: number }>;
}

interface ChunkStateResponse {
  chunks: Array<{
    chunkX: number;
    chunkZ: number;
    blocks: Array<Block>;
  }>;
  requestTimestamp: number;
  responseTimestamp: number;
}

// Task 3.1-3.3: HTTP chunk state endpoint
app.post("/api/chunk-state", async (req, res) => {
  const request: ChunkStateRequest = req.body;
  const { username, level, chunks } = request;

  const requestTimestamp = Date.now();

  // Task 3.1: Log request with chunk count
  console.log(
    `Chunk state request from ${username} for ${chunks.length} chunks in level ${level}`
  );

  // Task 3.1: Validate chunk coordinates are within bounds
  const validChunks = chunks.filter(({ chunkX, chunkZ }) => {
    const isValid = Math.abs(chunkX) <= 10000 && Math.abs(chunkZ) <= 10000;
    if (!isValid) {
      console.log(`Skipping invalid chunk coordinates: (${chunkX}, ${chunkZ})`);
    }
    return isValid;
  });

  console.log(
    `Processing ${validChunks.length} valid chunks (${
      chunks.length - validChunks.length
    } invalid)`
  );

  // Task 3.2: Use Redis pipelining for batch fetch
  const pipeline = redisStore.multi();

  for (const { chunkX, chunkZ } of validChunks) {
    const chunkKey = getChunkKey(level, chunkX, chunkZ);
    pipeline.hGetAll(chunkKey);
  }

  // Task 3.2: Execute pipeline and collect results
  const results = await pipeline.exec();

  // Task 3.2: Parse chunk data for each result
  const chunkStates: Array<{
    chunkX: number;
    chunkZ: number;
    blocks: Array<Block>;
  }> = [];

  for (let i = 0; i < validChunks.length; i++) {
    const { chunkX, chunkZ } = validChunks[i];
    const result = results?.[i];

    // Parse chunk data
    const blocks: Array<Block> = [];

    // Redis multi().exec() returns direct results, not [error, value] tuples
    if (result && typeof result === "object" && !Array.isArray(result)) {
      // Type assertion needed for pipeline results
      const chunkData: Record<string, string> = result as any;

      if (Object.keys(chunkData).length > 0) {
        console.log(`=== LOADING CHUNK (${chunkX}, ${chunkZ}) FROM REDIS ===`);
        console.log(`  Total keys in chunk: ${Object.keys(chunkData).length}`);

        for (const [key, value] of Object.entries(chunkData)) {
          // Parse block key: "block:x:y:z"
          const [_, xStr, yStr, zStr] = key.split(":");
          const x = parseInt(xStr, 10);
          const y = parseInt(yStr, 10);
          const z = parseInt(zStr, 10);

          // Parse block data
          const data = JSON.parse(value);

          console.log(
            `REDIS HGET chunk(${chunkX},${chunkZ}) ${key} = ${value}`
          );

          blocks.push({
            x,
            y,
            z,
            type: data.type,
            username: data.username,
            timestamp: data.timestamp,
            placed: data.placed !== undefined ? data.placed : true,
            removed: data.removed,
          });
        }

        const placedCount = blocks.filter((b) => b.placed).length;
        const removedCount = blocks.filter((b) => !b.placed).length;
        console.log(
          `  Loaded ${placedCount} placed, ${removedCount} removed blocks`
        );
      }
    }

    chunkStates.push({ chunkX, chunkZ, blocks });
  }

  const responseTimestamp = Date.now();

  // Task 3.3: Create response with chunks array and timestamps
  const response: ChunkStateResponse = {
    chunks: chunkStates,
    requestTimestamp,
    responseTimestamp,
  };

  // Task 3.3: Log response time and chunk count
  const responseTime = responseTimestamp - requestTimestamp;
  console.log(
    `Sent chunk state response: ${chunkStates.length} chunks, ${responseTime}ms`
  );

  // Task 3.3: Send JSON response
  res.json(response);
});

// HTTP endpoint for position updates
interface PositionUpdateRequest {
  username: string;
  position: Position;
  rotation: Rotation;
}

app.post("/api/position", async (req, res) => {
  const { username, position, rotation } = req.body as PositionUpdateRequest;

  // Find the client by username
  let client: ConnectedClient | undefined;
  for (const c of Array.from(connectedClients.values())) {
    if (c.username === username) {
      client = c;
      break;
    }
  }

  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  // Update client position
  client.position = position;
  client.rotation = rotation;
  client.lastPositionUpdate = Date.now();

  res.json({ ok: true });
});

// Example endpoint to send messages (for testing)
app.post("/send", async (req, res) => {
  const { channel, data } = req.body;
  if (!channel || !data) {
    return res.status(400).json({ error: "channel and data required" });
  }

  await realtime.send(channel, data);
  res.json({ success: true });
});

// Start server
async function start() {
  try {
    await initRedis();

    // Task 12: Start position update broadcasting (10 times per second)
    setInterval(() => {
      broadcastPositionUpdates().catch((error) => {
        console.error("Error broadcasting position updates:", error);
      });
    }, 100); // 100ms = 10 times per second

    // Task 1.5: Start inactivity cleanup (every 10 seconds)
    setInterval(() => {
      cleanupInactivePlayers().catch((error) => {
        console.error("Error cleaning up inactive players:", error);
      });
    }, 10000); // 10 seconds

    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`WebSocket server ready`);
      console.log(`Position updates broadcasting at 10 Hz`);
      console.log(`Inactivity cleanup running every 10 seconds`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
