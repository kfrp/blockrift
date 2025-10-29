/**
 * Mock Server Implementation
 * For local development and testing
 */

import express from "express";
import { createClient } from "redis";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

// Import global setters
import { setRedis, setRealtime } from "../globals";

// Import endpoint handlers
import { handleConnect } from "../endpoints/connect";
import { handlePositionUpdate } from "../endpoints/position";
import { handleChunkState } from "../endpoints/chunk-state";
import { handleAddFriend, handleRemoveFriend } from "../endpoints/friends";
import { handleUpvote } from "../endpoints/upvote";

// Import endpoint path constants
import {
  CONNECT_API,
  DISCONNECT_API,
  POSITION_API,
  MODIFICATIONS_API,
  CHUNK_STATE_API,
  FRIENDS_ADD_API,
  FRIENDS_REMOVE_API,
  UPVOTE_API,
  CHAT_API,
} from "../../shared/endpoints";

// Import types from shared types file
import type {
  ConnectedClient,
  Position,
  ModificationBatchRequest,
  ModificationBatchResponse,
  DisconnectRequest,
  ChatRequest,
  RealtimeInterface,
} from "../types";

// Import Devvit RedisClient type for casting
import type { RedisClient } from "@devvit/web/server";

// Import Redis wrapper
import { wrapNodeRedis } from "./redis-wrapper";

// Import helpers
import {
  removeActivePlayer,
  decrementPlayerCount,
  getRegionalChannelFromPosition,
} from "../endpoints/helpers";

// ============================================================================
// SERVER SETUP
// ============================================================================

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

// Environment detection (development vs production)
const isDevelopment = process.env.NODE_ENV !== "production";

// Track clients by username (not WebSocket connection)
const connectedClients = new Map<string, ConnectedClient>();

// Track last broadcast state to detect changes
const lastBroadcastState = new Map<string, string>(); // channel -> JSON string of player data

// ============================================================================
// USERNAME GENERATION
// ============================================================================

/**
 * Random username generation for development
 */
function generateUsername(): string {
  const randomNum = Math.floor(Math.random() * 10000);
  console.log("generated: " + randomNum);
  return `Player${randomNum}`;
}

/**
 * Assign username based on environment
 */
function assignUsername(): string {
  if (isDevelopment) {
    return generateUsername();
  }
  // In production, username would come from Reddit context
  return "ProductionUser";
}

// ============================================================================
// MOCK REALTIME INTERFACE
// ============================================================================

/**
 * Mock realtime interface that wraps WebSocket broadcasting
 */
const realtime: RealtimeInterface = {
  async send(channel: string, data: any): Promise<void> {
    const subscribers = channelSubscribers.get(channel);
    if (!subscribers || subscribers.size === 0) {
      console.log(`No subscribers for channel ${channel}`);
      return;
    }

    // Add channel to message so client can route it correctly
    const messageWithChannel = { ...data, channel };
    const message = JSON.stringify(messageWithChannel);
    console.log(
      `[DEBUG] realtime.send: Broadcasting to ${channel}: ${subscribers.size} subscribers, message type: ${data.type}`
    );

    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  },
};

// ============================================================================
// WEBSOCKET SETUP
// ============================================================================

wss.on("connection", (ws: WebSocket) => {
  console.log("WebSocket client connected");

  ws.on("message", (message: string) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === "subscribe") {
        const channel = data.channel;
        if (!channelSubscribers.has(channel)) {
          channelSubscribers.set(channel, new Set());
        }
        channelSubscribers.get(channel)!.add(ws);
        console.log(
          `[DEBUG] Client subscribed to channel: ${channel}, total subscribers: ${
            channelSubscribers.get(channel)!.size
          }`
        );
      } else if (data.type === "unsubscribe") {
        const channel = data.channel;
        const subscribers = channelSubscribers.get(channel);
        if (subscribers) {
          subscribers.delete(ws);
          if (subscribers.size === 0) {
            channelSubscribers.delete(channel);
          }
        }
        console.log(`Client unsubscribed from channel: ${channel}`);
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  });

  ws.on("close", () => {
    // Remove this WebSocket from all channels
    for (const [channel, subscribers] of channelSubscribers.entries()) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        channelSubscribers.delete(channel);
      }
    }
    console.log("WebSocket client disconnected");
  });
});

// ============================================================================
// POSITION BROADCASTING
// ============================================================================

/**
 * Broadcast position updates for all players
 * Called periodically (1 second intervals)
 * Only broadcasts if data has changed since last broadcast
 */
