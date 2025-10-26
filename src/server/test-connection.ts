// Manual test script for connection handshake
// Run with: npx tsx src/server/test-connection.ts

import WebSocket from "ws";

async function testConnectionHandshake() {
  console.log("Testing connection handshake...\n");

  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket("ws://localhost:3000");
    let receivedConnected = false;
    let receivedWorldState = false;

    ws.on("open", () => {
      console.log("✓ WebSocket connected");

      // Subscribe to game channel
      ws.send(
        JSON.stringify({
          type: "subscribe",
          channel: "game-channel",
        })
      );
      console.log("→ Sent subscribe message");
    });

    ws.on("message", (data: Buffer) => {
      const msg = JSON.parse(data.toString());
      console.log("\n← Received message:", msg.type);

      if (msg.type === "connected") {
        console.log("✓ Received ConnectedMessage");
        console.log("  - Username:", msg.username);
        console.log("  - SessionId:", msg.sessionId);
        console.log("  - Terrain Seeds:", msg.terrainSeeds ? "✓" : "✗");

        if (msg.terrainSeeds) {
          console.log("    - seed:", msg.terrainSeeds.seed);
          console.log("    - treeSeed:", msg.terrainSeeds.treeSeed);
          console.log("    - stoneSeed:", msg.terrainSeeds.stoneSeed);
          console.log("    - coalSeed:", msg.terrainSeeds.coalSeed);
        }

        receivedConnected = true;

        // Request world state for chunk (0, 0)
        ws.send(
          JSON.stringify({
            type: "world-state-request",
            chunkX: 0,
            chunkZ: 0,
          })
        );
        console.log("\n→ Sent world-state-request for chunk (0, 0)");
      }

      if (msg.type === "world-state") {
        console.log("✓ Received WorldStateResponse");
        console.log("  - ChunkX:", msg.chunkX);
        console.log("  - ChunkZ:", msg.chunkZ);
        console.log("  - Blocks:", msg.blocks.length);
        console.log("  - Players:", msg.players.length);

        receivedWorldState = true;
      }

      if (msg.type === "message" && msg.data.type === "player-joined") {
        console.log("✓ Received player-joined broadcast");
        console.log("  - Username:", msg.data.username);
        console.log("  - Position:", msg.data.position);
      }

      // Check if all tests passed
      if (receivedConnected && receivedWorldState) {
        console.log("\n✓ All tests passed!");
        ws.close();
        setTimeout(() => resolve(), 100);
      }
    });

    ws.on("error", (error) => {
      console.error("✗ WebSocket error:", error.message);
      reject(error);
    });

    ws.on("close", () => {
      console.log("\n✓ WebSocket closed");
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!receivedConnected || !receivedWorldState) {
        console.error("\n✗ Test timeout - not all messages received");
        ws.close();
        reject(new Error("Test timeout"));
      }
    }, 5000);
  });
}

// Run the test
console.log("Make sure the server is running (npm run dev:server)\n");
testConnectionHandshake()
  .then(() => {
    console.log("\nTest completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nTest failed:", error.message);
    process.exit(1);
  });
