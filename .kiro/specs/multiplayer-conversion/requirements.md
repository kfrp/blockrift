# Requirements Document

## Introduction

This document outlines the requirements for converting the sandbox Three.js game from a single-player, client-side game into a multiplayer, server-authoritative game using Redis for state management and Devvit's realtime API for synchronization. The conversion will maintain all existing client-side optimizations (chunking, InstancedMesh, procedural generation) while adding multiplayer capabilities including player synchronization, shared world state, and server-side validation.

## Glossary

- **Game Server**: The Express/WebSocket server that manages game state, validates actions, and coordinates between clients
- **Game Client**: The Three.js browser application that renders the game and sends player actions to the Game Server
- **Redis Store**: The Redis database used for persisting world state, player data, and game sessions
- **Realtime Channel**: A WebSocket-based pub/sub channel for broadcasting game events to connected clients
- **World State**: The authoritative collection of all block modifications and terrain data stored on the Game Server
- **Player Entity**: A representation of a connected player including position, rotation, username, and selected block type
- **Block Modification**: Any player action that places or removes a block from the world
- **Chunk System**: The existing client-side terrain generation system that divides the world into 24x24 block sections
- **Custom Blocks Array**: The client-side array tracking player modifications, to be replaced by server-authoritative state
- **Session ID**: A unique identifier for each connected player's game session
- **Username**: A player identifier, randomly generated during development or provided by Devvit context in production

## Requirements

### Requirement 1

**User Story:** As a player, I want to receive a unique username when I connect to the game, so that I can be identified in the multiplayer environment

#### Acceptance Criteria

1. WHEN a Game Client connects to the Game Server, THE Game Server SHALL generate a random username for development environments
2. WHEN a Game Client connects in a production Devvit environment, THE Game Server SHALL retrieve the username from the Devvit context
3. WHEN the Game Server assigns a username, THE Game Server SHALL send the username to the Game Client within 500 milliseconds
4. THE Game Client SHALL store the received username and include it in all subsequent requests to the Game Server
5. THE Game Server SHALL validate that every incoming request contains a valid username

### Requirement 2

**User Story:** As a player, I want the server to manage the authoritative world state, so that all players see a consistent game world

#### Acceptance Criteria

1. THE Game Server SHALL store all Block Modifications in the Redis Store with block position as the key
2. WHEN a Game Client requests world state for a chunk, THE Game Server SHALL retrieve all Block Modifications for that chunk from the Redis Store within 200 milliseconds
3. THE Game Server SHALL maintain the terrain generation seeds in the Redis Store
4. WHEN a new game session starts, THE Game Server SHALL initialize terrain generation seeds if they do not exist in the Redis Store
5. THE Game Client SHALL request world state from the Game Server instead of generating it locally

### Requirement 3

**User Story:** As a player, I want my block placement and removal actions to feel instant, so that the game feels responsive and enjoyable

#### Acceptance Criteria

1. WHEN a Game Client attempts to place or remove a block, THE Game Client SHALL immediately update the local visual representation without waiting for server confirmation
2. WHEN a Game Client performs a Block Modification, THE Game Client SHALL send the block position, block type, username, and timestamp to the Game Server
3. WHEN the Game Server receives a Block Modification, THE Game Server SHALL immediately broadcast the modification to all connected clients via the Realtime Channel
4. AFTER broadcasting the Block Modification, THE Game Server SHALL persist the change to the Redis Store asynchronously
5. THE Game Server SHALL include a server timestamp in all broadcasted Block Modifications for conflict resolution

### Requirement 4

**User Story:** As a player, I want to see other players' positions and movements in real-time, so that I can interact with them in the shared world

#### Acceptance Criteria

1. THE Game Client SHALL send position updates to the Game Server at a rate of 10 updates per second
2. WHEN the Game Server receives a position update, THE Game Server SHALL broadcast the position to all other connected clients on the same Realtime Channel within 50 milliseconds
3. THE Game Client SHALL render other Player Entities at their received positions with interpolation for smooth movement
4. THE Game Client SHALL display a visual representation for each Player Entity including a colored cube and username label
5. WHEN a player disconnects, THE Game Server SHALL broadcast a player-left event and THE Game Client SHALL remove that Player Entity from the scene

### Requirement 5

**User Story:** As a player, I want to see which player placed or removed each block, so that I can understand who is building what in the shared world

#### Acceptance Criteria

1. THE Block class SHALL include a username field to track which player modified the block
2. WHEN a Block Modification is stored in the Redis Store, THE Game Server SHALL include the username of the player who performed the action
3. WHERE a player hovers over a block, THE Game Client SHALL display the username of the player who placed that block
4. THE Game Server SHALL track both block placement and block removal events with associated usernames
5. THE Game Client SHALL receive username information with all Block Modifications from the Game Server