async function broadcastPositionUpdates(): Promise<void> {
  // Skip if no connected clients
  if (connectedClients.size === 0) {
    return;
  }

  // Group players by level
  const playersByLevel = new Map<string, ConnectedClient[]>();

  for (const client of connectedClients.values()) {
    if (!playersByLevel.has(client.level)) {
      playersByLevel.set(client.level, []);
    }
    playersByLevel.get(client.level)!.push(client);
  }

  // Broadcast to each level's regional channels
  for (const [level, players] of playersByLevel.entries()) {
    // Group players by region
    const playersByRegion = new Map<string, ConnectedClient[]>();

    for (const player of players) {
      if (!player.position) continue;

      const channel = getRegionalChannelFromPosition(level, player.position);
      if (!playersByRegion.has(channel)) {
        playersByRegion.set(channel, []);
      }
      playersByRegion.get(channel)!.push(player);
    }

    // Broadcast to each region
    for (const [channel, regionPlayers] of playersByRegion.entries()) {
      const playerData = regionPlayers.map((p) => ({
        username: p.username,
        position: p.position || { x: 0, y: 20, z: 0 },
        rotation: p.rotation || { x: 0, y: 0 },
      }));

      // Serialize to JSON for comparison
      const currentState = JSON.stringify(playerData);
      const lastState = lastBroadcastState.get(channel);

      // Only broadcast if data changed
      if (currentState !== lastState) {
        await realtime.send(channel, {
          type: "player-positions",
          players: playerData,
        });

        // Update last broadcast state
        lastBroadcastState.set(channel, currentState);
      }
    }
  }
}

// Start position broadcasting interval
setInterval(broadcastPositionUpdates, 1000);

// ============================================================================
// MODIFICATION VALIDATION
// ============================================================================

/**
 * Validate a single modification
 */
async function validateModification(
  _level: string,
  mod: {
    position: Position;
    blockType: number | null;
    action: "place" | "remove";
  }
): Promise<{ valid: boolean; existingType?: number }> {
  const { x, y, z } = mod.position;

  // Validate Y coordinate (height)
  if (y < 0 || y > 255) {
    return { valid: false };
  }

  // Validate X and Z coordinates (reasonable world bounds)
  if (Math.abs(x) > 1000000 || Math.abs(z) > 1000000) {
    return { valid: false };
  }

  return { valid: true };
}

/**
 * Persist a batch of modifications to Redis
 */
async function persistModificationBatch(
  level: string,
  modifications: Array<{
    position: Position;
    blockType: number | null;
    action: "place" | "remove";
    username: string;
    serverTimestamp: number;
  }>
): Promise<void> {
  for (const mod of modifications) {
    const { x, y, z } = mod.position;
    const chunkX = Math.floor(x / 24);
    const chunkZ = Math.floor(z / 24);
    const chunkKey = `level:${level}:chunk:${chunkX}:${chunkZ}`;
    const blockKey = `block:${x}:${y}:${z}`;

    if (mod.action === "place" && mod.blockType !== null) {
      // Store block placement
      const blockData = JSON.stringify({
        type: mod.blockType,
        username: mod.username,
        timestamp: mod.serverTimestamp,
        placed: true,
      });
      await redisStore.hSet(chunkKey, { [blockKey]: blockData });
    } else if (mod.action === "remove") {
      // Store block removal
      const blockData = JSON.stringify({
        type: 0,
        username: mod.username,
        timestamp: mod.serverTimestamp,
        placed: false,
        removed: true,
      });
      await redisStore.hSet(chunkKey, { [blockKey]: blockData });
    }
  }

  console.log(`Persisted ${modifications.length} modifications to Redis`);
}

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }

  next();
});

app.use(express.json());

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Health check endpoint
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/**
 * Connect endpoint
 */
