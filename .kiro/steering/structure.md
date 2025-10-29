---
inclusion: always
---

# Project Structure

## Technology Stack

### Core Technologies

- **Devvit**: Reddit's developer platform for building apps
- **TypeScript**: Primary language with strict type checking
- **Vite**: Build tool for both client and server bundles
- **Express**: Server-side HTTP framework
- **Three.js**: 3D rendering engine for voxel game
- **Redis**: Data persistence layer (via Devvit)

### Build System

- **Vite** handles compilation for both client and server
- **TypeScript** project references for modular compilation
- **ESLint** with TypeScript rules for code quality
- **Prettier** for consistent code formatting

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
└── server/              # Express server with Devvit integration
    ├── index.ts         # HTTP endpoints + Redis integration
    ├── server-utils.ts  # Server utilities
    └── test-connection.ts  # Connection testing
```

## Common Commands

```bash
# Development (runs client, server, and devvit in parallel)
npm run dev

# Build for production
npm run build

# Deploy to Reddit
npm run deploy

# Publish for review
npm run launch

# Code quality checks
npm run check

# Individual builds
npm run build:client
npm run build:server
```

## Development Workflow

- Use `npm run dev` for live development with hot reloading
- Client builds to `dist/client` with HTML entry point
- Server builds to `dist/server` as CommonJS module
- Devvit playtest provides live Reddit integration testing

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

### Devvit Integration

- Server uses `@devvit/web` SDK for Reddit integration
- Redis access via Devvit's data layer
- Authentication handled automatically by Devvit middleware
- All server endpoints must start with `/api/`

## File Naming Conventions

- Test files: `*.test.ts` (co-located with source files)
- Type definitions: `*.d.ts`
- Configuration: `*.config.ts`, `devvit.json`
- Vite environment types: `vite-env.d.ts`

## Build Outputs

- `dist/client/` - Client bundle with HTML entry point
- `dist/server/` - Server bundle as CommonJS module
- Build artifacts are gitignored

## Dependencies

- **Runtime**: @devvit/web, express, three, ws, redis
- **Development**: TypeScript, ESLint, Prettier, Vite, Vitest
