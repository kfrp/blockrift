# Requirements Document

## Introduction

This document outlines the requirements for refactoring the voxel game server architecture to support both local development (mock server) and production deployment (Reddit/Devvit server). The refactoring will extract shared endpoint logic into reusable modules while maintaining environment-specific implementations for authentication, data access, and real-time communication.

## Glossary

- **Mock Server**: Local development server using Express, WebSocket (ws library), and Redis for testing
- **Reddit Server**: Production server using Devvit's platform APIs, including context-based authentication and Devvit's realtime API
- **Endpoint Handler**: Reusable function that processes HTTP requests and returns responses
- **Redis Client**: Interface for accessing Redis database operations (get, set, hSet, etc.)
- **Realtime Interface**: Interface for sending real-time messages to channels (WebSocket or Devvit pub/sub)
- **Context**: Devvit-provided request context containing authenticated user information and post metadata
- **Level**: Game world identifier (in mock: query parameter or "default"; in Reddit: postId from context)
- **Username**: Player identifier (in mock: localStorage or generated; in Reddit: from context.userId)

## Requirements

### Requirement 1: Dual Server Support

**User Story:** As a developer, I want to run the game locally for rapid development and deploy to Reddit for production, so that I can iterate quickly while maintaining production compatibility.

#### Acceptance Criteria

1. WHEN the application runs in development mode, THE Mock Server SHALL use Express HTTP endpoints and WebSocket connections for real-time communication
2. WHEN the application runs in production mode, THE Reddit Server SHALL use Devvit's HTTP handlers and realtime API for real-time communication
3. WHEN either server processes requests, THE Endpoint Handlers SHALL execute identical business logic regardless of environment
4. WHERE shared functionality exists, THE System SHALL use common endpoint handler modules for both server implementations
5. WHILE maintaining dual server support, THE System SHALL ensure zero code duplication in business logic

---

### Requirement 2: Shared Endpoint Logic Extraction

**User Story:** As a developer, I want endpoint business logic separated from server-specific code, so that I can maintain consistency across environments and reduce code duplication.

#### Acceptance Criteria

1. THE System SHALL create a `src/server/endpoints` directory containing all shared endpoint handler functions
2. WHEN an endpoint handler executes, THE System SHALL receive username and level as explicit parameters rather than extracting them from environment-specific sources
3. THE System SHALL define global `redis` and `realtime` variables that endpoint handlers use for data access and broadcasting
4. WHEN the Mock Server initializes, THE System SHALL set global `redis` to the Redis client instance and `realtime` to the mock realtime interface
5. WHEN the Reddit Server initializes, THE System SHALL set global `redis` to Devvit's redis instance and `realtime` to Devvit's realtime interface
6. THE System SHALL extract all endpoint handlers from `src/server/mock/index.ts` into separate modules in `src/server/endpoints`
7. WHERE type definitions are shared, THE System SHALL create a `src/server/types.ts` file containing all shared interfaces and types

---

### Requirement 3: Mock Server Username and Level Handling

**User Story:** As a developer testing locally, I want the mock server to generate or accept usernames from localStorage and use query parameters for level selection, so that I can simulate multiple players and worlds.

#### Acceptance Criteria

1. WHEN a client connects to the Mock Server without a username query parameter, THE Mock Server SHALL generate a random username in the format `Player{randomNumber}`
2. WHEN a client connects to the Mock Server with a username query parameter, THE Mock Server SHALL use the provided username from localStorage
3. WHEN a client connects to the Mock Server without a level parameter, THE Mock Server SHALL use "default" as the level identifier
4. WHEN a client connects to the Mock Server with a level parameter, THE Mock Server SHALL use the provided level identifier
5. THE Mock Server SHALL pass the determined username and level to endpoint handlers as explicit parameters

---

### Requirement 4: Reddit Server Context-Based Authentication

**User Story:** As a Reddit user, I want the game to automatically use my Reddit identity, so that I don't need to manually authenticate or create a separate account.

#### Acceptance Criteria

1. WHEN a client connects to the Reddit Server, THE Reddit Server SHALL extract the username from `context.userId` provided by Devvit
2. WHEN a client connects to the Reddit Server, THE Reddit Server SHALL extract the level from `context.postId` provided by Devvit
3. IF the terrain seeds for the extracted postId do not exist in Redis, THEN THE Reddit Server SHALL query the database for `terrain:seeds:default` and use those seeds
4. IF the default terrain seeds do not exist, THEN THE Reddit Server SHALL initialize new terrain seeds for the "default" level
5. THE Reddit Server SHALL pass the extracted username and level to endpoint handlers as explicit parameters

---

### Requirement 5: Global Redis and Realtime Interfaces

**User Story:** As a developer, I want endpoint handlers to use global redis and realtime interfaces, so that the same code works in both mock and production environments.

#### Acceptance Criteria

1. THE System SHALL declare global variables `redis` and `realtime` accessible to all endpoint handler modules
2. WHEN the Mock Server initializes, THE System SHALL assign the Redis client instance to the global `redis` variable
3. WHEN the Mock Server initializes, THE System SHALL assign the mock realtime interface to the global `realtime` variable
4. WHEN the Reddit Server initializes, THE System SHALL assign Devvit's redis instance to the global `redis` variable
5. WHEN the Reddit Server initializes, THE System SHALL assign Devvit's realtime interface to the global `realtime` variable
6. THE Endpoint Handlers SHALL use the global `redis` variable for all database operations
7. THE Endpoint Handlers SHALL use the global `realtime` variable for all real-time broadcasts

---

### Requirement 6: Endpoint Handler Module Structure

