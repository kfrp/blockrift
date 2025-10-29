/**
 * Shared helper functions for endpoint handlers
 * These functions use global redis and realtime variables
 * and are used by multiple endpoint handlers
 */

import { redis, realtime } from "../globals";
import type {
  Position,
  PlayerData,
  TerrainSeeds,
  ChunkBlock,
  ConnectedClient,
  FriendshipAddedMessage,
  FriendshipRemovedMessage,
} from "../types";

// ============================================================================
// CONSTANTS
// ============================================================================

const CHUNK_SIZE = 24; // Matches client-side chunk system
const REGION_SIZE = 15; // 15 chunks per region

// Spiral offset pattern array for smart spawn positioning
// 25 position offsets in spiral pattern, all within 360 blocks (one region)
const SPIRAL_OFFSETS = [
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
  { x: 0, z: 10 }, // Further south
  { x: -10, z: 0 }, // Further west
  { x: 0, z: -10 }, // Further north
  { x: 10, z: 10 }, // Far SE
  { x: -10, z: 10 }, // Far SW
  { x: -10, z: -10 }, // Far NW
  { x: 10, z: -10 }, // Far NE
  { x: 15, z: 0 }, // Very far east
  { x: 0, z: 15 }, // Very far south
  { x: -15, z: 0 }, // Very far west
  { x: 0, z: -15 }, // Very far north
  { x: 15, z: 15 }, // Very far SE
  { x: -15, z: 15 }, // Very far SW
  { x: -15, z: -15 }, // Very far NW
  { x: 15, z: -15 }, // Very far NE
];

// ============================================================================
// COORDINATE CALCULATIONS
// ============================================================================

/**
 * Convert block position to chunk coordinates
 * @param x Block x position
 * @param z Block z position
 * @returns Chunk coordinates {chunkX, chunkZ}
 */
export function getChunkCoordinates(
  x: number,
  z: number
): { chunkX: number; chunkZ: number } {
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkZ = Math.floor(z / CHUNK_SIZE);
  return { chunkX, chunkZ };
}

/**
 * Calculate regional channel from block position
 * @param level Level identifier
 * @param position Block position
 * @returns Regional channel name
 */
