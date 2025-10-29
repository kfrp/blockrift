/**
 * Connect endpoint handler
 * Handles initial connection and game state retrieval
 */

import { redis } from "../globals";
import type {
  InitialConnectionResponse,
  ConnectedClient,
  Block,
} from "../types";
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
  console.log(`HTTP connect request from ${username} for level "${level}"`);

  // Check if player is already connected to this level
  // Use connectedClients (in-memory) as source of truth, not Redis
  const existingClient = connectedClients.get(username);
  const isActive =
    existingClient !== undefined && existingClient.level === level;

  if (isActive) {
    console.log(
      `${username} is already connected to level ${level} - entering Viewer Mode`
    );
  } else if (existingClient) {
    console.log(
      `${username} is connected to a different level (${existingClient.level}) - allowing Player Mode for ${level}`
    );
  } else {
    console.log(
      `${username} is not currently connected - entering Player Mode`
    );
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
  const spawnPosition = isActive
    ? { x: 0, y: 20, z: 0 } // Viewers use default spawn for chunks
    : calculateSpawnPosition(
        level,
        connectedClients,
        playerData?.lastKnownPosition
      );

  // Calculate initial chunks based on spawn position
  const drawDistance = 3;
  const chunksToLoad = calculateInitialChunks(spawnPosition, drawDistance);

  console.log(
    `Calculating initial chunks for ${username}: ${chunksToLoad.length} chunks around (${spawnPosition.x}, ${spawnPosition.y}, ${spawnPosition.z})`
  );

  // Fetch chunks from Redis using pipeline
  const pipeline = redis.multi();
  for (const { chunkX, chunkZ } of chunksToLoad) {
    const chunkKey = `level:${level}:chunk:${chunkX}:${chunkZ}`;
    pipeline.hGetAll(chunkKey);
  }

  const chunkResults = await pipeline.exec();

  // Parse chunk data
  const initialChunks: InitialConnectionResponse["initialChunks"] = [];
  let totalBlocks = 0;

  for (let i = 0; i < chunksToLoad.length; i++) {
    const chunk = chunksToLoad[i];
    if (!chunk) continue;
    const { chunkX, chunkZ } = chunk;
    const result = chunkResults?.[i];
    const blocks: Block[] = [];

    if (result && typeof result === "object" && !Array.isArray(result)) {
      const chunkData = result as Record<string, string>;
      if (Object.keys(chunkData).length > 0) {
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
    .filter((c) => c.level === level) // Only include players in the same level
    .map((c) => ({
      username: c.username,
      position: c.position || { x: 0, y: 20, z: 0 },
      rotation: c.rotation || { x: 0, y: 0 },
    }));

  if (isActive) {
    // Player already active - enter Viewer Mode
    console.log(`${username} already active, entering Viewer Mode`);

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

  // Player not active - enter Player Mode
  console.log(`${username} entering Player Mode`);

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
  await redis.hSet(playerKey, "lastJoined", Date.now().toString());

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
