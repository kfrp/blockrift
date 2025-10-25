// Mock Devvit realtime client API

interface RealtimeConnection {
  channel: string;
  ws: WebSocket;
  disconnect: () => void;
}

interface ConnectRealtimeOptions {
  channel: string;
  onConnect?: (channel: string) => void;
  onDisconnect?: (channel: string) => void;
  onMessage?: (data: any) => void;
}

export async function connectRealtime(
  options: ConnectRealtimeOptions
): Promise<RealtimeConnection> {
  const { channel, onConnect, onDisconnect, onMessage } = options;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://localhost:3000");

    ws.onopen = () => {
      console.log("WebSocket connected");

      // Subscribe to channel
      ws.send(
        JSON.stringify({
          type: "subscribe",
          channel,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "connected") {
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
        }

        if (msg.type === "disconnected") {
          console.log(`Disconnected from ${msg.channel}`);
          onDisconnect?.(msg.channel);
        }

        if (msg.type === "message") {
          console.log("Received message:", msg.data);
          onMessage?.(msg.data);
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
