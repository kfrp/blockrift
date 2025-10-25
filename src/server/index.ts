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

// Track active channels and their subscribers
const channelSubscribers = new Map<string, Set<WebSocket>>();

// Initialize Redis connections
async function initRedis() {
  await publisher.connect();
  await subscriber.connect();
  console.log("Redis connected");
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
  console.log("Client connected");

  ws.on("message", async (message: string) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.type === "subscribe") {
        const channel = msg.channel;
        console.log(`Client subscribing to ${channel}`);

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

        // Send connected confirmation
        ws.send(
          JSON.stringify({
            type: "connected",
            channel,
          })
        );
      }

      if (msg.type === "unsubscribe") {
        const channel = msg.channel;
        console.log(`Client unsubscribing from ${channel}`);

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
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");

    // Remove client from all channels
    channelSubscribers.forEach((subscribers, channel) => {
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
    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`WebSocket server ready`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
