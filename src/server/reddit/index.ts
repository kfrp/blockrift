/**
 * Reddit Server Implementation
 * Uses Devvit's platform APIs for production deployment
 */

import {
  createServer,
  getServerPort,
  context,
  realtime,
  reddit,
  redis,
} from "@devvit/web/server";

import express from "express";

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
} from "../../shared/endpoints";

// Import types
import type {
  ConnectedClient,
  PositionUpdateRequest,
  ModificationBatchRequest,
  ModificationBatchResponse,
  ChunkStateRequest,
  AddFriendRequest,
  RemoveFriendRequest,
  UpvoteRequest,
  Position,
  Modification,
} from "../types";

// Import helpers
import {
  removeActivePlayer,
  decrementPlayerCount,
  getRegionalChannelFromPosition,
  initializeTerrainSeeds,
} from "../endpoints/helpers";

// ============================================================================
// CONNECTED CLIENTS TRACKING
// ============================================================================

// Track connected clients (in-memory, per server instance)
const connectedClients = new Map<string, ConnectedClient>();

// ============================================================================
// DEVVIT SERVER SETUP
// ============================================================================

/**
 * Create and configure the Reddit server
 * This function is called by Devvit when the app starts
 */

// Set global redis and realtime instances
setRedis(redis);
setRealtime(realtime);

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract username from Reddit context
 * @param context Devvit context
 * @returns Username or null if not authenticated
 */
async function getUsernameFromContext(): Promise<string | null> {
  try {
    const username = await reddit.getCurrentUsername();
    return username || null;
  } catch (error) {
    console.error("Failed to get username from context:", error);
    return null;
  }
}

/**
 * Extract and validate level from context.postId
 * Implements fallback logic: use default if postId seeds don't exist
 * @param context Devvit context
 * @returns Level identifier
 */
async function getLevelFromContext(
  postId: string | undefined
): Promise<string> {
  if (!postId) {
    return "default";
  }

  // Check if terrain seeds exist for this postId
  const seedsExist = await redis.exists(`terrain:seeds:${postId}`);

  if (seedsExist) {
    return postId;
  }

  // Seeds don't exist for postId, check if default seeds exist
  const defaultSeedsExist = await redis.exists("terrain:seeds:default");
  if (defaultSeedsExist) {
    return "default";
  }

  // Initialize default seeds

  await initializeTerrainSeeds("default");
  return "default";
}

// ============================================================================
// VALIDATION HELPERS (for modifications endpoint)
// ============================================================================

/**
 * Validate a single modification
 * Currently always returns valid, but can be extended with permission checks
 */
async function validateModification(
  _level: string,
  mod: Modification
): Promise<{ valid: boolean; reason?: string }> {
  // Basic validation: check if coordinates are reasonable
  const { x, y, z } = mod.position;

  // Validate Y coordinate (height)
  if (y < 0 || y > 255) {
    return { valid: false, reason: "Invalid Y coordinate" };
  }

  // Validate X and Z coordinates (reasonable world bounds)
  if (Math.abs(x) > 1000000 || Math.abs(z) > 1000000) {
    return { valid: false, reason: "Coordinates out of bounds" };
  }

  // All validations passed
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
  // Devvit's redis doesn't have multi(), so we process sequentially
  // This is acceptable for batch sizes we're dealing with

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
      await redis.hSet(chunkKey, { [blockKey]: blockData });
    } else if (mod.action === "remove") {
      // Store block removal
      const blockData = JSON.stringify({
        type: 0,
        username: mod.username,
        timestamp: mod.serverTimestamp,
        placed: false,
        removed: true,
      });
      await redis.hSet(chunkKey, { [blockKey]: blockData });
    }
  }
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Connect endpoint
 * Handles initial connection and game state retrieval
 */