export function getRegionalChannelFromPosition(
  level: string,
  position: Position
): string {
  const { chunkX, chunkZ } = getChunkCoordinates(position.x, position.z);
  const regionX = Math.floor(chunkX / REGION_SIZE);
  const regionZ = Math.floor(chunkZ / REGION_SIZE);
  return `region:${level}:${regionX}:${regionZ}`;
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

// ============================================================================
// REDIS OPERATIONS - PLAYER DATA
// ============================================================================

/**
 * Get or create player data in Redis
 * Initializes new player with score=0, empty friends lists
 */
export async function getOrCreatePlayerData(
  username: string,
  level: string
): Promise<PlayerData> {
  const key = `player:${username}:${level}`;
  const exists = await redis.exists(key);

  if (!exists) {
    // Initialize new player
    const now = Date.now();
    const initialData: PlayerData = {
      score: 0,
      lastActive: now,
      lastJoined: now,
      lastKnownPosition: null,
      totalUpvotesGiven: 0,
      totalUpvotesReceived: 0,
    };

    await redis.hSet(key, {
      score: "0",
      lastActive: now.toString(),
      lastJoined: now.toString(),
      lastKnownPosition: "",
      totalUpvotesGiven: "0",
      totalUpvotesReceived: "0",
    });

    // Add to scores sorted set for leaderboard
    await redis.zAdd(`scores:${level}`, { member: username, score: 0 });

    // Set TTL to 7 days
    await redis.expire(key, 7 * 24 * 60 * 60);

    return initialData;
  }

  // Load existing player data
  const data = await redis.hGetAll(key);

  // Refresh TTL
  await redis.expire(key, 7 * 24 * 60 * 60);

  // Type assertion for Redis hash result
  const hashData = data as unknown as Record<string, string>;

  // Parse lastKnownPosition from JSON string
  let lastKnownPosition: Position | null = null;
  if (hashData.lastKnownPosition && hashData.lastKnownPosition !== "") {
    try {
      lastKnownPosition = JSON.parse(hashData.lastKnownPosition);
    } catch (e) {
      console.error("Failed to parse lastKnownPosition:", e);
    }
  }

  return {
    score: parseInt(hashData.score || "0", 10),
    lastActive: parseInt(hashData.lastActive || "0", 10),
    lastJoined: parseInt(hashData.lastJoined || "0", 10),
    lastKnownPosition,
    totalUpvotesGiven: parseInt(hashData.totalUpvotesGiven || "0", 10),
    totalUpvotesReceived: parseInt(hashData.totalUpvotesReceived || "0", 10),
  };
}

/**
 * Update player score atomically
 * Returns the new score value
 */
export async function updatePlayerScore(
  username: string,
  level: string,
  increment: number
): Promise<number> {
  const key = `player:${username}:${level}`;

  // Atomic increment in Redis hash
  const newScore = await redis.hIncrBy(key, "score", increment);

  // Update sorted set for leaderboard
  await redis.zIncrBy(`scores:${level}`, username, increment);

  // Update last active timestamp
  await redis.hSet(key, { lastActive: Date.now().toString() });

  return Number(newScore);
}

// ============================================================================
// REDIS OPERATIONS - GLOBAL FRIENDSHIPS
// ============================================================================

/**
 * Get player's friends list from global hash
 */
export async function getPlayerFriends(username: string): Promise<string[]> {
  const friendsData = await redis.hGet("friends", username);
  if (!friendsData) {
    return [];
  }
  try {
    return JSON.parse(friendsData.toString());
  } catch (e) {
    console.error(`Failed to parse friends for ${username}:`, e);
    return [];
  }
}

/**
 * Get list of users who have friended this player from global hash
 */
export async function getPlayerFriendedBy(username: string): Promise<string[]> {
  const friendedByData = await redis.hGet("friendedBy", username);
  if (!friendedByData) {
    return [];
  }
  try {
    return JSON.parse(friendedByData.toString());
  } catch (e) {
    console.error(`Failed to parse friendedBy for ${username}:`, e);
    return [];
  }
}

/**
 * Add a friend to player's global friends list and update friend's global friendedBy list
 */
export async function addGlobalFriend(
  username: string,
  friendUsername: string
): Promise<void> {
  // Update player's friends list
  const playerFriends = await getPlayerFriends(username);
  if (!playerFriends.includes(friendUsername)) {
    playerFriends.push(friendUsername);
    await redis.hSet("friends", { [username]: JSON.stringify(playerFriends) });
  }

  // Update friend's friendedBy list
  const friendedBy = await getPlayerFriendedBy(friendUsername);
  if (!friendedBy.includes(username)) {
    friendedBy.push(username);
    await redis.hSet("friendedBy", {
      [friendUsername]: JSON.stringify(friendedBy),
    });
  }
}

/**
 * Remove a friend from player's global friends list and update friend's global friendedBy list
 */
export async function removeGlobalFriend(
  username: string,
  friendUsername: string
): Promise<void> {
  // Remove from player's friends list
  const playerFriends = await getPlayerFriends(username);
  const updatedPlayerFriends = playerFriends.filter(
    (f) => f !== friendUsername
  );

  if (updatedPlayerFriends.length !== playerFriends.length) {
    await redis.hSet("friends", {
      [username]: JSON.stringify(updatedPlayerFriends),
    });
  }

  // Remove from friend's friendedBy list
  const friendedBy = await getPlayerFriendedBy(friendUsername);
  const updatedFriendedBy = friendedBy.filter((f) => f !== username);

  if (updatedFriendedBy.length !== friendedBy.length) {
    await redis.hSet("friendedBy", {
      [friendUsername]: JSON.stringify(updatedFriendedBy),
    });
  }
}

// ============================================================================
// REDIS OPERATIONS - ACTIVE PLAYERS
// ============================================================================

/**
 * Check if a player is currently active in a level
 * Uses a hash to track active players (Devvit doesn't support sets)
 */
export async function isPlayerActive(
  username: string,
  level: string
): Promise<boolean> {
  const key = `players:${level}`;
  const result = await redis.hGet(key, username);
  return result !== null && result !== undefined;
}

/**
 * Add a player to the active players hash for a level
 * Stores timestamp as value
 */
export async function addActivePlayer(
  username: string,
  level: string
): Promise<void> {
  const key = `players:${level}`;
  await redis.hSet(key, { [username]: Date.now().toString() });
}

/**
 * Remove a player from the active players hash for a level
 */
export async function removeActivePlayer(
  username: string,
  level: string
): Promise<void> {
  const key = `players:${level}`;
  await redis.hDel(key, [username]);
}

// ============================================================================
// REDIS OPERATIONS - TERRAIN SEEDS
// ============================================================================

/**
 * Get Redis key for terrain seeds by level
 */
function getTerrainSeedsKey(level: string): string {
  return `terrain:seeds:${level}`;
}

/**
 * Initialize terrain seeds in Redis for a specific level if they don't exist
 */
export async function initializeTerrainSeeds(level: string): Promise<void> {
  const key = getTerrainSeedsKey(level);
  const exists = await redis.exists(key);

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

    await redis.set(key, JSON.stringify(seeds));
  } else {
    const existingSeeds = await getTerrainSeeds(level);
  }
}

