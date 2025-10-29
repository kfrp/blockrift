# Requirements Document

## Introduction

This document outlines the requirements for implementing robust chunk-based state synchronization in the multiplayer sandbox game. The system must ensure that all clients have consistent world state by loading existing block modifications from Redis when they connect or move to new areas, while maintaining real-time synchronization for new changes through regional pub/sub channels. Block modifications are sent via HTTP fetch (with debouncing and batching), validated server-side, broadcast via regional channels, and persisted to Redis. Offline changes are stored in localStorage and validated on reconnect.

## Glossary

- **Chunk State**: The collection of all block modifications (placements and removals) within a specific chunk, stored in Redis and synchronized to clients
- **Chunk Coordinates**: Integer coordinates (chunkX, chunkZ) identifying a chunk, calculated by dividing world position by chunk size (24 blocks)
- **Region**: A 5x5 chunk area used for pub/sub channel grouping, reducing the number of subscriptions needed
- **Region Coordinates**: Integer coordinates (regionX, regionZ) identifying a region, calculated by dividing chunk coordinates by 5
- **Draw Distance**: The radius in chunks that the client renders around the player (currently 3 chunks)
- **State Buffer**: The area of chunks loaded by the client, set to 2x draw distance to ensure smooth experience when player moves
- **Modification Batch**: An array of block modifications sent together via HTTP fetch, each with individual timestamps
- **Debounce Interval**: The time period (default 1 second, configurable) during which block modifications are collected before sending to server
- **Offline Changes**: Block modifications stored in localStorage when client cannot reach server, validated on reconnect
- **Validation Index**: The index in a modification batch where validation failed, returned by server to indicate which changes were rejected
- **Chunk State Manager**: Client-side component that tracks loaded chunks, manages subscriptions, and handles modification batching
- **Regional Channel**: A pub/sub channel for a specific region, used to broadcast block modifications only to clients in that area
- **Spawn Position**: The fixed starting position where players appear when joining (currently x=0, y=20, z=0)

## Requirements

### Requirement 1

**User Story:** As a player, I want to see all blocks that other players have placed before I joined, so that I experience a consistent shared world

#### Acceptance Criteria

1. WHEN a Game Client connects to the Game Server, THE Game Server SHALL send all block modifications for chunks within the state buffer around the spawn position
2. THE Game Server SHALL send chunk state data within 500 milliseconds of the connection request
3. THE Game Client SHALL populate the customBlocks array with received block modifications before generating terrain
4. THE Game Client SHALL apply received block modifications in timestamp order to ensure correct final state
5. WHEN the Game Client generates terrain, THE terrain generation SHALL incorporate all loaded block modifications from the customBlocks array

### Requirement 2

**User Story:** As a player, I want blocks to load smoothly as I explore the world, so that I don't experience jarring pop-in or missing blocks

#### Acceptance Criteria

1. THE Game Client SHALL maintain a state buffer of 2x draw distance in all directions around the player
2. WHEN the player moves to a new chunk, THE Game Client SHALL calculate which chunks are now outside the state buffer
3. WHEN new chunks enter the state buffer, THE Game Client SHALL request their state from the Game Server within 100 milliseconds
4. THE Game Server SHALL respond to chunk state requests within 200 milliseconds
5. THE Game Client SHALL not request chunk state for chunks that are already loaded

### Requirement 3

**User Story:** As a developer, I want chunk state stored efficiently in Redis, so that the system scales to large worlds with many modifications

#### Acceptance Criteria

1. THE Game Server SHALL store block modifications in Redis using the key pattern `level:${level}:chunk:${chunkX}:${chunkZ}`
2. THE Game Server SHALL use Redis Hash data structure to store blocks within each chunk, keyed by `block:${x}:${y}:${z}`
3. WHEN a block is placed, THE Game Server SHALL add an entry to the appropriate chunk hash with block type, username, and timestamp
4. WHEN a block is removed, THE Game Server SHALL delete the entry from the chunk hash
5. THE Game Server SHALL retrieve all blocks for a chunk using a single HGETALL operation with O(N) complexity where N is blocks in that chunk

### Requirement 4

**User Story:** As a player, I want my block modifications to be sent efficiently without flooding the server, so that the game performs well even when building quickly

#### Acceptance Criteria

1. THE Game Client SHALL collect block modifications in a local batch array instead of sending each modification immediately
2. THE Game Client SHALL send the modification batch via HTTP fetch at a configurable interval (default 1 second)
3. THE modification batch SHALL include individual timestamps for each modification to preserve ordering
4. THE Game Client SHALL only send a batch if it contains at least one modification
5. THE Game Client SHALL continue collecting modifications while a batch is being sent

### Requirement 5

**User Story:** As a player, I want my changes to persist even if I lose connection, so that I don't lose my work

#### Acceptance Criteria

1. WHEN the Game Client cannot reach the Game Server, THE Game Client SHALL store block modifications in localStorage
2. THE Game Client SHALL append new modifications to the localStorage array with timestamps
3. WHEN the Game Client reconnects, THE Game Client SHALL send all localStorage modifications to the Game Server for validation
4. THE Game Server SHALL validate each modification in the array sequentially and return the index where validation failed (if any)
5. THE Game Client SHALL clear localStorage modifications up to the validation failure index

### Requirement 6

**User Story:** As a developer, I want the server to validate all block modifications, so that the game state remains consistent and prevents cheating

#### Acceptance Criteria

1. WHEN the Game Server receives a modification batch, THE Game Server SHALL validate each modification sequentially
2. THE Game Server SHALL check that the block position is within valid world bounds
3. THE Game Server SHALL check that block placements don't overlap existing blocks (using current Redis state)
4. THE Game Server SHALL check that block removals target existing blocks
5. IF validation fails for any modification, THE Game Server SHALL return the failure index and stop processing remaining modifications in that batch