### Requirement 6

**User Story:** As a player, I want the game to handle conflicting block modifications correctly, so that the world state remains consistent across all clients

#### Acceptance Criteria

1. WHEN the Game Client receives a Block Modification from the Realtime Channel, THE Game Client SHALL check if the same position was modified locally
2. IF a local Block Modification has a timestamp earlier than the received modification, THEN THE Game Client SHALL override the local change with the received state
3. IF two Block Modifications occur at the same position within 100 milliseconds, THE Game Server SHALL resolve the conflict using the earliest server timestamp
4. THE Game Client SHALL ignore Block Modifications that it originated to prevent duplicate processing
5. WHEN the Game Server detects a conflict, THE Game Server SHALL log the conflict details for monitoring purposes

### Requirement 11

**User Story:** As a player, I want the game to synchronize efficiently, so that I experience smooth gameplay without lag

#### Acceptance Criteria

1. THE Game Server SHALL broadcast Block Modifications immediately without batching to minimize perceived latency
2. THE Game Server SHALL batch Player Entity position updates and broadcast them at a rate of 10 updates per second
3. THE Realtime Channel SHALL use structured JSON data for all messages as required by the Devvit realtime API
4. THE Game Server SHALL round position coordinates to 2 decimal places to reduce message size
5. THE Game Server SHALL broadcast events to clients with minimal processing overhead to ensure low latency

### Requirement 7

**User Story:** As a player, I want to join an existing game session and see the current world state, so that I can participate in ongoing multiplayer games

#### Acceptance Criteria

1. WHEN a Game Client connects, THE Game Server SHALL send the current World State for the player's initial chunk location
2. THE Game Server SHALL send a list of all currently connected Player Entities with their positions and usernames
3. THE Game Server SHALL broadcast a player-joined event to all existing clients with the new player's username and position
4. THE Game Client SHALL render all existing Player Entities within 2 seconds of connection
5. THE Game Client SHALL apply all received Block Modifications to the local terrain representation

### Requirement 8

**User Story:** As a developer, I want the client-side optimizations to remain intact, so that the game maintains its performance characteristics

#### Acceptance Criteria

1. THE Game Client SHALL continue using the Chunk System for terrain generation and rendering
2. THE Game Client SHALL continue using InstancedMesh for all block rendering
3. THE Game Client SHALL continue using Web Workers for procedural terrain generation
4. THE Game Server SHALL provide terrain generation seeds to the Game Client for local procedural generation
5. THE Game Client SHALL only request Block Modifications from the Game Server, not entire chunk geometry

### Requirement 9

**User Story:** As a player, I want the game to handle network disconnections gracefully, so that temporary connection issues don't ruin my experience

#### Acceptance Criteria

1. WHEN the Game Client loses connection to the Game Server, THE Game Client SHALL display a "Reconnecting" message
2. THE Game Client SHALL attempt to reconnect to the Game Server with exponential backoff up to 5 attempts
3. WHEN the Game Client reconnects, THE Game Server SHALL send the current World State for the player's chunk location
4. THE Game Client SHALL queue Block Modifications locally during disconnection and send them to the Game Server for validation upon reconnection
5. WHEN the Game Server receives queued Block Modifications after reconnection, THE Game Server SHALL validate each modification against the current World State before applying it
6. IF reconnection fails after 5 attempts, THEN THE Game Client SHALL display an error message and offer a manual reconnect option

### Requirement 10

**User Story:** As a developer, I want to understand the potential race conditions in the optimistic update approach, so that I can monitor for issues in production

#### Acceptance Criteria

1. THE system documentation SHALL describe the race condition where two players modify the same block simultaneously
2. THE system documentation SHALL describe the race condition where Redis persistence fails after broadcast
3. THE system documentation SHALL describe the scenario where a player receives their own modification via broadcast before local update completes
4. THE Game Server SHALL implement timestamp-based conflict resolution to handle simultaneous modifications
5. THE Game Server SHALL implement retry logic for Redis persistence failures with exponential backoff up to 3 attempts

### Requirement 12

**User Story:** As a developer, I want clear separation between development and production environments, so that I can test locally before deploying to Devvit

#### Acceptance Criteria

1. THE Game Server SHALL detect whether it is running in development or production mode based on environment variables
2. WHERE the environment is development, THE Game Server SHALL generate random usernames for connecting clients
3. WHERE the environment is production, THE Game Server SHALL retrieve usernames from the Devvit context
4. THE Game Client SHALL connect to localhost WebSocket in development and Devvit realtime API in production
5. THE codebase SHALL use the same API interface for both mock and production realtime implementations
