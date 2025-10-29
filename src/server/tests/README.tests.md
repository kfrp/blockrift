# Server Infrastructure Tests

This directory contains comprehensive tests for the multiplayer server infrastructure.

## Test Files

### `server.test.ts` - Unit Tests

Tests core server utility functions without requiring a running server:

- **Username Generation** (3 tests)

  - Generates unique usernames
  - Follows correct format (Player####)
  - Numbers are within valid range (0-9999)

- **Chunk Coordinate Calculation** (5 tests)

  - Positive positions
  - Origin (0,0)
  - Negative positions
  - Chunk boundaries
  - Large coordinates

- **Redis Block Storage Operations** (5 tests)

  - HSET/HGET for storing and retrieving blocks
  - Multiple blocks in same chunk
  - HDEL for removing blocks
  - HGETALL for retrieving all blocks in a chunk
  - Empty chunk handling

- **Terrain Seed Management** (4 tests)
  - Initialize seeds if they don't exist
  - Retrieve existing seeds
  - Don't overwrite existing seeds
  - Generate valid random seeds

### `connection.test.ts` - Integration Tests

Tests the full connection handshake flow (requires running server):

- **Connection Handshake Flow** (4 tests)
  - Complete connection handshake with ConnectedMessage
  - Player-joined broadcast reception
  - Unique username assignment to multiple clients
  - Terrain seeds retrieval from Redis

## Running Tests

### All Tests

```bash
npm test
```

### Unit Tests Only (no server required)

```bash
npm test -- src/server/server.test.ts
```

### Integration Tests (requires server)

```bash
# Terminal 1: Start the server
npm run dev:server

# Terminal 2: Run integration tests
npm test -- src/server/connection.test.ts
```

### Watch Mode

```bash
npm run test:watch
```

### UI Mode

```bash
npm run test:ui
```

## Requirements Coverage

These tests cover the following requirements from the spec:

- **Requirement 1.1**: Username generation for development
- **Requirement 2.1**: Chunk-based block storage in Redis
- **Requirement 2.2**: World state retrieval from Redis
- **Requirement 2.3**: Terrain seed initialization
- **Requirement 2.4**: Terrain seed retrieval
- **Connection handshake flow**: Username assignment, terrain seeds, world state delivery

## Test Results

All 21 tests pass successfully:

- 17 unit tests (server.test.ts)
- 4 integration tests (connection.test.ts)

## Notes

- Unit tests use Redis and will flush the test database before each test
- Integration tests require the server to be running on `localhost:3000`
- Tests use a 10-second timeout for WebSocket operations
- All tests follow the MINIMAL testing approach focusing on core functionality
