/**
 * Connect endpoint handler
 * Handles initial connection and game state retrieval
 */

import { redis } from "../globals";
import type {
  InitialConnectionResponse,
  ConnectedClient,
  Block,
  Position,
  Player,
} from "../types";
import { CHUNK_SIZE, REGION_SIZE, POSITION_STALE_THRESHOLD } from "../types";
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
 * Get players near a position from Redis
 */
async function getPlayersNearPosition(
  level: string,
  position: Position
): Promise<Player[]> {
  const chunkX = Math.floor(position.x / CHUNK_SIZE);
  const chunkZ = Math.floor(position.z / CHUNK_SIZE);
  const regionX = Math.floor(chunkX / REGION_SIZE);
  const regionZ = Math.floor(chunkZ / REGION_SIZE);

  // Fetch from current region and adjacent regions (3x3 grid)
  const regions = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      regions.push({
        regionX: regionX + dx,
        regionZ: regionZ + dz,
      });
    }
  }

  const playerMap = new Map<string, Player>(); // Deduplicate by username
  const now = Date.now();

  for (const region of regions) {
    const hashKey = `players:${level}:${region.regionX}:${region.regionZ}`;
    const playerData = await redis.hGetAll(hashKey);

    if (playerData && Object.keys(playerData).length > 0) {
      for (const [username, dataStr] of Object.entries(playerData)) {
        // Skip if already added (deduplication)
        if (playerMap.has(username)) continue;

        try {
          const data = JSON.parse(dataStr);

          // Filter by timestamp (only recent positions)
          if (now - data.timestamp < POSITION_STALE_THRESHOLD) {
            playerMap.set(username, {
              username,
              position: { x: data.x, y: data.y, z: data.z },
              rotation: { x: data.rx, y: data.ry },
            });
          }
        } catch (e) {
          console.error(`Failed to parse player data for ${username}:`, e);
        }
      }
    }
  }

  return Array.from(playerMap.values());
}

const defaultSpawn = () => ({ x: 0, y: 20, z: 0 });
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
  // Check if player is already connected to this level
  // Use connectedClients (in-memory) as source of truth, not Redis
  const existingClient = connectedClients.get(username);
  const isActive =
    existingClient !== undefined && existingClient.level === level;

  if (isActive) {
  } else if (existingClient) {
  } else {
  }

  // Initialize and get terrain seeds
  await initializeTerrainSeeds(level);
  const terrainSeeds = await getTerrainSeeds(level);

  // For initial chunk calculation, we need to determine spawn position early
  // Load player data to check for lastKnownPosition
  let playerData = null;

  if (!isActive) {
    playerData = await getOrCreatePlayerData(username, level);
  }

  // Calculate spawn position for chunk loading
  const spawnPosition = await calculateSpawnPosition(
    level,
    connectedClients,
    playerData?.lastKnownPosition
  );

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

  // Get existing players from Redis (filtered by region and timestamp)
  const players: InitialConnectionResponse["players"] =
    await getPlayersNearPosition(level, spawnPosition);
  console.log(
    `[Connect] Found ${players.length} players near spawn for ${username}:`,
    players.map((p) => p.username)
  );
  /** 
  if (isActive) {
    // Player already active - enter Viewer Mode
    

    // Do NOT add to connectedClients map (viewers are invisible)
    const response: InitialConnectionResponse = {
      mode: "viewer",
      username,
      sessionId: `${username}_viewer_${Date.now()}`,
      level,
      terrainSeeds,
      spawnPosition,
      initialChunks,
      players,
      playerCount: getPlayerCount(level),
      message:
        "You are already playing from another device. Entering Viewer Mode.",
    };

    return response;
  }
**/
  // Player not active - enter Player Mode

  // Add to active players set
  await addActivePlayer(username, level);

  // Ensure playerData is loaded (should already be loaded above)
  if (!playerData) {
    console.error(`CRITICAL: playerData is null for ${username} in ${level}`);
    console.error(`isActive was: ${isActive}`);
    // Fallback: load player data now
    playerData = await getOrCreatePlayerData(username, level);
  }

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

  // Write initial position to Redis so other players can see this player
  const chunkX = Math.floor(spawnPosition.x / CHUNK_SIZE);
  const chunkZ = Math.floor(spawnPosition.z / CHUNK_SIZE);
  const regionX = Math.floor(chunkX / REGION_SIZE);
  const regionZ = Math.floor(chunkZ / REGION_SIZE);
  const timestamp = Date.now();

  const hashKey = `players:${level}:${regionX}:${regionZ}`;
  const positionData = JSON.stringify({
    x: spawnPosition.x,
    y: spawnPosition.y,
    z: spawnPosition.z,
    rx: 0,
    ry: 0,
    chunkX,
    chunkZ,
    timestamp,
  });
  console.log(
    `[Connect] Writing initial position for ${username} to ${hashKey}:`,
    spawnPosition
  );
  await redis.hSet(hashKey, { [username]: positionData });

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
    players,
    playerData: {
      score: playerData.score,
      friends,
      friendedBy,
    },
    playerCount: getPlayerCount(level),
  };

  return response;
}
