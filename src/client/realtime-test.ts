// Test file for Devvit realtime mock
import { connectRealtime } from "./realtime";

async function testRealtime() {
  console.log("Starting realtime test...");

  // Connect to a channel
  const connection = await connectRealtime({
    channel: "my-channel",
    onConnect: (channel) => {
      console.log(`✓ Connected to ${channel}`);
    },
    onDisconnect: (channel) => {
      console.log(`✓ Disconnected from ${channel}`);
    },
    onMessage: (data) => {
      console.log("✓ Received message:", data);
    },
  });

  console.log("Connection established:", connection.channel);

  // Test sending a message via HTTP endpoint
  setTimeout(async () => {
    console.log("\nSending test message via HTTP...");

    try {
      const response = await fetch("http://localhost:3000/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: "my-channel",
          data: {
            type: "user-joined",
            userId: "123",
            timestamp: Date.now(),
          },
        }),
      });

      const result = await response.json();
      console.log("Message sent:", result);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  }, 1000);

  // Disconnect after 5 seconds
  setTimeout(() => {
    console.log("\nDisconnecting...");
    connection.disconnect();
  }, 5000);
}

// Run test when this file is imported
if (typeof window !== "undefined") {
  // Browser environment
  testRealtime().catch(console.error);
}

export { testRealtime };
