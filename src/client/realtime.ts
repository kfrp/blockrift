// Mock Devvit realtime client API

export interface RealtimeConnection {
  channel: string;
  disconnect: () => Promise<void>;
}

interface ConnectRealtimeOptions {
  channel: string;
  onConnect?: (channel: string) => void;
  onDisconnect?: (channel: string) => void;
  onMessage?: (data: any) => void;
}

// Shared WebSocket connection for all channels
let sharedWs: WebSocket | null = null;
let wsConnecting: Promise<WebSocket> | null = null;
const channelHandlers = new Map<string, Set<(data: any) => void>>();
const channelConnectCallbacks = new Map<
  string,
  Set<(channel: string) => void>
>();
const channelDisconnectCallbacks = new Map<
  string,
  Set<(channel: string) => void>
>();

async function getSharedWebSocket(): Promise<WebSocket> {
  if (sharedWs && sharedWs.readyState === WebSocket.OPEN) {
    return sharedWs;
  }

  if (wsConnecting) {
    return wsConnecting;
  }

  wsConnecting = new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://localhost:3000");

    ws.onopen = () => {
      console.log("Shared WebSocket connected");
      sharedWs = ws;
      wsConnecting = null;
      resolve(ws);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Determine which channel this message is for
        let targetChannel: string | null = null;

        if (msg.type === "subscribed" || msg.type === "disconnected") {
          targetChannel = msg.channel;
        } else if (msg.channel) {
          targetChannel = msg.channel;
        } else {
          // Broadcast to all channels
          for (const handlers of channelHandlers.values()) {
            handlers.forEach((handler) => handler(msg));
          }
          return;
        }

        // Call appropriate handlers for this channel
        if (targetChannel) {
          if (msg.type === "subscribed") {
            const callbacks = channelConnectCallbacks.get(targetChannel);
            callbacks?.forEach((cb) => cb(targetChannel));
          } else if (msg.type === "disconnected") {
            const callbacks = channelDisconnectCallbacks.get(targetChannel);
            callbacks?.forEach((cb) => cb(targetChannel));
          } else {
            const handlers = channelHandlers.get(targetChannel);
            handlers?.forEach((handler) => handler(msg));
          }
        }
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      wsConnecting = null;
      reject(error);
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
      sharedWs = null;
      wsConnecting = null;

      // Notify all channels of disconnection
      for (const [channel, callbacks] of channelDisconnectCallbacks.entries()) {
        callbacks.forEach((cb) => cb(channel));
      }
    };
  });

  return wsConnecting;
}

export async function connectRealtime(
  options: ConnectRealtimeOptions
): Promise<RealtimeConnection> {
  const { channel, onConnect, onDisconnect, onMessage } = options;

  // Get or create shared WebSocket
  const ws = await getSharedWebSocket();

  // Register handlers for this channel
  if (!channelHandlers.has(channel)) {
    channelHandlers.set(channel, new Set());
  }
  if (onMessage) {
    channelHandlers.get(channel)!.add(onMessage);
  }

  if (!channelConnectCallbacks.has(channel)) {
    channelConnectCallbacks.set(channel, new Set());
  }
  if (onConnect) {
    channelConnectCallbacks.get(channel)!.add(onConnect);
  }

  if (!channelDisconnectCallbacks.has(channel)) {
    channelDisconnectCallbacks.set(channel, new Set());
  }
  if (onDisconnect) {
    channelDisconnectCallbacks.get(channel)!.add(onDisconnect);
  }

  // Subscribe to channel via WebSocket
  ws.send(
    JSON.stringify({
      type: "subscribe",
      channel,
    })
  );

  return {
    channel,
    disconnect: async () => {
      // Unsubscribe from channel via WebSocket
      if (sharedWs && sharedWs.readyState === WebSocket.OPEN) {
        sharedWs.send(
          JSON.stringify({
            type: "unsubscribe",
            channel,
          })
        );
      }

      // Remove handlers for this channel
      channelHandlers.delete(channel);
      channelConnectCallbacks.delete(channel);
      channelDisconnectCallbacks.delete(channel);
    },
  };
}
