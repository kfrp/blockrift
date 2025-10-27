---
inclusion: always
---

# Project Structure

## Directory Organization

```
src/
├── client/              # Three.js game client (browser)
│   ├── assets/          # Textures, sounds, music, fonts
│   ├── terrain/         # Terrain generation system
│   │   ├── index.ts     # Chunk management
│   │   ├── noise.ts     # Perlin noise generation
│   │   └── worker.ts    # Web worker for terrain gen
│   ├── mesh/            # 3D geometry and materials
│   │   ├── block.ts     # Block mesh generation
│   │   └── materials.ts # Three.js materials
│   ├── ui/              # Game UI components
│   │   ├── index.ts     # UI manager
│   │   ├── bag.ts       # Inventory/hotbar
│   │   ├── audio.ts     # Sound management
│   │   └── joystick.ts  # Mobile controls
│   ├── main.ts          # Entry point
│   ├── core.ts          # Game loop and rendering
│   ├── player.ts        # Player entity and physics
│   ├── control.ts       # Input handling
│   ├── multiplayer.ts   # Multiplayer synchronization
│   ├── realtime.ts      # Mock Devvit realtime client API
│   └── chunkStateManager.ts  # Chunk state synchronization
│
└── server/              # Mock Express server (local dev only)
    ├── index.ts         # WebSocket + Redis server
    ├── server-utils.ts  # Server utilities
    └── test-connection.ts  # Connection testing
```

## Key Architectural Patterns

### Client-Server Communication

The project follows Devvit's realtime API constraints:

- **Client → Server**: HTTP POST requests only
- **Server → Client**: WebSocket broadcasts only (read-only for client)

### Regional Channel System

Multiplayer uses a regional channel system for efficient broadcasting:

- World divided into regions (15 chunks per region)
- Players subscribe to channels based on their position
- Format: `region:{level}:{regionX}:{regionZ}`
- Automatic subscription management as players move

### Mock vs Production

- `src/server/` contains mock implementations for local development
- Mock server will NOT be deployed to production
- Client code uses mock realtime API that mirrors Devvit's actual API
- When deploying, swap mock imports with `@devvit/web/client` and `@devvit/web/server`

## File Naming Conventions

- Test files: `*.test.ts` (co-located with source files)
- Type definitions: `*.d.ts`
- Configuration: `*.config.ts`
- Vite environment types: `vite-env.d.ts`

## Build Outputs

- `dist/` - Root level build output
- `src/client/dist/` - Client build output
- Build artifacts are gitignored
