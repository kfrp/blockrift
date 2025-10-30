/**
 * Connect endpoint handler
 * Handles initial connection and game state retrieval
 */

import { redis, realtime } from "../globals";
import type {
  InitialConnectionResponse,
  ConnectedClient,
  Block,
  Position,
} from "../types";
import { CHUNK_SIZE, REGION_SIZE } from "../types";
import {
  getOrCreatePlayerData,
  getPlayerFriends,
  getPlayerFriendedBy,
  initializeTerrainSeeds,
  getTerrainSeeds,
  addActivePlayer,
  calculateSpawnPosition,
  incrementPlayerCount,
  getPlayerCount,
} from "./helpers";
import { calculateInitialChunks } from "../server-utils";

/**
 * Handle connect endpoint
 * @param username Player username
 * @param level Level/world identifier
 * @param connectedClients Map of connected clients
 * @returns InitialConnectionResponse object
 */
export async function handleConnect(
  username: string,
  level: string,
  connectedClients: Map<string, ConnectedClient>
): Promise<InitialConnectionResponse> {
  // Initialize and get terrain seeds
  await initializeTerrainSeeds(level);
  const terrainSeeds = await getTerrainSeeds(level);

  // Retrieve last known position from level-scoped positions hash
  const positionsHashKey = `positions:${level}`;
  const savedPositionData = await redis.hGet(positionsHashKey, username);
  let lastKnownPosition: Position | null = null;

  if (savedPositionData) {
    try {
      const parsed = JSON.parse(savedPositionData);
      lastKnownPosition = { x: parsed.x, y: parsed.y, z: parsed.z };
    } catch (e) {
      console.error(`[Connect] Failed to parse position for ${username}:`, e);
    }
  }

  // Calculate spawn position for chunk loading
  const spawnPosition = await calculateSpawnPosition(
    level,
    connectedClients,
    lastKnownPosition
  );

  // Load player data for score and friends
  const playerData = await getOrCreatePlayerData(username, level);

  // Calculate initial chunks based on spawn position
  const drawDistance = 3;
  const chunksToLoad = calculateInitialChunks(spawnPosition, drawDistance);

  // Fetch chunks from Redis sequentially (Reddit Redis doesn't support pipelining)
  const initialChunks: InitialConnectionResponse["initialChunks"] = [];
  let totalBlocks = 0;

  for (const { chunkX, chunkZ } of chunksToLoad) {
    const chunkKey = `level:${level}:chunk:${chunkX}:${chunkZ}`;
    const chunkData = await redis.hGetAll(chunkKey);
    const blocks: Block[] = [];

    if (chunkData && Object.keys(chunkData).length > 0) {
      for (const [key, value] of Object.entries(chunkData)) {
        const [_, xStr, yStr, zStr] = key.split(":");
        const data = JSON.parse(value);
        blocks.push({
          x: parseInt(xStr!, 10),
          y: parseInt(yStr!, 10),
          z: parseInt(zStr!, 10),
          type: data.type,
          username: data.username,
          timestamp: data.timestamp,
          placed: data.placed !== undefined ? data.placed : true,
          removed: data.removed,
        });
      }
    }

    totalBlocks += blocks.length;
    initialChunks.push({ chunkX, chunkZ, blocks });
  }

  // Players will discover each other through regional broadcasts
  // No need to send initial player list

  // Add to active players set
  await addActivePlayer(username, level);

  // Update lastJoined timestamp
  const playerKey = `player:${username}:${level}`;
  await redis.hSet(playerKey, { lastJoined: Date.now().toString() });

  // Track this level in user's levels hash (for friendship broadcast discovery)
  const userLevelsKey = `user:${username}:levels`;
  await redis.hSet(userLevelsKey, { [level]: Date.now().toString() });

  // Load global friendship data
  const friends = await getPlayerFriends(username);
  const friendedBy = await getPlayerFriendedBy(username);

  // Add to connected clients
  const client: ConnectedClient = {
    username,
    level,
    lastPositionUpdate: Date.now(),
    position: spawnPosition,
    rotation: { x: 0, y: 0 },
  };
  connectedClients.set(username, client);

  // Calculate region for broadcasting
  const chunkX = Math.floor(spawnPosition.x / CHUNK_SIZE);
  const chunkZ = Math.floor(spawnPosition.z / CHUNK_SIZE);
  const regionX = Math.floor(chunkX / REGION_SIZE);
  const regionZ = Math.floor(chunkZ / REGION_SIZE);
  const timestamp = Date.now();

  // 1. Save initial position to level-scoped hash (for retrieval on reconnect)
  const positionData = JSON.stringify({
    x: spawnPosition.x,
    y: spawnPosition.y,
    z: spawnPosition.z,
    rx: 0,
    ry: 0,
    timestamp,
  });
  await redis.hSet(positionsHashKey, { [username]: positionData });

  // 2. Broadcast initial position to regional channel (so nearby players see this player)
  const regionalChannel = `region:${level}:${regionX}:${regionZ}`;
  await realtime.send(regionalChannel, {
    type: "player-position",
    username,
    position: spawnPosition,
    rotation: { x: 0, y: 0 },
    chunkX,
    chunkZ,
    timestamp,
  });

  // Increment player count and broadcast
  await incrementPlayerCount(level);

  const response: InitialConnectionResponse = {
    mode: "player",
    username,
    sessionId: username, // Use username as sessionId for compatibility
    level,
    terrainSeeds,
    spawnPosition,
    initialChunks,
    players: [], // Players will be discovered through regional broadcasts
    playerData: {
      score: playerData.score,
      friends,
      friendedBy,
    },
    playerCount: getPlayerCount(level),
  };

  return response;
}