### Requirement 7

**User Story:** As a player, I want to only receive block updates relevant to my location, so that the game doesn't waste bandwidth on distant changes

#### Acceptance Criteria

1. THE Game Server SHALL divide the world into regions of 5x5 chunks each
2. THE Game Client SHALL subscribe to regional pub/sub channels for all regions within the state buffer
3. WHEN the player moves to a new area, THE Game Client SHALL subscribe to new regional channels and unsubscribe from distant ones
4. THE Game Server SHALL broadcast block modifications only to the regional channel containing the modified block
5. THE Game Client SHALL only receive block modifications for regions it is subscribed to

### Requirement 8

**User Story:** As a developer, I want clear separation between state loading and real-time updates, so that the system is maintainable and debuggable

#### Acceptance Criteria

1. THE Game Client SHALL implement a Chunk State Manager component responsible for tracking loaded chunks and managing subscriptions
2. THE Chunk State Manager SHALL maintain a Map of loaded chunk coordinates to their block arrays
3. THE Chunk State Manager SHALL maintain a Set of subscribed regional channels
4. THE Chunk State Manager SHALL expose methods for requesting chunks, checking if chunks are loaded, and managing subscriptions
5. THE Game Client SHALL log all chunk state requests, subscription changes, and modification batches for debugging purposes

### Requirement 9

**User Story:** As a player, I want the server to broadcast my changes quickly after validation, so that other players see my builds in real-time

#### Acceptance Criteria

1. WHEN the Game Server validates a block modification successfully, THE Game Server SHALL immediately broadcast it to the appropriate regional channel
2. THE Game Server SHALL include the server timestamp in the broadcast for conflict resolution
3. THE Game Server SHALL persist the modification to Redis asynchronously after broadcasting
4. THE Game Server SHALL use Redis pipelining to persist multiple modifications from a batch efficiently
5. THE Game Server SHALL only broadcast modifications that pass validation

### Requirement 10

**User Story:** As a player, I want the initial connection to be fast, so that I can start playing quickly

#### Acceptance Criteria

1. THE Game Server SHALL send terrain seeds and initial chunk states in a single response message
2. THE Game Server SHALL limit initial state load to chunks within 2x draw distance (maximum 169 chunks for draw distance 3)
3. THE Game Server SHALL use Redis pipelining to fetch multiple chunks in parallel
4. THE initial state load SHALL complete within 1 second for a typical world with moderate modifications
5. THE Game Client SHALL display a loading indicator while initial state is being loaded and applied

### Requirement 11

**User Story:** As a developer, I want to handle edge cases gracefully, so that the system is robust

#### Acceptance Criteria

1. WHEN the Game Server receives a chunk state request for a chunk with no modifications, THE Game Server SHALL return an empty block array
2. WHEN the Game Client receives a block modification broadcast for an unloaded chunk, THE Game Client SHALL ignore it
3. IF a chunk state request fails, THE Game Client SHALL retry up to 3 times with exponential backoff
4. IF a modification batch send fails, THE Game Client SHALL store the batch in localStorage for retry on reconnect
5. THE Game Server SHALL validate chunk coordinates are within reasonable bounds (±10000 chunks) before querying Redis

### Requirement 12

**User Story:** As a developer, I want comprehensive logging and monitoring, so that I can debug state synchronization issues

#### Acceptance Criteria

1. THE Game Client SHALL log when chunks are requested, loaded, and unloaded
2. THE Game Client SHALL log when regional channels are subscribed and unsubscribed
3. THE Game Client SHALL log modification batches being sent with batch size and timestamp range
4. THE Game Server SHALL log modification batch validation results with success count and failure index
5. THE Game Server SHALL log Redis query performance for chunk state retrieval and persistence

### Requirement 13

**User Story:** As a player, I want the system to handle my movement efficiently, so that I don't experience lag or stuttering

#### Acceptance Criteria

1. THE Game Client SHALL batch chunk state requests when multiple chunks need loading simultaneously
2. THE Game Client SHALL prioritize chunk requests based on distance from player (closest first)
3. THE Game Client SHALL limit concurrent chunk state requests to 5 at a time to avoid overwhelming the server
4. THE Game Client SHALL debounce chunk loading when player is moving rapidly (wait 200ms after movement stops)
5. THE Game Client SHALL unload chunks that are more than 3x draw distance away to free memory

### Requirement 14

**User Story:** As a player, I want my optimistic UI updates to feel instant, so that building feels responsive

#### Acceptance Criteria

1. WHEN the Game Client places or removes a block, THE Game Client SHALL immediately update the local visual representation
2. THE Game Client SHALL add the modification to the pending batch array with client timestamp
3. THE Game Client SHALL add the modification to customBlocks array immediately
4. THE Game Client SHALL not wait for server confirmation before showing the change
5. IF the server rejects a modification, THE Game Client SHALL receive the rejection via the validation response and revert the change

### Requirement 15

**User Story:** As a developer, I want the modification batch system to be configurable, so that I can tune performance for different scenarios

#### Acceptance Criteria

1. THE debounce interval SHALL be configurable via a constant (default 1000ms)
2. THE maximum batch size SHALL be configurable via a constant (default 100 modifications)
3. IF the batch reaches maximum size before the debounce interval, THE Game Client SHALL send it immediately
4. THE Game Client SHALL expose a method to flush the current batch immediately (for testing or manual triggers)
5. THE configuration constants SHALL be documented with recommended ranges
