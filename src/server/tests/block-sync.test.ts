import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import WebSocket from "ws";
import { createClient } from "redis";

// Note: Integration tests require the server to be running
// Run with: npm run dev:server (in another terminal)
// Then: npm test

// Test configuration
const WS_URL = "ws://localhost:3000";
const TEST_TIMEOUT = 10000;
const CHANNEL = "game-channel";
const TEST_LEVEL = "test-world";

/**
 * Block Synchronization Tests
 *
 * These tests verify the core multiplayer block synchronization functionality:
 * - Block placement broadcasting
 * - Block removal broadcasting
 * - Redis persistence
 * - Conflict resolution
 * - Self-originated modification filtering
 *
 * Requirements tested: 3.3, 6.2, 6.4
 */
describe("Block Synchronization Tests", () => {
  let redisStore: ReturnType<typeof createClient>;

  beforeAll(async () => {
    // Connect to Redis for verification
    redisStore = createClient();
    await redisStore.connect();
  });

  afterAll(async () => {
    await redisStore.quit();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await redisStore.flushDb();
  });

  /**
   * Test: Block placement is broadcast to other clients
   * Requirement 3.3: Server immediately broadcasts modifications
   */
  it(
    "should broadcast block placement to other clients",
    async () => {
      return new Promise<void>((resolve, reject) => {
        const client1 = new WebSocket(WS_URL);
        const client2 = new WebSocket(WS_URL);

        let client1Username: string;
        let client2Username: string;
        let client1Connected = false;
        let client2Connected = false;
        let broadcastReceived = false;

        // Client 1: Places a block
        client1.on("open", () => {
          client1.send(
            JSON.stringify({
              type: "subscribe",
              channel: CHANNEL,
              level: TEST_LEVEL,
            })
          );
        });

        client1.on("message", (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "connected") {
            client1Username = msg.username;
            client1Connected = true;

            // Once both clients connected, client1 places a block
            if (client2Connected) {
              client1.send(
                JSON.stringify({
                  type: "block-modify",
                  username: client1Username,
                  position: { x: 10, y: 5, z: 3 },
                  blockType: 1,
                  action: "place",
                  clientTimestamp: Date.now(),
                })
              );
            }
          }
        });

        // Client 2: Receives the broadcast
        client2.on("open", () => {
          client2.send(
            JSON.stringify({
              type: "subscribe",
              channel: CHANNEL,
              level: TEST_LEVEL,
            })
          );
        });

        client2.on("message", (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "connected") {
            client2Username = msg.username;
            client2Connected = true;

            // Once both clients connected, client1 places a block
            if (client1Connected) {
              client1.send(
                JSON.stringify({
                  type: "block-modify",
                  username: client1Username,
                  position: { x: 10, y: 5, z: 3 },
                  blockType: 1,
                  action: "place",
                  clientTimestamp: Date.now(),
                })
              );
            }
          }

          // Check for block modification broadcast
          if (msg.type === "message" && msg.data?.type === "block-modify") {
            broadcastReceived = true;

            // Verify broadcast structure
            expect(msg.data.username).toBe(client1Username);
            expect(msg.data.position).toEqual({ x: 10, y: 5, z: 3 });
            expect(msg.data.blockType).toBe(1);
            expect(msg.data.action).toBe("place");
            expect(msg.data.serverTimestamp).toBeDefined();

            client1.close();
            client2.close();
            resolve();
          }
        });

        client1.on("error", (error) => reject(error));
        client2.on("error", (error) => reject(error));

        setTimeout(() => {
          client1.close();
          client2.close();
          if (!broadcastReceived) {
            reject(new Error("Block placement broadcast not received"));
          }
        }, TEST_TIMEOUT);
      });
    },
    TEST_TIMEOUT + 1000
  );

  /**
   * Test: Block removal is broadcast to other clients
   * Requirement 3.3: Server immediately broadcasts modifications
   */
  it(
    "should broadcast block removal to other clients",
    async () => {
      return new Promise<void>((resolve, reject) => {
        const client1 = new WebSocket(WS_URL);
        const client2 = new WebSocket(WS_URL);

        let client1Username: string;
        let client1Connected = false;
        let client2Connected = false;
        let broadcastReceived = false;

        client1.on("open", () => {
          client1.send(
            JSON.stringify({
              type: "subscribe",
              channel: CHANNEL,
              level: TEST_LEVEL,
            })
          );
        });

        client1.on("message", (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "connected") {
            client1Username = msg.username;
            client1Connected = true;

            if (client2Connected) {
              // Client1 removes a block
              client1.send(
                JSON.stringify({
                  type: "block-modify",
                  username: client1Username,
                  position: { x: 15, y: 10, z: 8 },
                  blockType: null,
                  action: "remove",
                  clientTimestamp: Date.now(),
                })
              );
            }
          }
        });

        client2.on("open", () => {
          client2.send(
            JSON.stringify({
              type: "subscribe",
              channel: CHANNEL,
              level: TEST_LEVEL,
            })
          );
        });

        client2.on("message", (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "connected") {
            client2Connected = true;

            if (client1Connected) {
              // Client1 removes a block
              client1.send(
                JSON.stringify({
                  type: "block-modify",
                  username: client1Username,
                  position: { x: 15, y: 10, z: 8 },
                  blockType: null,
                  action: "remove",
                  clientTimestamp: Date.now(),
                })
              );
            }
          }

          // Check for block removal broadcast
          if (
            msg.type === "message" &&
            msg.data?.type === "block-modify" &&
            msg.data.action === "remove"
          ) {
            broadcastReceived = true;

            // Verify broadcast structure
            expect(msg.data.username).toBe(client1Username);
            expect(msg.data.position).toEqual({ x: 15, y: 10, z: 8 });
            expect(msg.data.blockType).toBeNull();
            expect(msg.data.action).toBe("remove");
            expect(msg.data.serverTimestamp).toBeDefined();

            client1.close();
            client2.close();
            resolve();
          }
        });

        client1.on("error", (error) => reject(error));
        client2.on("error", (error) => reject(error));

        setTimeout(() => {
          client1.close();
          client2.close();
          if (!broadcastReceived) {
            reject(new Error("Block removal broadcast not received"));
          }
        }, TEST_TIMEOUT);
      });
    },
    TEST_TIMEOUT + 1000
  );

  /**
   * Test: Block modifications persist in Redis chunk hashes
   * Requirement 3.4: Server persists changes to Redis asynchronously
   */
  it(
    "should persist block modifications in Redis chunk hashes",
    async () => {
      return new Promise<void>(async (resolve, reject) => {
        const client = new WebSocket(WS_URL);
        let username: string;

        client.on("open", () => {
          client.send(
            JSON.stringify({
              type: "subscribe",
              channel: CHANNEL,
              level: TEST_LEVEL,
            })
          );
        });

        client.on("message", async (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "connected") {
            username = msg.username;

            // Place a block
            client.send(
              JSON.stringify({
                type: "block-modify",
                username: username,
                position: { x: 25, y: 15, z: 30 },
                blockType: 2,
                action: "place",
                clientTimestamp: Date.now(),
              })
            );

            // Wait for async persistence
            setTimeout(async () => {
              try {
                // Verify block is in Redis
                const chunkX = Math.floor(25 / 24);
                const chunkZ = Math.floor(30 / 24);
                const chunkKey = `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`;
                const blockKey = `block:25:15:30`;

                const blockData = await redisStore.hGet(chunkKey, blockKey);
                expect(blockData).toBeDefined();

                const parsed = JSON.parse(blockData!);
                expect(parsed.type).toBe(2);
                expect(parsed.username).toBe(username);
                expect(parsed.timestamp).toBeDefined();

                client.close();
                resolve();
              } catch (error) {
                client.close();
                reject(error);
              }
            }, 500); // Wait for async persistence
          }
        });

        client.on("error", (error) => reject(error));

        setTimeout(() => {
          client.close();
          reject(new Error("Test timeout"));
        }, TEST_TIMEOUT);
      });
    },
    TEST_TIMEOUT + 1000
  );

  /**
   * Test: Block removal is persisted in Redis (block deleted from hash)
   */
  it(
    "should persist block removal in Redis by deleting from chunk hash",
    async () => {
      return new Promise<void>(async (resolve, reject) => {
        const client = new WebSocket(WS_URL);
        let username: string;

        client.on("open", () => {
          client.send(
            JSON.stringify({
              type: "subscribe",
              channel: CHANNEL,
              level: TEST_LEVEL,
            })
          );
        });

        client.on("message", async (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "connected") {
            username = msg.username;

            // First, place a block
            const position = { x: 30, y: 20, z: 35 };
            client.send(
              JSON.stringify({
                type: "block-modify",
                username: username,
                position: position,
                blockType: 3,
                action: "place",
                clientTimestamp: Date.now(),
              })
            );

            // Wait for placement to persist
            setTimeout(async () => {
              // Now remove the block
              client.send(
                JSON.stringify({
                  type: "block-modify",
                  username: username,
                  position: position,
                  blockType: null,
                  action: "remove",
                  clientTimestamp: Date.now(),
                })
              );

              // Wait for removal to persist
              setTimeout(async () => {
                try {
                  // Verify block is removed from Redis
                  const chunkX = Math.floor(position.x / 24);
                  const chunkZ = Math.floor(position.z / 24);
                  const chunkKey = `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`;
                  const blockKey = `block:${position.x}:${position.y}:${position.z}`;

                  const blockData = await redisStore.hGet(chunkKey, blockKey);
                  expect(blockData).toBeNull(); // Block should be deleted

                  client.close();
                  resolve();
                } catch (error) {
                  client.close();
                  reject(error);
                }
              }, 500);
            }, 500);
          }
        });

        client.on("error", (error) => reject(error));

        setTimeout(() => {
          client.close();
          reject(new Error("Test timeout"));
        }, TEST_TIMEOUT);
      });
    },
    TEST_TIMEOUT + 1000
  );

  /**
   * Test: Self-originated modifications are broadcast to originating client
   * Requirement 6.4: Clients should filter their own modifications
   *
   * Note: This test verifies the server broadcasts to all clients including
   * the originator. The client-side logic should ignore it.
   */
  it(
    "should broadcast modifications to originating client (for client-side filtering)",
    async () => {
      return new Promise<void>((resolve, reject) => {
        const client = new WebSocket(WS_URL);
        let username: string;
        let broadcastReceived = false;

        client.on("open", () => {
          client.send(
            JSON.stringify({
              type: "subscribe",
              channel: CHANNEL,
              level: TEST_LEVEL,
            })
          );
        });

        client.on("message", (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "connected") {
            username = msg.username;

            // Place a block
            client.send(
              JSON.stringify({
                type: "block-modify",
                username: username,
                position: { x: 5, y: 5, z: 5 },
                blockType: 1,
                action: "place",
                clientTimestamp: Date.now(),
              })
            );
          }

          // Client should receive its own modification via broadcast
          if (msg.type === "message" && msg.data?.type === "block-modify") {
            broadcastReceived = true;

            // Verify it's the same username (self-originated)
            expect(msg.data.username).toBe(username);
            expect(msg.data.position).toEqual({ x: 5, y: 5, z: 5 });

            // Client-side code should filter this out
            // This test just verifies the server sends it
            client.close();
            resolve();
          }
        });

        client.on("error", (error) => reject(error));

        setTimeout(() => {
          client.close();
          if (!broadcastReceived) {
            reject(new Error("Self-originated broadcast not received"));
          }
        }, TEST_TIMEOUT);
      });
    },
    TEST_TIMEOUT + 1000
  );

  /**
   * Test: Conflict resolution with simultaneous modifications
   * Requirement 6.2: Server timestamp-based conflict resolution
   * Requirement 6.3: Conflicts resolved using earliest server timestamp
   *
   * This test simulates two clients modifying the same block position
   * and verifies that both receive broadcasts with server timestamps.
   */
  it(
    "should handle simultaneous modifications with server timestamps",
    async () => {
      return new Promise<void>((resolve, reject) => {
        const client1 = new WebSocket(WS_URL);
        const client2 = new WebSocket(WS_URL);

        let client1Username: string;
        let client2Username: string;
        let client1Connected = false;
        let client2Connected = false;

        const client2Broadcasts: any[] = [];
        const targetPosition = { x: 50, y: 25, z: 50 };

        client1.on("open", () => {
          client1.send(
            JSON.stringify({
              type: "subscribe",
              channel: CHANNEL,
              level: TEST_LEVEL,
            })
          );
        });

        client1.on("message", (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "connected") {
            client1Username = msg.username;
            client1Connected = true;

            // When both connected, both place blocks at same position
            if (client2Connected) {
              // Client1 places block type 1
              client1.send(
                JSON.stringify({
                  type: "block-modify",
                  username: client1Username,
                  position: targetPosition,
                  blockType: 1,
                  action: "place",
                  clientTimestamp: Date.now(),
                })
              );

              // Client2 places block type 2 (conflict!)
              setTimeout(() => {
                client2.send(
                  JSON.stringify({
                    type: "block-modify",
                    username: client2Username,
                    position: targetPosition,
                    blockType: 2,
                    action: "place",
                    clientTimestamp: Date.now(),
                  })
                );
              }, 10); // Small delay to simulate near-simultaneous
            }
          }
        });

        client2.on("open", () => {
          client2.send(
            JSON.stringify({
              type: "subscribe",
              channel: CHANNEL,
              level: TEST_LEVEL,
            })
          );
        });

        client2.on("message", (data: Buffer) => {
          const msg = JSON.parse(data.toString());

          if (msg.type === "connected") {
            client2Username = msg.username;
            client2Connected = true;

            // When both connected, both place blocks at same position
            if (client1Connected) {
              // Client1 places block type 1
              client1.send(
                JSON.stringify({
                  type: "block-modify",
                  username: client1Username,
                  position: targetPosition,
                  blockType: 1,
                  action: "place",
                  clientTimestamp: Date.now(),
                })
              );

              // Client2 places block type 2 (conflict!)
              setTimeout(() => {
                client2.send(
                  JSON.stringify({
                    type: "block-modify",
                    username: client2Username,
                    position: targetPosition,
                    blockType: 2,
                    action: "place",
                    clientTimestamp: Date.now(),
                  })
                );
              }, 10); // Small delay to simulate near-simultaneous
            }
          }

          // Client2 collects broadcasts to verify conflict scenario
          if (msg.type === "message" && msg.data?.type === "block-modify") {
            client2Broadcasts.push(msg.data);

            // After receiving both broadcasts, verify
            if (client2Broadcasts.length >= 2) {
              setTimeout(() => {
                try {
                  // Both modifications should have server timestamps
                  expect(client2Broadcasts[0].serverTimestamp).toBeDefined();
                  expect(client2Broadcasts[1].serverTimestamp).toBeDefined();

                  // Verify both broadcasts are for the same position
                  expect(client2Broadcasts[0].position).toEqual(targetPosition);
                  expect(client2Broadcasts[1].position).toEqual(targetPosition);

                  // Verify different usernames (conflict scenario)
                  const usernames = [
                    client2Broadcasts[0].username,
                    client2Broadcasts[1].username,
                  ];
                  expect(usernames).toContain(client1Username);
                  expect(usernames).toContain(client2Username);

                  // Verify different block types (conflict scenario)
                  const blockTypes = [
                    client2Broadcasts[0].blockType,
                    client2Broadcasts[1].blockType,
                  ];
                  expect(blockTypes).toContain(1);
                  expect(blockTypes).toContain(2);

                  console.log("Conflict detected with timestamps:", {
                    modification1: {
                      username: client2Broadcasts[0].username,
                      blockType: client2Broadcasts[0].blockType,
                      timestamp: client2Broadcasts[0].serverTimestamp,
                    },
                    modification2: {
                      username: client2Broadcasts[1].username,
                      blockType: client2Broadcasts[1].blockType,
                      timestamp: client2Broadcasts[1].serverTimestamp,
                    },
                  });

                  client1.close();
                  client2.close();
                  resolve();
                } catch (error) {
                  client1.close();
                  client2.close();
                  reject(error);
                }
              }, 500); // Wait for all broadcasts
            }
          }
        });

        client1.on("error", (error) => reject(error));
        client2.on("error", (error) => reject(error));

        setTimeout(() => {
          client1.close();
          client2.close();
          reject(
            new Error(
              `Test timeout - received ${client2Broadcasts.length} broadcasts`
            )
          );
        }, TEST_TIMEOUT);
      });
    },
    TEST_TIMEOUT + 1000
  );
});
