// Manual test script for connection handshake
// Run with: npx tsx src/server/test-connection.ts

import WebSocket from "ws";

async function testConnectionHandshake() {
  

  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket("ws://localhost:3000");
    let receivedConnected = false;
    let receivedWorldState = false;

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
        
        
        
        

        if (msg.terrainSeeds) {
          
          
          
          
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
        ");
      }

      if (msg.type === "world-state") {
        
        
        
        
        

        receivedWorldState = true;
      }

      if (msg.type === "message" && msg.data.type === "player-joined") {
        
        
        
      }

      // Check if all tests passed
      if (receivedConnected && receivedWorldState) {
        
        ws.close();
        setTimeout(() => resolve(), 100);
      }
    });

    ws.on("error", (error) => {
      console.error("✗ WebSocket error:", error.message);
      reject(error);
    });

    ws.on("close", () => {
      
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
\n");
testConnectionHandshake()
  .then(() => {
    
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nTest failed:", error.message);
    process.exit(1);
  });
