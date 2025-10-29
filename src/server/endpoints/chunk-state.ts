/**
 * Chunk State Endpoint Handler
 * Handles requests for chunk data from clients
 */

import { redis } from "../globals";
import type { ChunkStateResponse, Block } from "../types";

/**
 * Handle chunk state request
 * Fetches block data for requested chunks using Redis pipelining
 *
 * @param username Player requesting chunk data
 * @param level Level identifier
 * @param chunks Array of chunk coordinates to fetch
 * @returns ChunkStateResponse with chunk data and timestamps
 */
export async function handleChunkState(
  username: string,
  level: string,
  chunks: Array<{ chunkX: number; chunkZ: number }>
): Promise<ChunkStateResponse> {
  const requestTimestamp = Date.now();

  // Log request with chunk count
  console.log(
    `Chunk state request from ${username} for ${chunks.length} chunks in level ${level}`
  );

  // Validate chunk coordinates are within bounds
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

  // Fetch chunks sequentially (Reddit Redis doesn't support pipelining)
  const chunkStates: Array<{
    chunkX: number;
    chunkZ: number;
    blocks: Array<Block>;
  }> = [];

  for (const { chunkX, chunkZ } of validChunks) {
    const chunkKey = getChunkKey(level, chunkX, chunkZ);
    const chunkData = await redis.hGetAll(chunkKey);
    const blocks: Array<Block> = [];

    if (chunkData && Object.keys(chunkData).length > 0) {
      console.log(`=== LOADING CHUNK (${chunkX}, ${chunkZ}) FROM REDIS ===`);
      console.log(`  Total keys in chunk: ${Object.keys(chunkData).length}`);

      for (const [key, value] of Object.entries(chunkData)) {
        // Parse block key: "block:x:y:z"
        const [_, xStr, yStr, zStr] = key.split(":");
        const x = parseInt(xStr!, 10);
        const y = parseInt(yStr!, 10);
        const z = parseInt(zStr!, 10);

        // Parse block data
        const data = JSON.parse(value);

        console.log(`REDIS HGET chunk(${chunkX},${chunkZ}) ${key} = ${value}`);

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

    chunkStates.push({ chunkX, chunkZ, blocks });
  }

  const responseTimestamp = Date.now();

  // Create response with chunks array and timestamps
  const response: ChunkStateResponse = {
    chunks: chunkStates,
    requestTimestamp,
    responseTimestamp,
  };

  // Log response time and chunk count
  const responseTime = responseTimestamp - requestTimestamp;
  console.log(
    `Sent chunk state response: ${chunkStates.length} chunks, ${responseTime}ms`
  );

  return response;
}

/**
 * Generate Redis key for a chunk in a specific level
 */
function getChunkKey(level: string, chunkX: number, chunkZ: number): string {
  return `level:${level || "default"}:chunk:${chunkX}:${chunkZ}`;
}
