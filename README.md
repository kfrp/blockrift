# Minecraft Three.js - Reddit Devvit Edition

A Minecraft clone built with Three.js and TypeScript, being adapted for the Reddit platform using Devvit.

## Project Overview

This project is a voxel-based game (Minecraft clone) that's being prepared for deployment on Reddit as a Devvit app. The codebase is structured to allow rapid local development with a mock server before deploying to Devvit's platform.

### Architecture

```
src/
├── client/              # Three.js game client (runs in browser)
│   ├── assets/          # Game assets (textures, sounds, music, fonts)
│   ├── terrain/         # Terrain generation with noise and workers
│   │   ├── index.ts     # Terrain management and chunk system
│   │   ├── noise.ts     # Perlin noise for terrain generation
│   │   └── worker.ts    # Web worker for terrain generation
│   ├── mesh/            # 3D mesh and geometry
│   │   ├── block.ts     # Block mesh generation
│   │   └── materials.ts # Three.js materials for blocks
│   ├── ui/              # Game UI components
│   │   ├── index.ts     # UI manager
│   │   ├── bag.ts       # Inventory/hotbar UI
│   │   ├── audio.ts     # Sound and music management
│   │   └── joystick.ts  # Mobile touch controls
│   ├── main.ts          # Game entry point and initialization
│   ├── core.ts          # Core game loop and rendering
│   ├── player.ts        # Player entity and physics
│   ├── control.ts       # Keyboard/mouse input handling
│   ├── highlight.ts     # Block selection highlighting
│   ├── utils.ts         # Utility functions
│   ├── realtime.ts      # Mock Devvit realtime client API
│   └── realtime-test.ts # Test file for realtime API
│
└── server/              # Mock Express server (for local dev)
    └── index.ts         # WebSocket + Redis pub/sub server
```

### Current Features

**Game Client:**

- Destroy and place blocks
- Mouse wheel (or number key) to select different block types
- Movement and collision detection
- Random terrain / blocks / tree generation
- Infinite world
- Game save / load
- Sound effects and BGM
- Block highlighting at crosshair
- Basic UI and settings
- Mobile friendly

**Development Infrastructure:**

- Mock Devvit realtime API using WebSocket (ws) and Redis
- Express server for local testing
- Hot reload for rapid iteration

## Getting Started

### Prerequisites

- Node.js (v18+)
- Redis (running locally on port 6379)

### Installation

```bash
npm install
```

### Running Locally

Start both client and server in development mode:

```bash
npm run dev
```

Or run separately:

```bash
# Terminal 1 - Mock server
npm run dev:server

# Terminal 2 - Client with hot reload
npm run dev:client
```

The client will be available at `http://localhost:5173`

## Devvit Integration

This project uses a mock implementation of Reddit's Devvit realtime API to enable local development without deploying to Reddit for every change.

### Mock Realtime API

**Server-side** (`src/server/index.ts`):

```typescript
import { realtime } from "./server/index";

// Send messages to connected clients
await realtime.send("game-channel", {
  type: "block-placed",
  position: { x: 10, y: 5, z: 3 },
  blockType: "stone",
});
```

**Client-side** (`src/client/realtime.ts`):

```typescript
import { connectRealtime } from "./realtime";

const connection = await connectRealtime({
  channel: "game-channel",
  onConnect: (channel) => console.log(`Connected to ${channel}`),
  onMessage: (data) => {
    // Handle game events
    console.log("Received:", data);
  },
});
```

This API mirrors Devvit's actual realtime API, making the transition to production seamless.

### Why This Approach?

Devvit deployments can be slow to reflect code changes. By mocking the realtime API locally with WebSocket and Redis, we can:

- Iterate quickly on multiplayer features
- Test game logic without deploying
- Maintain the same API surface as production
- Easily swap mock implementations for real Devvit imports when ready

See [REALTIME_MOCK.md](./REALTIME_MOCK.md) for detailed API documentation.

## Roadmap

### Current Focus: Multiplayer

The game is being converted to support multiplayer using Redis pub/sub and Devvit's realtime API:

- [ ] Synchronize player positions across clients
- [ ] Broadcast block place/destroy events
- [ ] Handle player join/leave events
- [ ] Implement game state synchronization
- [ ] Add player avatars and nameplates

### Future Enhancements

- Water generation
- Performance optimizations
- Devvit-specific features (Reddit integration, karma rewards, etc.)
- Mobile controls optimization

## Tech Stack

- **Client**: Three.js, TypeScript, Vite
- **Server (Mock)**: Express, WebSocket (ws), Redis
- **Target Platform**: Reddit Devvit
- **Build Tool**: Vite

## Development Notes

- The client code in `src/client/` will eventually run in Devvit's webview
- The server code in `src/server/` is for local development only
- When deploying to Devvit, replace mock realtime imports with `@devvit/web/client` and `@devvit/web/server`
- Redis is used locally to simulate Devvit's realtime pub/sub infrastructure