app.post(CONNECT_API, async (_req, res) => {
  try {
    const username = await getUsernameFromContext();
    if (!username) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const level = await getLevelFromContext(context.postId);

    const response = await handleConnect(username, level, connectedClients);
    res.json(response);
  } catch (error) {
    console.error("Connect error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Disconnect endpoint
 * Handles clean disconnect and position persistence
 */
app.post(DISCONNECT_API, async (_req, res) => {
  try {
    const username = await getUsernameFromContext();
    if (!username) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const level = await getLevelFromContext(context.postId);

    // Retrieve player's current position from connectedClients map
    const client = connectedClients.get(username);
    if (client && client.position) {
      // Serialize position to JSON string
      const positionJson = JSON.stringify(client.position);

      // Store in lastKnownPosition field of player hash
      const playerKey = `player:${username}:${level}`;
      await redis.hSet(playerKey, { lastKnownPosition: positionJson });
    }

    // Remove from active players set
    await removeActivePlayer(username, level);

    // Remove client from connected clients
    connectedClients.delete(username);

    // Decrement player count and broadcast
    await decrementPlayerCount(level);

    // Update last active timestamp in player data
    const playerKey = `player:${username}:${level}`;
    const exists = await redis.exists(playerKey);
    if (exists) {
      await redis.hSet(playerKey, { lastActive: Date.now().toString() });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Disconnect error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Position update endpoint
 * Handles player position and rotation updates
 */
app.post(POSITION_API, async (_req, res) => {
  try {
    const username = await getUsernameFromContext();
    if (!username) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { level, position, rotation } = _req.body as PositionUpdateRequest & {
      level: string;
    };

    const response = await handlePositionUpdate(
      username,
      level || "default",
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
 * Handles batch block modifications
 */
app.post(MODIFICATIONS_API, async (_req, res) => {
  try {
    const username = await getUsernameFromContext();
    if (!username) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const level = await getLevelFromContext(context.postId);
    const batch: ModificationBatchRequest = {
      ..._req.body,
      username,
      level,
    };

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
      const mod = batch.modifications[i]!;

      // Validate modification
      const validation = await validateModification(level, mod);

      if (!validation.valid) {
        failedAt = i;

        break;
      }

      // Add server timestamp
      const serverTimestamp = Date.now();

      const validatedMod = {
        ...mod,
        username,
        serverTimestamp,
      };

      validatedMods.push(validatedMod);

      // Immediately broadcast to regional channel
      const regionalChannel = getRegionalChannelFromPosition(
        level,
        mod.position
      );

      await realtime.send(
        regionalChannel,
        JSON.stringify({
          type: "block-modify",
          ...validatedMod,
        })
      );
    }

    // Persist validated modifications to Redis (batched)
    if (validatedMods.length > 0) {
      await persistModificationBatch(level, validatedMods);
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
  } catch (error) {
    console.error("Modifications error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Chunk state endpoint
 * Handles requests for chunk data
 */
app.post(CHUNK_STATE_API, async (req, res) => {
  try {
    const username = await getUsernameFromContext();
    if (!username) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const level = await getLevelFromContext(context.postId);
    const { chunks } = req.body as ChunkStateRequest;

    const response = await handleChunkState(username, level, chunks);
    res.json(response);
  } catch (error) {
    console.error("Chunk state error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Add friend endpoint
 * Handles adding friends globally
 */
app.post(FRIENDS_ADD_API, async (req, res) => {
  try {
    const username = await getUsernameFromContext();
    if (!username) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { friendUsername } = req.body as AddFriendRequest;

    const response = await handleAddFriend(
      username,
      friendUsername,
      connectedClients
    );
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
 * Handles removing friends globally
 */
app.post(FRIENDS_REMOVE_API, async (req, res) => {
  try {
    const username = await getUsernameFromContext();
    if (!username) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { friendUsername } = req.body as RemoveFriendRequest;

    const response = await handleRemoveFriend(
      username,
      friendUsername,
      connectedClients
    );
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
 * Handles upvoting builders
 */
app.post(UPVOTE_API, async (req, res) => {
  try {
    const username = await getUsernameFromContext();
    if (!username) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const level = await getLevelFromContext(context.postId);
    const { builderUsername } = req.body as UpvoteRequest;

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

// ============================================================================
// INTERNAL ENDPOINTS
// ============================================================================

/**
 * Internal endpoint: On app install
 * Creates initial post when app is installed
 */
app.post("/internal/on-app-install", async (_req, res) => {
  try {
    // Get current subreddit
    const subreddit = await reddit.getCurrentSubreddit();

    // Create initial post (self post with text)
    const post = await reddit.submitCustomPost({
      title: "BlockRift - Multiplayer Voxel Game [#1]",
      subredditName: subreddit.name,
      splash: {
        backgroundUri: "menu2.png",
        buttonLabel: "Play",
        appIconUri: "icon.png",
      },
    });

    res.json({ success: true, postId: post.id });
  } catch (error) {
    console.error("App install error:", error);
    res.status(500).json({ error: "Failed to create initial post" });
  }
});

/**
 * Internal endpoint: Provide data (placeholder)
 * Used for seeding daily game data
 */
app.post("/internal/menu/provide-data", async (_req, res) => {
  try {
    // Placeholder implementation
    // This can be extended to seed daily challenges, events, etc.

    res.json({ success: true, message: "Data seeding not yet implemented" });
  } catch (error) {
    console.error("Provide data error:", error);
    res.status(500).json({ error: "Failed to provide data" });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "reddit" });
});

// ============================================================================
// START SERVER
// ============================================================================

// Create Devvit server

export function startServer() {
  const server = createServer(app);

  // Get port from Devvit
  const port = getServerPort();

  // Start listening
  server.listen(port, () => {});
}
