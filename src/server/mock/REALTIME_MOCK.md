# Devvit Realtime Mock Server

This is a mock implementation of Reddit's Devvit realtime API using Express, WebSocket (ws), and Redis.

## Setup

1. Make sure Redis is running locally on default port (6379)
2. Install dependencies (already done): `npm install`

## Running

Start both client and server:

```bash
npm run dev
```

Or run separately:

```bash
# Terminal 1 - Server
npm run dev:server

# Terminal 2 - Client
npm run dev:client
```

## Server API (src/server/index.ts)

Mimics Devvit's server-side realtime API:

```typescript
import { realtime } from "./server/index";

// Send a message to a channel
await realtime.send("my-channel", {
  type: "user-joined",
  userId: "123",
});
```

### HTTP Endpoints

- `GET /health` - Health check
- `POST /send` - Send message to channel
  ```json
  {
    "channel": "my-channel",
    "data": { "type": "user-joined", "userId": "123" }
  }
  ```

## Client API (src/client/realtime.ts)

Mimics Devvit's client-side realtime API:

```typescript
import { connectRealtime } from "./realtime";

const connection = await connectRealtime({
  channel: "my-channel",
  onConnect: (channel) => {},
  onDisconnect: (channel) => {},
  onMessage: (data) => {},
});

// Later, disconnect
connection.disconnect();
```

## Testing

A test file is provided at `src/client/realtime-test.ts` that demonstrates:

1. Connecting to a channel
2. Sending a message via HTTP
3. Receiving the message via WebSocket
4. Disconnecting

To use it in your client code, import and call:

```typescript
import { testRealtime } from "./realtime-test";
testRealtime();
```

## Architecture

- **Server**: Express + WebSocket (ws) + Redis pub/sub
- **Client**: WebSocket connection that mimics Devvit's API
- **Redis**: Used for pub/sub to distribute messages across channels

This setup closely mirrors how Devvit's realtime system works, making it easy to transition your code to the actual Devvit platform.
