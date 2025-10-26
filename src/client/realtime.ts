// Mock Devvit realtime client API

export interface RealtimeConnection {
  channel: string;
  ws: WebSocket;
  disconnect: () => void;
}

interface ConnectRealtimeOptions {
  channel: string;
  level?: string; // Optional level identifier for separate game worlds
  onConnect?: (channel: string) => void;
  onDisconnect?: (channel: string) => void;
  onMessage?: (data: any) => void;
}

export async function connectRealtime(
  options: ConnectRealtimeOptions
): Promise<RealtimeConnection> {
  const { channel, level, onConnect, onDisconnect, onMessage } = options;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://localhost:3000");

    ws.onopen = () => {
      console.log("WebSocket connected");

      // Subscribe to channel with optional level
      ws.send(
        JSON.stringify({
          type: "subscribe",
          channel,
          level: level || "default", // Default level if not specified
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log(msg);
        if (msg.type === "subscribed") {
          console.log(`Connected to ${msg.channel}`);
          onConnect?.(msg.channel);

          // Resolve the promise with the connection object
          resolve({
            channel: msg.channel,
            ws,
            disconnect: () => {
              ws.send(
                JSON.stringify({
                  type: "unsubscribe",
                  channel: msg.channel,
                })
              );
            },
          });

          // Also pass the connected message to onMessage handler
          onMessage?.(msg);
        } else if (msg.type === "disconnected") {
          console.log(`Disconnected from ${msg.channel}`);
          onDisconnect?.(msg.channel);
        } else if (msg.type === "message") {
          onMessage?.(msg.data);
        } else {
          // Pass all other message types directly to onMessage handler
          // This includes: block-modify, player-positions, player-joined, player-left, etc.
          onMessage?.(msg);
        }
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      reject(error);
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
      onDisconnect?.(channel);
    };
  });
}