/**
 * Retrieve terrain seeds from Redis for a specific level
 */
export async function getTerrainSeeds(level: string): Promise<TerrainSeeds> {
  const key = getTerrainSeedsKey(level);
  const seedsData = await redis.get(key);

  if (!seedsData) {
    throw new Error(`Terrain seeds not found in Redis for level "${level}"`);
  }

  return JSON.parse(seedsData.toString());
}

// ============================================================================
// REDIS OPERATIONS - CHUNK DATA
// ============================================================================

/**
 * Retrieve all blocks in a chunk
 */
export async function getChunkBlocks(
  level: string,
  chunkX: number,
  chunkZ: number
): Promise<Array<ChunkBlock>> {
  const chunkKey = getChunkKey(level, chunkX, chunkZ);
  const chunkData = await redis.hGetAll(chunkKey);

  const blocks = Object.entries(chunkData).map(([key, value]) => {
    // Parse block key: "block:x:y:z"
    const [_, xStr, yStr, zStr] = key.split(":");
    const x = parseInt(xStr!, 10);
    const y = parseInt(yStr!, 10);
    const z = parseInt(zStr!, 10);

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

/**
 * Store a block placement in Redis using chunk-based hash storage
 */
export async function storeBlockPlacement(
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

  await redis.hSet(chunkKey, { [blockKey]: blockData });
}

/**
 * Remove a block from Redis chunk hash
 */
export async function removeBlock(
  level: string,
  x: number,
  y: number,
  z: number
): Promise<void> {
  const { chunkX, chunkZ } = getChunkCoordinates(x, z);
  const chunkKey = getChunkKey(level, chunkX, chunkZ);
  const blockKey = getBlockKey(x, y, z);

  await redis.hDel(chunkKey, [blockKey]);
}

// ============================================================================
// PLAYER COUNT MANAGEMENT
// ============================================================================

// Track player count per level (in-memory)
const levelPlayerCounts = new Map<string, number>();

/**
 * Increment player count for a level and broadcast update
 */
export async function incrementPlayerCount(level: string): Promise<void> {
  const currentCount = levelPlayerCounts.get(level) || 0;
  const newCount = currentCount + 1;
  levelPlayerCounts.set(level, newCount);

  // Broadcast to game-level channel
  await realtime.send(`game:${level}`, {
    type: "player-count-update",
    level,
    count: newCount,
  });
}

/**
 * Decrement player count for a level and broadcast update
 */
export async function decrementPlayerCount(level: string): Promise<void> {
  const currentCount = levelPlayerCounts.get(level) || 0;
  const newCount = Math.max(0, currentCount - 1);
  levelPlayerCounts.set(level, newCount);

  // Broadcast to game-level channel
  await realtime.send(`game:${level}`, {
    type: "player-count-update",
    level,
    count: newCount,
  });
}

/**
 * Get current player count for a level
 */
export function getPlayerCount(level: string): number {
  return levelPlayerCounts.get(level) || 0;
}

// ============================================================================
// SPAWN POSITION CALCULATION
// ============================================================================

/**
 * Check if a candidate position is occupied by any active player
 * @param candidatePosition Position to check
 * @param connectedClients Map of connected clients
 * @param level Level to check within
 * @param radius Radius to check for occupation (default 5 blocks)
 * @returns true if occupied, false if available
 */
function isPositionOccupied(
  candidatePosition: Position,
  connectedClients: Map<string, ConnectedClient>,
  level: string,
  radius: number = 5
): boolean {
  // Iterate through connected clients in the same level
  for (const client of Array.from(connectedClients.values())) {
    if (client.level !== level) {
      continue; // Skip players in different levels
    }

    const playerPosition = client.position;
    if (!playerPosition) {
      continue; // Skip if player has no position yet
    }

    // Calculate distance between candidate position and player position
    const dx = candidatePosition.x - playerPosition.x;
    const dy = candidatePosition.y - playerPosition.y;
    const dz = candidatePosition.z - playerPosition.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Check if any player is within radius
    if (distance < radius) {
      return true; // Position is occupied
    }
  }

  return false; // Position is available
}

/**
 * Check if there are custom blocks at the given X,Z position (any Y level)
 * @param level Level to check
 * @param x X coordinate
 * @param z Z coordinate
 * @returns true if custom blocks exist at this position
 */
async function hasCustomBlocksAtPosition(
  level: string,
  x: number,
  z: number
): Promise<boolean> {
  const { chunkX, chunkZ } = getChunkCoordinates(x, z);
  const chunkKey = getChunkKey(level, chunkX, chunkZ);

  // Get all blocks in this chunk
  const chunkData = await redis.hGetAll(chunkKey);

  // Check if any blocks match the X,Z position
  for (const key of Object.keys(chunkData)) {
    const [_, xStr, _yStr, zStr] = key.split(":");
    const blockX = parseInt(xStr!, 10);
    const blockZ = parseInt(zStr!, 10);

    if (blockX === x && blockZ === z) {
      return true; // Found a custom block at this position
    }
  }

  return false; // No custom blocks at this position
}

/**
 * Calculate spawn position for a player
 * @param level Level the player is joining
 * @param connectedClients Map of connected clients
 * @param lastKnownPosition Optional last known position from Redis
 * @returns Spawn position
 */
export async function calculateSpawnPosition(
  level: string,
  connectedClients: Map<string, ConnectedClient>,
  lastKnownPosition?: Position | null
): Promise<Position> {
  // If lastKnownPosition exists, return it immediately
  if (lastKnownPosition) {
    return lastKnownPosition;
  }

  // Randomize X coordinate within region bounds (±180 blocks to stay in same region)
  // Region size is 15 chunks * 24 blocks = 360 blocks
  const randomX = Math.floor(Math.random() * 360) - 180; // Range: -180 to 179
  const randomZ = Math.floor(Math.random() * 360) - 180; // Range: -180 to 179

  // Default spawn position with randomized X,Z
  // Y is set high (50) so player spawns above terrain and falls to ground
  const defaultSpawn: Position = { x: randomX, y: 50, z: randomZ };

  // Try each spiral offset position from the randomized default spawn
  for (const offset of SPIRAL_OFFSETS) {
    const candidatePosition: Position = {
      x: defaultSpawn.x + offset.x,
      y: defaultSpawn.y,
      z: defaultSpawn.z + offset.z,
    };

    // Check if position is occupied by another player
    if (isPositionOccupied(candidatePosition, connectedClients, level, 5)) {
      continue; // Try next position
    }

    // Check if there are custom blocks at this X,Z position
    const hasCustomBlocks = await hasCustomBlocksAtPosition(
      level,
      Math.floor(candidatePosition.x),
      Math.floor(candidatePosition.z)
    );

    if (!hasCustomBlocks) {
      return candidatePosition;
    } else {
    }
  }

  return defaultSpawn;
}

// ============================================================================
// FRIENDSHIP BROADCASTING
// ============================================================================

interface ActiveLevel {
  level: string;
  position: Position;
}

/**
 * Find all active levels for a user (levels joined within last 2 hours)
 * Returns array of {level, position} objects
 */
export async function findActiveLevels(
  username: string
): Promise<ActiveLevel[]> {
  const TWO_HOURS_MS = 7200000; // 2 hours in milliseconds
  const now = Date.now();

  // Get list of levels this user has joined from tracking hash
  // Note: Devvit doesn't support KEYS or SCAN, so we maintain a separate hash
  const userLevelsKey = `user:${username}:levels`;
  const levelsData = await redis.hGetAll(userLevelsKey);

  const activeLevels: ActiveLevel[] = [];

  for (const [level, lastJoinedStr] of Object.entries(levelsData)) {
    const lastJoined = parseInt(lastJoinedStr, 10);

    // Filter levels where lastJoined is within 2 hours
    if (now - lastJoined <= TWO_HOURS_MS) {
      // Retrieve lastKnownPosition from player data
      const playerKey = `player:${username}:${level}`;
      const positionStr = await redis.hGet(playerKey, "lastKnownPosition");
      let position: Position = { x: 0, y: 20, z: 0 }; // Default spawn

      if (positionStr && positionStr !== "") {
        try {
          position = JSON.parse(positionStr);
        } catch (e) {
          console.error(
            `Failed to parse lastKnownPosition for ${username} in ${level}:`,
            e
          );
        }
      }

      activeLevels.push({ level, position });
    }
  }

  return activeLevels;
}

/**
 * Broadcast friendship update to all active levels where the friend is present
 * @param friendUsername The user whose friendship status changed
 * @param action 'added' or 'removed'
 * @param byUsername The user who performed the action
 * @param connectedClients Map of currently connected clients (optional, for checking current connection)
 */
export async function broadcastFriendshipUpdate(
  friendUsername: string,
  action: "added" | "removed",
  byUsername: string,
  connectedClients?: Map<string, ConnectedClient>
): Promise<void> {
  // First check if friend is currently connected (most efficient path)
  if (connectedClients) {
    const connectedClient = connectedClients.get(friendUsername);
    if (connectedClient) {
      // Friend is currently connected - only broadcast to their current level
      const message: FriendshipAddedMessage | FriendshipRemovedMessage =
        action === "added"
          ? {
              type: "friendship-added",
              targetUsername: friendUsername,
              byUsername,
              message: `${byUsername} added you as a friend`,
            }
          : {
              type: "friendship-removed",
              targetUsername: friendUsername,
              byUsername,
              message: `${byUsername} removed you as a friend`,
            };

      const channel = `game:${connectedClient.level}`;

      await realtime.send(channel, message);

      return;
    }
  }

  // Friend is not currently connected - check recent activity
  const activeLevels = await findActiveLevels(friendUsername);

  if (activeLevels.length === 0) {
    return;
  }

  // For each active level, broadcast to the game-level channel

  for (const { level } of activeLevels) {
    // Create broadcast message
    const message: FriendshipAddedMessage | FriendshipRemovedMessage =
      action === "added"
        ? {
            type: "friendship-added",
            targetUsername: friendUsername,
            byUsername,
            message: `${byUsername} added you as a friend`,
          }
        : {
            type: "friendship-removed",
            targetUsername: friendUsername,
            byUsername,
            message: `${byUsername} removed you as a friend`,
          };

    // Broadcast to game-level channel
    const channel = `game:${level}`;

    await realtime.send(channel, message);
  }
}
