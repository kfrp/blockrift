---
inclusion: always
---

# Tech Stack

## Core Technologies

- **Language**: TypeScript
- **Build Tool**: Vite
- **Testing**: Vitest
- **Client Framework**: Three.js (3D rendering)
- **Server Framework**: Express (mock server for local dev)
- **Real-time Communication**: WebSocket (ws library)
- **Data Store**: Redis (pub/sub and persistence)

## Key Dependencies

- `three` - 3D graphics library
- `express` - HTTP server
- `ws` - WebSocket implementation
- `redis` - Redis client
- `concurrently` - Run multiple commands simultaneously

## Build System

The project uses TypeScript project references with separate configurations for client and server:

- Root `tsconfig.json` references both `src/client` and `src/server`
- Each subdirectory has its own `tsconfig.json` and `vite.config.ts`

## Common Commands

```bash
# Development (runs both client and server)
npm run dev

# Development (separate terminals)
npm run dev:client    # Starts Vite dev server on port 5173
npm run dev:server    # Starts Express server with tsx

# Building
npm run build         # Builds both client and server
npm run build:client  # Builds client only
npm run build:server  # Builds server only

# Testing
npm run test          # Run tests once
npm run test:watch    # Run tests in watch mode
npm run test:ui       # Run tests with UI

# Type Checking
npm run lint          # TypeScript type checking (tsc --noEmit)

# Preview
npm run preview       # Preview production build on port 8080
```

## Prerequisites

- Node.js v18+
- Redis running locally on port 6379 (for local development)

## Testing Setup

Vitest is configured to:

- Use Node environment
- Include all `*.test.ts` files in `src/`
- Support globals
- Generate coverage reports (v8 provider)
