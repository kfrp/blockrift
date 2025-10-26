// Server utility functions extracted for testing
// These functions are used by the main server and can be tested independently

const CHUNK_SIZE = 24; // Matches client-side chunk system
const REGION_SIZE = 5; // 5x5 chunks per region

/**
 * Generate random username for development
 */
export function generateUsername(): string {
  const randomNum = Math.floor(Math.random() * 10000);
  return `Player${randomNum}`;
}

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
 * Generate Redis key for a chunk
 */
export function getChunkKey(chunkX: number, chunkZ: number): string {
  return `chunk:${chunkX}:${chunkZ}`;
}

/**
 * Generate Redis key for a block within a chunk
 */
export function getBlockKey(x: number, y: number, z: number): string {
  return `block:${x}:${y}:${z}`;
}

/**
 * Generate unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Calculate region coordinates from chunk coordinates
 * @param chunkX Chunk x coordinate
 * @param chunkZ Chunk z coordinate
 * @returns Region coordinates {regionX, regionZ}
 */
export function getRegionCoordinates(
  chunkX: number,
  chunkZ: number
): { regionX: number; regionZ: number } {
  const regionX = Math.floor(chunkX / REGION_SIZE);
  const regionZ = Math.floor(chunkZ / REGION_SIZE);
  return { regionX, regionZ };
}

/**
 * Generate regional channel name for pub/sub
 * @param level Level/world identifier
 * @param chunkX Chunk x coordinate
 * @param chunkZ Chunk z coordinate
 * @returns Regional channel string
 */
export function getRegionalChannel(
  level: string,
  chunkX: number,
  chunkZ: number
): string {
  const { regionX, regionZ } = getRegionCoordinates(chunkX, chunkZ);
  return `region:${level}:${regionX}:${regionZ}`;
}

/**
 * Calculate initial chunks to load around spawn position
 * @param spawnPosition Spawn position coordinates
 * @param drawDistance Draw distance in chunks
 * @returns Array of chunk coordinates to load
 */
export function calculateInitialChunks(
  spawnPosition: { x: number; y: number; z: number },
  drawDistance: number
): Array<{ chunkX: number; chunkZ: number }> {
  // Calculate state buffer as 2x draw distance
  const stateBuffer = drawDistance * 2;

  // Calculate spawn chunk coordinates
  const spawnChunkX = Math.floor(spawnPosition.x / CHUNK_SIZE);
  const spawnChunkZ = Math.floor(spawnPosition.z / CHUNK_SIZE);

  const chunks: Array<{ chunkX: number; chunkZ: number }> = [];

  // Loop from spawnChunk - buffer to spawnChunk + buffer
  for (let x = spawnChunkX - stateBuffer; x <= spawnChunkX + stateBuffer; x++) {
    for (
      let z = spawnChunkZ - stateBuffer;
      z <= spawnChunkZ + stateBuffer;
      z++
    ) {
      chunks.push({ chunkX: x, chunkZ: z });
    }
  }

  return chunks;
}

export { CHUNK_SIZE, REGION_SIZE };
