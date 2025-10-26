import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { createClient } from "redis";

// Note: These tests require the server to be running
// Run with: npm run dev:server (in another terminal)
// Then: npm test

const WS_URL = "ws://localhost:3000";
const TEST_TIMEOUT = 10000;

describe("Connection Handshake Flow", () => {
  let redisStore: ReturnType<typeof createClient>;

  beforeAll(async () => {
    // Connect to Redis to verify server state
    redisStore = createClient();
    await redisStore.connect();

    // Clear test data
    await redisStore.flushDb();
  });

  afterAll(async () => {
    await redisStore.quit();
  });

  it(
    "should complete full connection handshake",
    async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        let receivedConnected = false;
        let receivedWorldState = false;
        let username: string | null = null;

        ws.on("open", () => {
          // Subscribe to game channel
          ws.send(
            JSON.stringify({
              type: "subscribe",
              channel: "game-channel",
            })
          );
        });

        ws.on("message", (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "connected") {
            receivedConnected = true;
            username = msg.username;

            // Verify ConnectedMessage structure
            expect(msg.username).toBeDefined();
            expect(msg.username).toMatch(/^Player\d+$/);
            expect(msg.sessionId).toBeDefined();
            expect(msg.terrainSeeds).toBeDefined();
            expect(msg.terrainSeeds.seed).toBeDefined();
            expect(msg.terrainSeeds.treeSeed).toBeDefined();
            expect(msg.terrainSeeds.stoneSeed).toBeDefined();
            expect(msg.terrainSeeds.coalSeed).toBeDefined();

            // Request world state
            ws.send(
              JSON.stringify({
                type: "world-state-request",
                chunkX: 0,
                chunkZ: 0,
              })
            );
          }

          if (msg.type === "world-state") {
            receivedWorldState = true;

            // Verify WorldStateResponse structure
            expect(msg.chunkX).toBe(0);
            expect(msg.chunkZ).toBe(0);
            expect(msg.blocks).toBeDefined();
            expect(Array.isArray(msg.blocks)).toBe(true);
            expect(msg.players).toBeDefined();
            expect(Array.isArray(msg.players)).toBe(true);
          }

          // Complete test when both messages received
          if (receivedConnected && receivedWorldState) {
            ws.close();
            resolve();
          }
        });

        ws.on("error", (error) => {
          reject(
            new Error(
              `WebSocket error: ${error.message}. Make sure server is running (npm run dev:server)`
            )
          );
        });

        // Timeout
        setTimeout(() => {
          if (!receivedConnected || !receivedWorldState) {
            ws.close();
            reject(
              new Error(
                `Test timeout. Received connected: ${receivedConnected}, world state: ${receivedWorldState}`
              )
            );
          }
        }, TEST_TIMEOUT);
      });
    },
    TEST_TIMEOUT + 1000
  );

  it(
    "should receive player-joined broadcast",
    async () => {
      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        let receivedPlayerJoined = false;

        ws.on("open", () => {
          ws.send(
            JSON.stringify({
              type: "subscribe",
              channel: "game-channel",
            })
          );
        });

        ws.on("message", (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "message" && msg.data?.type === "player-joined") {
            receivedPlayerJoined = true;

            // Verify player-joined message structure
            expect(msg.data.username).toBeDefined();
            expect(msg.data.username).toMatch(/^Player\d+$/);
            expect(msg.data.position).toBeDefined();
            expect(msg.data.position.x).toBeDefined();
            expect(msg.data.position.y).toBeDefined();
            expect(msg.data.position.z).toBeDefined();

            ws.close();
            resolve();
          }
        });

        ws.on("error", (error) => {
          reject(
            new Error(
              `WebSocket error: ${error.message}. Make sure server is running (npm run dev:server)`
            )
          );
        });

        setTimeout(() => {
          if (!receivedPlayerJoined) {
            ws.close();
            reject(new Error("Test timeout - player-joined not received"));
          }
        }, TEST_TIMEOUT);
      });
    },
    TEST_TIMEOUT + 1000
  );

  it(
    "should assign unique usernames to multiple clients",
    async () => {
      const clients: WebSocket[] = [];
      const usernames = new Set<string>();

      return new Promise<void>((resolve, reject) => {
        let connectedCount = 0;
        const expectedClients = 3;

        for (let i = 0; i < expectedClients; i++) {
          const ws = new WebSocket(WS_URL);
          clients.push(ws);

          ws.on("open", () => {
            ws.send(
              JSON.stringify({
                type: "subscribe",
                channel: "game-channel",
              })
            );
          });

          ws.on("message", (data: Buffer) => {
            const msg = JSON.parse(data.toString());

            if (msg.type === "connected") {
              usernames.add(msg.username);
              connectedCount++;

              if (connectedCount === expectedClients) {
                // Verify all usernames are unique
                expect(usernames.size).toBe(expectedClients);

                // Close all clients
                clients.forEach((client) => client.close());
                resolve();
              }
            }
          });

          ws.on("error", (error) => {
            clients.forEach((client) => client.close());
            reject(new Error(`WebSocket error: ${error.message}`));
          });
        }

        setTimeout(() => {
          clients.forEach((client) => client.close());
          reject(
            new Error(
              `Test timeout - only ${connectedCount}/${expectedClients} clients connected`
            )
          );
        }, TEST_TIMEOUT);
      });
    },
    TEST_TIMEOUT + 1000
  );

  it(
    "should return terrain seeds from Redis",
    async () => {
      // Set specific terrain seeds before connecting
      const seeds = {
        seed: 0.123456,
        treeSeed: 0.234567,
        stoneSeed: 0.345678,
        coalSeed: 0.456789,
      };
      await redisStore.del("terrain:seeds:default");
      await redisStore.set("terrain:seeds:default", JSON.stringify(seeds));

      return new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(WS_URL);

        ws.on("open", () => {
          ws.send(
            JSON.stringify({
              type: "subscribe",
              channel: "game-channel",
            })
          );
        });

        ws.on("message", async (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "connected") {
            // Verify terrain seeds match what we set
            expect(msg.terrainSeeds.seed).toBe(0.123456);
            expect(msg.terrainSeeds.treeSeed).toBe(0.234567);
            expect(msg.terrainSeeds.stoneSeed).toBe(0.345678);
            expect(msg.terrainSeeds.coalSeed).toBe(0.456789);

            ws.close();
            resolve();
          }
        });

        ws.on("error", (error) => {
          reject(new Error(`WebSocket error: ${error.message}`));
        });

        setTimeout(() => {
          ws.close();
          reject(new Error("Test timeout"));
        }, TEST_TIMEOUT);
      });
    },
    TEST_TIMEOUT + 1000
  );
});
