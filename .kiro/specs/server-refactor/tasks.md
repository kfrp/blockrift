# Implementation Plan

- [x] 1. Create shared type definitions and global declarations

  - Create `src/server/types.ts` with all shared interfaces (request/response types, data structures, broadcast messages)
  - Create `src/server/globals.ts` with global redis and realtime variable declarations and setter functions
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 5.1, 5.2_

- [x] 2. Extract helper functions to shared module

  - Create `src/server/endpoints/helpers.ts`
  - Extract and move all helper functions from mock server (Redis operations, coordinate calculations, player management, friendship broadcasting)
  - Update helper functions to use global `redis` and `realtime` variables
  - _Requirements: 6.8, 5.6, 5.7, 2.3_

- [x] 3. Create connect endpoint handler

  - Create `src/server/endpoints/connect.ts`
  - Extract connection logic from mock server `/api/connect` route
  - Implement `handleConnect` function that receives username, level, and connectedClients as parameters
  - Use global redis and realtime for all operations
  - Return InitialConnectionResponse object
  - _Requirements: 6.1, 2.2, 5.6, 5.7_

- [ ] 4. Create disconnect endpoint handler

  - Create `src/server/endpoints/disconnect.ts`
  - Extract disconnect logic from mock server `/api/disconnect` route
  - Implement `handleDisconnect` function that receives username, level, and connectedClients as parameters
  - Save last known position to Redis on disconnect
  - _Requirements: 6.2, 2.2, 5.6, 5.7_

- [x] 5. Create position update endpoint handler

  - Create `src/server/endpoints/position.ts`
  - Extract position update logic from mock server `/api/position` route
  - Implement `handlePositionUpdate` function that receives username, position, rotation, and connectedClients as parameters
  - _Requirements: 6.3, 2.2, 5.6, 5.7_

- [ ] 6. Create modifications endpoint handler

  - Create `src/server/endpoints/modifications.ts`
  - Extract modification batch logic from mock server `/api/modifications` route
  - Implement `handleModifications` function that receives username, level, and modifications array as parameters
  - Include validation, broadcasting, and persistence logic
  - _Requirements: 6.4, 2.2, 5.6, 5.7_

- [x] 7. Create chunk state endpoint handler

  - Create `src/server/endpoints/chunk-state.ts`
  - Extract chunk state logic from mock server `/api/chunk-state` route
  - Implement `handleChunkState` function that receives username, level, and chunks array as parameters
  - Use Redis pipelining for batch fetch
  - _Requirements: 6.5, 2.2, 5.6, 5.7_

- [x] 8. Create friends endpoint handlers

  - Create `src/server/endpoints/friends.ts`
  - Extract friend add/remove logic from mock server `/api/friends/add` and `/api/friends/remove` routes
  - Implement `handleAddFriend` and `handleRemoveFriend` functions
  - Include global friendship hash updates and broadcasting
  - _Requirements: 6.6, 2.2, 5.6, 5.7_

- [x] 9. Create upvote endpoint handler

  - Create `src/server/endpoints/upvote.ts`
  - Extract upvote logic from mock server `/api/upvote` route
  - Implement `handleUpvote` function with fire-and-forget pattern
  - _Requirements: 6.7, 2.2, 5.6, 5.7_

- [x] 10. Refactor mock server to use endpoint handlers

  - Update `src/server/mock/index.ts` to import endpoint handlers
  - Set global redis and realtime variables during initialization
  - Import endpoint path constants from `src/shared/endpoints.ts` and use them for all route definitions
  - Update all routes to extract username/level and call endpoint handlers
  - Remove extracted code (keep WebSocket management and intervals)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.2, 5.3, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 11. Implement Reddit server

  - Create `src/server/reddit/index.ts`
  - Import Devvit modules (createServer, context, redis, realtime, reddit, getServerPort)
  - Set global redis to Devvit's redis instance
  - Set global realtime to Devvit's realtime instance
  - Create Express app with Devvit middleware
  - Import endpoint path constants from `src/shared/endpoints.ts` and use them for all route definitions
  - Implement routes that extract username from context.userId and level from context.postId
  - Implement level fallback logic (use default if postId seeds don't exist)
  - Call endpoint handlers from routes
  - Implement internal endpoints (/internal/on-app-install, /internal/menu/post-create)
  - Create Devvit server and listen on Devvit's port
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.4, 5.5, 9.1, 9.2, 9.3, 9.4, 9.5, 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ]\* 12. Test mock server locally

  - Run mock server with `npm run dev`
  - Test all endpoints with multiple clients
  - Verify WebSocket subscriptions and broadcasts
  - Verify Redis persistence
  - Test multi-device detection (Viewer Mode)
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ]\* 13. Test Reddit server in playtest environment

  - Deploy to Reddit with `npm run launch`
  - Test in Devvit playtest environment
  - Verify context extraction (username, postId)
  - Verify level fallback logic
  - Test all endpoints with Reddit authentication
  - Verify realtime broadcasting
  - Test internal endpoints
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 9.1, 9.2, 9.4, 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ]\* 14. Verify backward compatibility

  - Test existing client code with refactored mock server
  - Verify all endpoint paths unchanged
  - Verify all request/response formats unchanged
  - Verify all broadcast message formats unchanged
  - Verify all Redis key patterns unchanged
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ]\* 15. Update documentation
  - Update README with new server structure
  - Document environment-specific setup (mock vs Reddit)
  - Document global variables pattern
  - Add deployment instructions for Reddit server
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
