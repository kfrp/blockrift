/**
 * Position update endpoint handler
 * Handles player position and rotation updates
 * Now uses Redis hash storage and realtime broadcasting
 */

import type {
  Position,
  Rotation,
  ConnectedClient,
  PositionUpdateResponse,
} from "../types";
import { CHUNK_SIZE, REGION_SIZE } from "../types";
import { redis, realtime } from "../globals";

/**
 * Calculate region coordinates from position
 */
function getRegionFromPosition(position: Position): {
  regionX: number;
  regionZ: number;
} {
  const chunkX = Math.floor(position.x / CHUNK_SIZE);
  const chunkZ = Math.floor(position.z / CHUNK_SIZE);
  const regionX = Math.floor(chunkX / REGION_SIZE);
  const regionZ = Math.floor(chunkZ / REGION_SIZE);
  return { regionX, regionZ };
}

/**
 * Handle position update endpoint
 * @param username Player username
 * @param level Player level
 * @param position Player position
 * @param rotation Player rotation
 * @param connectedClients Map of connected clients
 * @returns PositionUpdateResponse object
 */
export async function handlePositionUpdate(
  username: string,
  level: string,
  position: Position,
  rotation: Rotation,
  connectedClients: Map<string, ConnectedClient>
): Promise<PositionUpdateResponse> {
  // Update in-memory client if it exists (for disconnect tracking only)
  const client = connectedClients.get(username);
  if (client) {
    client.position = position;
    client.rotation = rotation;
    client.lastPositionUpdate = Date.now();
  }

  // Calculate chunk and region
  const chunkX = Math.floor(position.x / CHUNK_SIZE);
  const chunkZ = Math.floor(position.z / CHUNK_SIZE);
  const { regionX, regionZ } = getRegionFromPosition(position);

  const timestamp = Date.now();

  // 1. Store position in level-scoped hash (for retrieval on reconnect)
  const levelPositionKey = `positions:${level}`;
  const positionData = JSON.stringify({
    x: position.x,
    y: position.y,
    z: position.z,
    rx: rotation.x,
    ry: rotation.y,
    timestamp,
  });

  await redis.hSet(levelPositionKey, { [username]: positionData });

  // 2. Broadcast to regional channel (for real-time updates to nearby players)
  const channel = `region:${level}:${regionX}:${regionZ}`;
  await realtime.send(channel, {
    type: "player-position",
    username,
    position: {
      x: Math.round(position.x * 100) / 100,
      y: Math.round(position.y * 100) / 100,
      z: Math.round(position.z * 100) / 100,
    },
    rotation: {
      x: Math.round(rotation.x * 100) / 100,
      y: Math.round(rotation.y * 100) / 100,
    },
    chunkX,
    chunkZ,
    timestamp,
  });

  return { ok: true };
}
