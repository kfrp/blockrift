// Server utility functions extracted for testing
// These functions are used by the main server and can be tested independently

const CHUNK_SIZE = 24; // Matches client-side chunk system

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

export { CHUNK_SIZE };