**User Story:** As a developer, I want endpoint handlers organized by functionality, so that I can easily locate and maintain specific features.

#### Acceptance Criteria

1. THE System SHALL create `src/server/endpoints/connect.ts` containing the connection endpoint handler
2. THE System SHALL create `src/server/endpoints/disconnect.ts` containing the disconnect endpoint handler
3. THE System SHALL create `src/server/endpoints/position.ts` containing the position update endpoint handler
4. THE System SHALL create `src/server/endpoints/modifications.ts` containing the block modification batch endpoint handler
5. THE System SHALL create `src/server/endpoints/chunk-state.ts` containing the chunk state request endpoint handler
6. THE System SHALL create `src/server/endpoints/friends.ts` containing the friend add/remove endpoint handlers
7. THE System SHALL create `src/server/endpoints/upvote.ts` containing the upvote endpoint handler
8. WHERE helper functions are shared across multiple endpoints, THE System SHALL create `src/server/endpoints/helpers.ts` containing utility functions

---

### Requirement 7: Type Safety and Shared Interfaces

**User Story:** As a developer, I want consistent type definitions across both server implementations, so that I can catch type errors at compile time and maintain API consistency.

#### Acceptance Criteria

1. THE System SHALL create `src/server/types.ts` containing all shared type definitions
2. THE System SHALL define request and response interfaces for all endpoints in the types file
3. THE System SHALL define data structure interfaces (PlayerData, Position, Rotation, Block, etc.) in the types file
4. THE System SHALL define broadcast message interfaces (BlockModificationBroadcast, PositionUpdatesBroadcast, etc.) in the types file
5. WHEN endpoint handlers are implemented, THE System SHALL use the shared type definitions for type safety
6. THE Mock Server SHALL import and use the shared type definitions
7. THE Reddit Server SHALL import and use the shared type definitions

---

### Requirement 8: Mock Server WebSocket Management

**User Story:** As a developer testing locally, I want the mock server to handle WebSocket connections for real-time updates, so that I can test multiplayer functionality.

#### Acceptance Criteria

1. THE Mock Server SHALL maintain WebSocket connection handling in `src/server/mock/index.ts`
2. THE Mock Server SHALL manage channel subscriptions and Redis pub/sub integration
3. THE Mock Server SHALL broadcast position updates 10 times per second using the global `realtime` interface
4. THE Mock Server SHALL clean up inactive players every 10 seconds
5. THE Mock Server SHALL handle WebSocket disconnections and unsubscribe from channels

---

### Requirement 9: Reddit Server Realtime Integration

**User Story:** As a Reddit user, I want real-time updates to work seamlessly within Reddit's platform, so that I can see other players' actions immediately.

#### Acceptance Criteria

1. THE Reddit Server SHALL use Devvit's realtime API for broadcasting messages to channels
2. WHEN the Reddit Server broadcasts a message, THE System SHALL call `realtime.send(channel, data)` using Devvit's realtime interface
3. THE Reddit Server SHALL NOT manage WebSocket connections directly (handled by Devvit platform)
4. THE Reddit Server SHALL use the same channel naming conventions as the Mock Server (e.g., `region:{level}:{regionX}:{regionZ}`)
5. THE Reddit Server SHALL broadcast position updates and block modifications using the global `realtime` interface

---

### Requirement 10: Backward Compatibility

**User Story:** As a developer, I want existing client code to work without modifications, so that I don't need to update the client when refactoring the server.

#### Acceptance Criteria

1. THE System SHALL maintain all existing endpoint paths (e.g., `/api/connect`, `/api/modifications`)
2. THE System SHALL maintain all existing request and response formats
3. THE System SHALL maintain all existing broadcast message formats
4. THE System SHALL maintain all existing Redis key patterns and data structures
5. WHEN clients connect to either server, THE System SHALL provide identical API behavior

---

### Requirement 11: Error Handling Consistency

**User Story:** As a developer, I want consistent error handling across both server implementations, so that I can debug issues easily and provide clear error messages to users.

#### Acceptance Criteria

1. WHEN an endpoint handler encounters an error, THE System SHALL return a consistent error response format with `ok: false` and a descriptive `message` field
2. WHEN Redis operations fail, THE System SHALL log the error with sufficient context for debugging
3. WHEN validation fails, THE System SHALL return HTTP 400 status with a clear error message
4. WHEN a resource is not found, THE System SHALL return HTTP 404 status with a clear error message
5. WHEN an internal error occurs, THE System SHALL return HTTP 500 status and log the full error details

---

### Requirement 12: Development Workflow Preservation

**User Story:** As a developer, I want to continue using `npm run dev` for local testing, so that my development workflow remains unchanged.

#### Acceptance Criteria

1. THE Mock Server SHALL start on port 3000 when running `npm run dev`
2. THE Mock Server SHALL initialize Redis connections on startup
3. THE Mock Server SHALL log all endpoint requests for debugging
4. THE Mock Server SHALL support CORS for local client development
5. THE Mock Server SHALL provide a `/health` endpoint for monitoring

---

### Requirement 13: Production Deployment Compatibility

**User Story:** As a developer, I want to deploy to Reddit using `npm run launch`, so that I can publish the game to production.

#### Acceptance Criteria

1. THE Reddit Server SHALL use Devvit's `createServer` function to initialize the Express app
2. THE Reddit Server SHALL use Devvit's `getServerPort` function to determine the listening port
3. THE Reddit Server SHALL access Redis through Devvit's `redis` instance
4. THE Reddit Server SHALL access the realtime API through Devvit's `realtime` instance
5. THE Reddit Server SHALL extract user context from Devvit's `context` object