app.post(CONNECT_API, async (req, res) => {
  const { level } = req.body;
  const actualLevel = level || "default";

  // Generate username for development
  const username =
    req.query.username && req.query.username !== "undefined"
      ? String(req.query.username)
      : assignUsername();
  console.log({ username });
  try {
    const response = await handleConnect(
      username,
      actualLevel,
      connectedClients
    );
    res.json(response);
  } catch (error) {
    console.error("Connect error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Disconnect endpoint
 */
app.post(DISCONNECT_API, async (req, res) => {
  const { username, level } = req.body as DisconnectRequest;

  console.log(`HTTP disconnect request from ${username} for level "${level}"`);

  // Retrieve player's current position from connectedClients map
  const client = connectedClients.get(username);
  if (client && client.position) {
    // Serialize position to JSON string
    const positionJson = JSON.stringify(client.position);

    // Store in lastKnownPosition field of player hash
    const playerKey = `player:${username}:${level}`;
    await redisStore.hSet(playerKey, { lastKnownPosition: positionJson });

    console.log(`Saved last known position for ${username}: ${positionJson}`);
  }

  // Remove from active players set
  await removeActivePlayer(username, level);

  // Remove client from connected clients
  connectedClients.delete(username);

  // Decrement player count and broadcast
  await decrementPlayerCount(level);

  // Update last active timestamp in player data
  const playerKey = `player:${username}:${level}`;
  const exists = await redisStore.exists(playerKey);
  if (exists) {
    await redisStore.hSet(playerKey, { lastActive: Date.now().toString() });
  }

  console.log(`Removed ${username} from connected clients and active players`);

  res.json({ ok: true });
});

/**
 * Position update endpoint
 */
app.post(POSITION_API, async (req, res) => {
  const { username, position, rotation } = req.body;

  try {
    const response = await handlePositionUpdate(
      username,
      position,
      rotation,
      connectedClients
    );
    res.json(response);
  } catch (error) {
    console.error("Position update error:", error);
    res.status(404).json({ error: "Client not found" });
  }
});

/**
 * Modifications endpoint
 */
app.post(MODIFICATIONS_API, async (req, res) => {
  const batch: ModificationBatchRequest = req.body;

  console.log(
    `Received batch of ${batch.modifications.length} modifications from ${batch.username}`
  );

  const validatedMods: Array<{
    position: Position;
    blockType: number | null;
    action: "place" | "remove";
    username: string;
    clientTimestamp: number;
    serverTimestamp: number;
  }> = [];
  let failedAt: number | null = null;

  // Sequential validation loop
  for (let i = 0; i < batch.modifications.length; i++) {
    const mod = batch.modifications[i];
    if (!mod) continue;

    // Validate modification
    const validation = await validateModification(batch.level, mod);

    if (!validation.valid) {
      failedAt = i;
      console.log(`Validation failed at index ${i}`);
      break;
    }

    // Add server timestamp
    const serverTimestamp = Date.now();

    const validatedMod = {
      ...mod,
      username: batch.username,
      serverTimestamp,
    };

    validatedMods.push(validatedMod);

    // Immediately broadcast to regional channel
    const regionalChannel = getRegionalChannelFromPosition(
      batch.level,
      mod.position
    );

    await realtime.send(regionalChannel, {
      type: "block-modify",
      ...validatedMod,
    });

    console.log(
      `Broadcast ${mod.action} to regional channel ${regionalChannel}`
    );
  }

  // Persist validated modifications to Redis (batched)
  if (validatedMods.length > 0) {
    await persistModificationBatch(batch.level, validatedMods);
  }

  // Send response to client
  const response: ModificationBatchResponse = {
    ok: failedAt === null,
    failedAt: failedAt,
    message:
      failedAt === null
        ? `${validatedMods.length} modifications applied`
        : `Validation failed at modification ${failedAt}`,
  };

  res.json(response);
});

/**
 * Chunk state endpoint
 */
app.post(CHUNK_STATE_API, async (req, res) => {
  const { username, level, chunks } = req.body;

  try {
    const response = await handleChunkState(username, level, chunks);
    res.json(response);
  } catch (error) {
    console.error("Chunk state error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Add friend endpoint
 */
app.post(FRIENDS_ADD_API, async (req, res) => {
  const { username, friendUsername } = req.body;

  try {
    const response = await handleAddFriend(username, friendUsername);
    res.json(response);
  } catch (error) {
    console.error("Add friend error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to add friend",
    });
  }
});

/**
 * Remove friend endpoint
 */
app.post(FRIENDS_REMOVE_API, async (req, res) => {
  const { username, friendUsername } = req.body;

  try {
    const response = await handleRemoveFriend(username, friendUsername);
    res.json(response);
  } catch (error) {
    console.error("Remove friend error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to remove friend",
    });
  }
});

/**
 * Upvote endpoint
 */
app.post(UPVOTE_API, async (req, res) => {
  const { username, level, builderUsername } = req.body;

  try {
    const response = await handleUpvote(username, level, builderUsername);
    res.json(response);
  } catch (error) {
    console.error("Upvote error:", error);
    res.status(500).json({
      ok: false,
      message: "Failed to process upvote",
    });
  }
});

/**
 * Chat endpoint
 */
app.post(CHAT_API, async (req, res) => {
  const { username, level, message } = req.body as ChatRequest;

  console.log(`Chat message from ${username} in level ${level}: ${message}`);

  // Broadcast to game-level channel
  await realtime.send(`game:${level}`, {
    type: "chat-message",
    username,
    message,
    timestamp: Date.now(),
  });

  res.json({ ok: true });
});

/**
 * Test endpoint for sending messages
 */
app.post("/send", async (req, res) => {
  const { channel, data } = req.body;
  if (!channel || !data) {
    return res.status(400).json({ error: "channel and data required" });
  }

  await realtime.send(channel, data);
  res.json({ success: true });
});

// ============================================================================
// REDIS INITIALIZATION
// ============================================================================

async function initializeRedis() {
  await publisher.connect();
  await subscriber.connect();
  await redisStore.connect();

  console.log("Redis clients connected");

  // Wrap node-redis client to match Devvit's API behavior
  const wrappedRedis = wrapNodeRedis(redisStore as any);

  // Cast to Devvit RedisClient type
  setRedis(wrappedRedis as any as RedisClient);
  setRealtime(realtime);

  console.log("Global redis and realtime instances set");
}

// ============================================================================
// SERVER START
// ============================================================================

export async function startServer() {
  try {
    await initializeRedis();

    httpServer.listen(PORT, () => {
      console.log(`Mock server listening on port ${PORT}`);
      console.log(`WebSocket server ready`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}
