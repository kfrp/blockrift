# Implementation Plan

- [x] 1. Add HTML structure for loading components

  - Add loading screen overlay HTML to index.html
  - Add connection loading bar HTML to index.html (inside .menu container)
  - Add connection error modal HTML to index.html
  - Add authentication error modal HTML to index.html
  - Position new elements in appropriate locations in the DOM
  - _Requirements: 1.1, 2.1, 3.1, 4.1_

- [x] 2. Add CSS styling for loading components

  - Add .loading-screen styles with retro aesthetic
  - Add .loading-spinner animation styles with bouncing blocks
  - Add .connection-loading-bar styles matching button width (200px)
  - Add .loading-bar-fill animation with pulsing effect
  - Add .error-modal styles with retro borders and colors
  - Ensure all styles follow existing CSS patterns (borders, box-shadows, colors)
  - _Requirements: 1.4, 2.4, 2.5, 3.2, 4.2_

- [x] 3. Create AssetLoader class

  - Create new file src/client/assetLoader.ts
  - Implement loadAssets() method to load all required assets in parallel
  - Implement loadImage() method for image preloading
  - Implement loadFont() method using FontFace API
  - Add retry logic for failed asset loads (up to 3 attempts)
  - Export AssetLoader class
  - _Requirements: 1.3, 6.1_

-

- [x] 4. Create LoadingManager class

  - [x] 4.1 Create LoadingManager file and basic structure

    - Create new file src/client/loadingManager.ts
    - Define LoadingState enum (LOADING_ASSETS, CONNECTING, CONNECTED, ERROR_CONNECTION, ERROR_AUTH)
    - Create LoadingManager class with state property
    - Add DOM element references as private properties
    - _Requirements: 6.1, 6.4_

  - [x] 4.2 Implement initialization methods

    - Implement constructor to initialize AssetLoader
    - Implement initializeElements() to query all DOM elements
    - Implement setupEventListeners() for retry and close buttons
    - Add getLevel() helper method to extract level from URL params
    - _Requirements: 3.3, 4.3, 6.1_

  - [x] 4.3 Implement state management

    - Implement setState() method to update current state
    - Implement updateUI() method to show/hide elements based on state
    - Handle all five states in updateUI() switch statement
    - Ensure smooth transitions between states
    - _Requirements: 1.2, 2.1, 2.2, 5.1, 5.3, 6.1_

  - [x] 4.4 Implement connection logic

    - Implement connectToServer() method with fetch to /api/connect
    - Add timeout handling (10 second timeout using AbortController)
    - Check for username in response and handle missing username
    - Handle network errors and set appropriate error states
    - _Requirements: 3.1, 4.1, 6.5_

  - [x] 4.5 Implement main start method

    - Implement start() method to orchestrate loading flow
    - Call assetLoader.loadAssets() in LOADING_ASSETS state
    - Transition to CONNECTING state after assets load
    - Call connectToServer() and handle success/error
    - Return connection data on success for game initialization
    - _Requirements: 1.1, 1.3, 5.5, 6.1_

  - [x] 4.6 Implement error handling methods

    - Implement retryConnection() method to retry server connection
    - Implement closeAuthError() method to dismiss auth error modal
    - Add error logging for debugging
    - _Requirements: 3.3, 4.3, 6.4_

- [x] 5. Integrate LoadingManager with main.ts

  - [x] 5.1 Update main.ts initialization flow

    - Import LoadingManager at top of main.ts
    - Create LoadingManager instance before game initialization
    - Call loadingManager.start() and wait for connection data
    - Move existing game initialization code into initializeGame() function
    - Pass connection data to initializeGame()
    - _Requirements: 5.5, 6.1_

  - [x] 5.2 Refactor MultiplayerManager connection

    - Extract connection data handling from MultiplayerManager.connect()
    - Update MultiplayerManager.connect() to accept connection data as parameter
    - Remove duplicate /api/connect fetch from MultiplayerManager
    - Ensure terrain seeds and initial chunks are still processed correctly
    - _Requirements: 5.5, 6.1_

  - [x] 5.3 Update UI initialization

    - Remove "Connecting..." initial text from username label
    - Set username label only after successful connection
    - Ensure UI initializes properly with connection data
    - _Requirements: 5.2, 5.4_

- [x] 6. Add initial visibility states to HTML

  - Add .hidden class to menu buttons (#play, #setting, #feature) by default
  - Add .hidden class to connection loading bar by default
  - Add .hidden class to error modals by default
  - Ensure loading screen is visible by default (no .hidden class)
  - _Requirements: 1.2, 2.1, 5.1_

- [ ] 7. Manual testing and polish

  - [ ] 7.1 Test asset loading phase

    - Verify loading screen appears immediately on page load
    - Verify loading animation plays smoothly
    - Test with throttled network to see loading screen longer
    - Verify menu background and title appear after assets load
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 7.2 Test connection phase

    - Verify loading bar appears after assets load
    - Verify loading bar animation plays correctly
    - Verify buttons appear after successful connection
    - Verify smooth transition from loading bar to buttons
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 5.3_

  - [ ] 7.3 Test error scenarios

    - Test connection error by stopping server
    - Verify connection error modal appears with correct message
    - Test retry button functionality
    - Test auth error by modifying server response (remove username)
    - Verify auth error modal appears with correct message
    - Test timeout by adding delay to server
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 7.4 Test visual consistency

    - Verify retro styling matches existing buttons and modals
    - Verify borders, colors, and shadows match game aesthetic
    - Test on different screen sizes
    - Verify animations are smooth and performant
    - _Requirements: 1.4, 2.4, 3.2, 4.2, 6.2, 6.3_

  - [ ] 7.5 Test full integration
    - Test complete flow from page load to game start
    - Verify no console errors during loading
    - Verify game initializes correctly after connection
    - Test multiple page reloads to ensure consistency
    - _Requirements: 5.4, 5.5, 6.5_
