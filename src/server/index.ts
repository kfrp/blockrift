import express from "express";
import { createClient } from "redis";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

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

// Task 1.3: Session tracking for connected clients
interface ConnectedClient {
  ws: WebSocket;
  username: string;
  sessionId: string;
  level: string; // Level/world identifier
  lastPositionUpdate: number;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
}

const connectedClients = new Map<string, ConnectedClient>();

// Task 1.2: Random username generation for development
function generateUsername(): string {
  const randomNum = Math.floor(Math.random() * 10000);
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

// Generate unique session ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
  return `level:${level}:chunk:${chunkX}:${chunkZ}`;
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
): Promise<
  Array<{
    x: number;
    y: number;
    z: number;
    type: number;
    username: string;
    timestamp: number;
  }>
> {
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

// Task 6: Block modification message interface
interface BlockModificationMessage {
  type: "block-modify";
  username: string;
  position: { x: number; y: number; z: number };
  blockType: number | null; // null for removal, number for placement
  action: "place" | "remove";
  clientTimestamp: number;
}

// Task 6: Block modification broadcast interface
interface BlockModificationBroadcast extends BlockModificationMessage {
  serverTimestamp: number;
}

// Task 12: Position update message interface
interface PositionUpdateMessage {
  type: "player-position";
  username: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

// Task 12: Batched position updates broadcast interface
interface PositionUpdatesBroadcast {
  type: "player-positions";
  players: Array<{
    username: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
  }>;
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
 * Task 6: Handle block modification from client
 * - Adds server timestamp (Requirement 3.5)
 * - Immediately broadcasts via Redis pub/sub (Requirement 3.3)
 * - Asynchronously persists to Redis (Requirement 3.4)
 */
async function handleBlockModification(
  data: BlockModificationMessage,
  client: ConnectedClient
): Promise<void> {
  const { position, blockType, action, clientTimestamp, username } = data;
  const level = client.level; // Get level from client

  console.log(
    `Received ${action} from ${username} at (${position.x}, ${position.y}, ${position.z}) in level "${level}"`
  );

  // Add server timestamp for conflict resolution (Requirement 3.5)
  const serverTimestamp = Date.now();

  const broadcastData: BlockModificationBroadcast = {
    type: "block-modify",
    username,
    position,
    blockType,
    action,
    clientTimestamp,
    serverTimestamp,
  };

  // Immediately broadcast modification via Redis pub/sub (Requirement 3.3)
  // Find which channel this client is subscribed to
  let clientChannel: string | null = null;
  for (const [channel, subscribers] of Array.from(
    channelSubscribers.entries()
  )) {
    if (subscribers.has(client.ws)) {
      clientChannel = channel;
      break;
    }
  }

  if (clientChannel) {
    await realtime.send(clientChannel, broadcastData);
    console.log(
      `Broadcast ${action} to channel ${clientChannel} with server timestamp ${serverTimestamp}`
    );
  } else {
    console.warn(
      `Client ${username} not subscribed to any channel, cannot broadcast`
    );
  }

  // Asynchronously persist to Redis (Requirement 3.4)
  // Using setImmediate to not block the broadcast
  setImmediate(async () => {
    await persistBlockModification(level, data);
  });
}

/**
 * Task 12: Handle position update from client
 * - Stores latest position for each connected client (Requirement 4.2)
 */
function handlePositionUpdate(
  data: PositionUpdateMessage,
  client: ConnectedClient
): void {
  const { position, rotation } = data;

  // Store latest position and rotation for this client
  client.position = position;
  client.rotation = rotation;
  client.lastPositionUpdate = Date.now();
}

/**
 * Task 12: Broadcast position updates for all connected clients
 * - Called 10 times per second (Requirement 4.2, 11.2)
 * - Batches all player positions into single message (Requirement 11.2)
 * - Broadcasts via Redis pub/sub (Requirement 11.5)
 */
// Track last broadcast state to avoid sending duplicate data
const lastBroadcastState = new Map<
  string,
  Map<string, { position: string; rotation: string }>
>();

async function broadcastPositionUpdates(): Promise<void> {
  // Group clients by channel
  const channelPlayers = new Map<
    string,
    Array<{
      username: string;
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
    }>
  >();

  // Collect all clients with their channels
  for (const [channel, subscribers] of Array.from(
    channelSubscribers.entries()
  )) {
    const players: Array<{
      username: string;
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number };
    }> = [];

    for (const client of Array.from(connectedClients.values())) {
      if (subscribers.has(client.ws) && client.position && client.rotation) {
        players.push({
          username: client.username,
          position: client.position,
          rotation: client.rotation,
        });
      }
    }

    if (players.length > 0) {
      channelPlayers.set(channel, players);
    }
  }

  // Broadcast batched position updates to each channel (only if changed)
  for (const [channel, players] of Array.from(channelPlayers.entries())) {
    // Check if this channel's data has changed since last broadcast
    const lastState = lastBroadcastState.get(channel) || new Map();
    let hasChanges = false;

    const currentState = new Map<
      string,
      { position: string; rotation: string }
    >();

    for (const player of players) {
      const posKey = `${player.position.x},${player.position.y},${player.position.z}`;
      const rotKey = `${player.rotation.x},${player.rotation.y},${player.rotation.z}`;
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
    console.log(`Published to ${channel}:`, data);
  },
};

// Handle WebSocket connections
wss.on("connection", (ws: WebSocket) => {
  // Task 1.2 & 1.3: Assign username and create session
  const username = assignUsername();
  const sessionId = generateSessionId();

  const client: ConnectedClient = {
    ws,
    username,
    sessionId,
    level: "default", // Will be updated when client subscribes
    lastPositionUpdate: Date.now(),
  };

  connectedClients.set(sessionId, client);

  console.log(`Client connected: ${username} (${sessionId})`);
  console.log(`Environment: ${isDevelopment ? "development" : "production"}`);

  ws.on("message", async (message: string) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.type === "subscribe") {
        const channel = msg.channel;
        const level = msg.level || "default"; // Get level from message or use default

        // Store level in client data
        client.level = level;

        console.log(
          `Client ${username} subscribing to ${channel} (level: ${level})`
        );

        // Add client to channel subscribers
        if (!channelSubscribers.has(channel)) {
          channelSubscribers.set(channel, new Set());

          // Subscribe to Redis channel
          await subscriber.subscribe(channel, (redisMessage) => {
            const data = JSON.parse(redisMessage);
            const subscribers = channelSubscribers.get(channel);

            if (subscribers) {
              subscribers.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(
                    JSON.stringify({
                      type: "message",
                      channel,
                      data,
                    })
                  );
                }
              });
            }
          });
        }

        channelSubscribers.get(channel)?.add(ws);

        // Task 2: Initialize and send terrain seeds for this level
        await initializeTerrainSeeds(level);
        const terrainSeeds = await getTerrainSeeds(level);

        // Get all existing players in this channel (excluding the new joiner)
        const existingPlayers = Array.from(connectedClients.values())
          .filter(
            (c) =>
              c.sessionId !== sessionId &&
              channelSubscribers.get(channel)?.has(c.ws)
          )
          .map((c) => ({
            username: c.username,
            position: c.position || { x: 0, y: 20, z: 0 },
            rotation: c.rotation || { x: 0, y: 0, z: 0 },
          }));

        ws.send(
          JSON.stringify({
            type: "connected",
            channel,
            username,
            sessionId,
            level,
            terrainSeeds,
            players: existingPlayers, // Send existing players to new joiner
          })
        );

        // Task 2: Broadcast player-joined event to existing clients
        await realtime.send(channel, {
          type: "player-joined",
          username,
          level,
          position: client.position || { x: 0, y: 20, z: 0 }, // Default spawn position
        });

        console.log(
          `Sent ConnectedMessage to ${username} with terrain seeds for level "${level}" and ${existingPlayers.length} existing player(s)`
        );
      }

      if (msg.type === "unsubscribe") {
        const channel = msg.channel;
        console.log(`Client ${username} unsubscribing from ${channel}`);

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

      // Task 2: Handle world state request
      if (msg.type === "world-state-request") {
        const { chunkX, chunkZ } = msg;
        const level = client.level;
        console.log(
          `Client ${username} requesting world state for chunk (${chunkX}, ${chunkZ}) in level "${level}"`
        );

        // Get blocks for the requested chunk
        const blocks = await getChunkBlocks(level, chunkX, chunkZ);

        // Get all active players
        const players = Array.from(connectedClients.values())
          .filter((c) => c.sessionId !== sessionId) // Exclude requesting client
          .map((c) => ({
            username: c.username,
            position: c.position || { x: 0, y: 20, z: 0 },
            rotation: { x: 0, y: 0, z: 0 }, // Default rotation
          }));

        // Send WorldStateResponse
        ws.send(
          JSON.stringify({
            type: "world-state",
            chunkX,
            chunkZ,
            blocks,
            players,
          })
        );

        console.log(
          `Sent world state to ${username}: ${blocks.length} blocks, ${players.length} players`
        );
      }

      // Task 6: Handle block modification
      if (msg.type === "block-modify") {
        await handleBlockModification(msg, client);
      }

      // Task 12: Handle position update
      if (msg.type === "player-position") {
        handlePositionUpdate(msg, client);
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  ws.on("close", async () => {
    console.log(`Client disconnected: ${username} (${sessionId})`);

    // Remove client from session tracking
    connectedClients.delete(sessionId);

    // Task 2: Broadcast player-left event to remaining clients
    channelSubscribers.forEach(async (subscribers, channel) => {
      if (subscribers.has(ws)) {
        await realtime.send(channel, {
          type: "player-left",
          username,
        });
        console.log(
          `Broadcast player-left event for ${username} to ${channel}`
        );
      }

      subscribers.delete(ws);
      if (subscribers.size === 0) {
        channelSubscribers.delete(channel);
        subscriber.unsubscribe(channel).catch(console.error);
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

    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`WebSocket server ready`);
      console.log(`Position updates broadcasting at 10 Hz`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
