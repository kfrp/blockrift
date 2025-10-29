/**
 * Shared type definitions for server-side code
 * Used by both mock server and Reddit server implementations
 */

// ============================================================================
// Core Data Structures
// ============================================================================

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Rotation {
  x: number;
  y: number;
}

export interface Player {
  username: string;
  position: Position;
  rotation: Rotation;
}

export interface Block {
  x: number;
  y: number;
  z: number;
  type?: number;
  username: string;
  timestamp: number;
  placed: boolean;
  removed?: boolean;
}

export interface ChunkBlock {
  x: number;
  y: number;
  z: number;
  type: number;
  username: string;
  timestamp: number;
}

export interface PlayerData {
  score: number;
  lastActive: number;
  lastJoined: number;
  lastKnownPosition: Position | null;
  totalUpvotesGiven: number;
  totalUpvotesReceived: number;
}

export interface TerrainSeeds {
  seed: number;
  treeSeed: number;
  stoneSeed: number;
  coalSeed: number;
}

export interface ConnectedClient {
  username: string;
  level: string;
  lastPositionUpdate: number;
  position?: Position;
  rotation?: Rotation;
}

export interface ActiveLevel {
  level: string;
  position: Position;
}

// ============================================================================
// Request/Response Types
// ============================================================================

// Connection
export interface InitialConnectionRequest {
  level: string;
}

export interface InitialConnectionResponse {
  mode: "player" | "viewer";
  username: string;
  sessionId: string;
  level: string;
  terrainSeeds: TerrainSeeds;
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
  playerCount?: number;
}

// Disconnect
export interface DisconnectRequest {
  username: string;
  level: string;
}

export interface DisconnectResponse {
  ok: boolean;
}

// Position Update
export interface PositionUpdateRequest {
  username: string;
  position: Position;
  rotation: Rotation;
}

export interface PositionUpdateResponse {
  ok: boolean;
}

// Block Modifications
export interface Modification {
  position: Position;
  blockType: number | null;
  action: "place" | "remove";
  clientTimestamp: number;
}

export interface ModificationBatchRequest {
  username: string;
  level: string;
  modifications: Array<Modification>;
}

export interface ModificationBatchResponse {
  ok: boolean;
  failedAt: number | null;
  message?: string;
}

// Chunk State
export interface ChunkStateRequest {
  username: string;
  level: string;
  chunks: Array<{ chunkX: number; chunkZ: number }>;
}

export interface ChunkStateResponse {
  chunks: Array<{
    chunkX: number;
    chunkZ: number;
    blocks: Array<Block>;
  }>;
  requestTimestamp: number;
  responseTimestamp: number;
}

// Friends
export interface AddFriendRequest {
  username: string;
  level: string;
  friendUsername: string;
}

export interface AddFriendResponse {
  ok: boolean;
  friends?: string[];
  message?: string;
}

export interface RemoveFriendRequest {
  username: string;
  level: string;
  friendUsername: string;
}

export interface RemoveFriendResponse {
  ok: boolean;
  friends?: string[];
  message?: string;
}

// Upvote
export interface UpvoteRequest {
  username: string;
  level: string;
  builderUsername: string;
}

export interface UpvoteResponse {
  ok: boolean;
  message?: string;
}

// Chat
export interface ChatRequest {
  username: string;
  level: string;
  message: string;
}

export interface ChatResponse {
  ok: boolean;
  message?: string;
}

// ============================================================================
// Broadcast Message Types
// ============================================================================

export interface BlockModificationBroadcast {
  type: "block-modify";
  username: string;
  position: Position;
  blockType: number | null;
  action: "place" | "remove";
  clientTimestamp: number;
  serverTimestamp: number;
}

export interface PositionUpdatesBroadcast {
  type: "player-positions";
  players: Array<Player>;
}

export interface FriendshipAddedMessage {
  type: "friendship-added";
  targetUsername: string;
  byUsername: string;
  message: string;
}

export interface FriendshipRemovedMessage {
  type: "friendship-removed";
  targetUsername: string;
  byUsername: string;
  message: string;
}

export interface PlayerCountUpdateMessage {
  type: "player-count-update";
  level: string;
  count: number;
}

export interface ChatBroadcast {
  type: "chat-message";
  username: string;
  message: string;
  timestamp: number;
}

// ============================================================================
// Redis Client and Realtime Interfaces
// ============================================================================

/**
 * Redis client interface
 * Compatible with both node-redis and Devvit's redis instance
 */
export interface RedisClientType {
  // String operations
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string | null>;
  exists(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  del(key: string): Promise<number>;

  // Hash operations
  hGet(key: string, field: string): Promise<string | null>;
  hSet(
    key: string,
    field: string | Record<string, string>,
    value?: string
  ): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hIncrBy(key: string, field: string, increment: number): Promise<number>;
  hDel(key: string, field: string): Promise<number>;

  // Set operations
  sAdd(key: string, member: string): Promise<number>;
  sRem(key: string, member: string): Promise<number>;
  sIsMember(key: string, member: string): Promise<boolean>;

  // Sorted set operations
  zAdd(key: string, member: { score: number; value: string }): Promise<number>;
  zIncrBy(key: string, increment: number, member: string): Promise<number>;

  // Pipeline operations
  multi(): RedisPipeline;
}

/**
 * Redis pipeline interface for batch operations
 */
export interface RedisPipeline {
  hGetAll(key: string): RedisPipeline;
  hSet(key: string, field: string, value: string): RedisPipeline;
  exec(): Promise<any[]>;
}

/**
 * Realtime interface for broadcasting messages
 * Compatible with both WebSocket (mock) and Devvit's realtime API
 */
export interface RealtimeInterface {
  send(channel: string, data: any): Promise<void>;
}

export interface BlockModificationMessage {
  type: "block-modify";
  username: string;
  position: { x: number; y: number; z: number };
  blockType: number | null;
  action: "place" | "remove";
  clientTimestamp: number;
  serverTimestamp?: number;
}
