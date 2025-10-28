# Implementation Plan

- [x] 1. Remove player score display and broadcast system

  - [x] 1.1 Remove player score display component from client

    - Remove `playerScoreDisplay` property from PlayerModeUI class
    - Remove `createPlayerScoreDisplay()` method
    - Remove `updatePlayerScore()` method
    - Remove player score DOM element creation and append in constructor
    - Remove player score cleanup in `destroy()` method
    - Remove player score CSS styles from index.html
    - _Requirements: 1.1_

  - [x] 1.2 Remove score broadcast handling from client

    - Remove `handleScoreUpdate()` method from MultiplayerManager
    - Remove `ScoreUpdateMessage` interface
    - Remove score-update case from message handler switch statement
    - Remove `updateBuilderScore()` calls related to score broadcasts
    - Remove `updateScore()` calls from PlayerModeManager when receiving broadcasts
    - _Requirements: 1.4_

  - [x] 1.3 Remove score broadcast from server

    - Remove score-update broadcast in upvote endpoint (keep database update)
    - Remove `realtime.send()` call to `scores:${level}` channel
    - Keep score increment logic in Redis (`hIncrBy` for totalUpvotesReceived)
    - Keep all database persistence for scores
    - _Requirements: 1.5, 1.6_

- [x] 2. Reposition and restructure builders list UI

  - [x] 2.1 Update builders list CSS positioning

    - Change position from `right: 10px; top: 60px` to `left: 10px; top: 10px`
    - Update width from 220px to 180px for collapsed state
    - Add transition for smooth width changes
    - _Requirements: 2.1, 2.2, 2.3, 6.1, 6.2_

  - [x] 2.2 Restructure builders list HTML

    - Add clickable header with builder count and toggle icon
    - Wrap existing content in collapsible container
    - Add scrollable inner container for builder items
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 2.3 Update `createBuildersListContainer()` method

    - Modify HTML structure to include header and content sections
    - Add click event listener to header for toggle functionality
    - Initialize with collapsed state
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Implement collapse/expand functionality

  - [x] 3.1 Add state management for expanded/collapsed

    - Add `isExpanded` boolean property to PlayerModeUI (default: false)
    - _Requirements: 3.5_

  - [x] 3.2 Implement `toggleBuildersList()` method

    - Toggle `isExpanded` state
    - Add/remove CSS classes for expanded/collapsed states
    - Update toggle icon (▼ for collapsed, ▲ for expanded)
    - Clear highlights when collapsing
    - Refresh UI after clearing highlights
    - _Requirements: 3.2, 3.3, 5.6_

  - [x] 3.3 Add CSS for collapse/expand transitions

    - Add `.collapsed` and `.expanded` classes
    - Implement smooth max-height transition for content
    - Hide content when collapsed
    - Show content with max-height when expanded
    - _Requirements: 3.1, 3.2, 3.3_

-

- [x] 4. Implement scrollable builder list

  - [x] 4.1 Add CSS for scrollable container

    - Set max-height of 300px on scroll container
    - Enable vertical scrolling with `overflow-y: auto`
    - Hide horizontal overflow
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.2 Add custom scrollbar styling

    - Style webkit scrollbar with game-themed colors
    - Set scrollbar width to 6px
    - Add hover effects for scrollbar thumb
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Update builder list rendering logic

  - [x] 5.1 Modify `updateBuildersList()` method

    - Update header count display with total builder count
    - Remove block count display from builder items
    - Add highlight class to highlighted builder items
    - Maintain upvote button functionality
    - _Requirements: 1.3, 3.1, 3.4, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 5.2 Update builder item HTML structure

    - Remove block count from builder name display
    - Add data attribute for username
    - Add highlight class conditionally based on highlighted builder
    - _Requirements: 1.3, 3.4, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 5.3 Add helper methods for upvote button state

    - Implement `getUpvoteClass()` method
    - Implement `getUpvoteTitle()` method
    - _Requirements: 5.1_

- [x] 6. Update BuilderRecognitionManager to include current player

  - [x] 6.1 Modify `updateBuilders()` method

    - Remove filter that excludes current player's blocks
    - Remove slice that limits to top 10 builders
    - Keep all builders for scrollable list
    - _Requirements: 1.2, 7.1, 7.2, 7.3_

  - [x] 6.2 Remove score-related methods

    - Remove `updateBuilderScore()` method (no longer needed without broadcasts)
    - Remove `score` property from BuilderInfo interface (keep for internal use if needed)
    - _Requirements: 1.4_

  - [x] 6.3 Ensure `clearHighlight()` is publicly accessible

    - Verify method is public for PlayerModeUI to call
    - _Requirements: 5.6_

- [x] 7. Add region-aware builder list updates

  - [x] 7.1 Update MultiplayerManager subscription logic

    - Call `updateBuilders()` after `updateSubscriptions()` completes
    - Trigger UI update after builders list refresh
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Ensure builders list updates on chunk loading

    - Verify existing `updateBuilders()` call in `loadChunkState()`
    - Verify existing `updateBuilders()` call in `handleBlockModification()`
    - _Requirements: 7.2_

-

- [x] 8. Add CSS styling for highlighted builder items

  - [x] 8.1 Add `.highlighted` class styles

    - Set background color to green-tinted (hsla(120, 100%, 25%, 0.8))
    - Set border color to bright green (#17cd07)
    - _Requirements: 5.4, 5.5_

  - [x] 8.2 Style highlighted builder name

    - Set text color to bright green (#17cd07)
    - Set font-weight to bold
    - _Requirements: 5.4, 5.5_

- [x] 9. Update builder item styling for compact display

  - [x] 9.1 Adjust font sizes

    - Set builder name font-size to 0.85rem
    - Set header font-size to 0.9rem
    - _Requirements: 6.3, 6.4_

  - [x] 9.2 Optimize padding and spacing

    - Adjust padding for compact display
    - Ensure touch-friendly click targets
    - _Requirements: 6.4_

  - [x] 9.3 Add text overflow handling

    - Add ellipsis for long usernames
    - Prevent text wrapping
    - _Requirements: 6.3, 6.4_

- [x] 10. Add friend management buttons to builders list

  - [x] 10.1 Update builder item HTML structure

    - Modify updateBuildersList() method in PlayerModeUI
    - Get current username from PlayerModeManager
    - Get friends list from PlayerModeManager
    - Check if each builder is current player or friend
    - Add friend button HTML before builder name (skip for current player)
    - Use "+" icon for non-friends, "✓" icon for friends
    - Set appropriate CSS classes (friend-btn, friend-btn-active)
    - Add title attributes for tooltips ("Add as friend" / "Remove friend")
    - _Requirements: 8.1, 8.2, 9.1, 9.2, 9.3_

  - [x] 10.2 Add friend button click handlers

    - Select all .friend-btn elements after rendering
    - Add click event listener to each button
    - Call e.stopPropagation() to prevent builder name click
    - Extract username from data-username attribute
    - Call handleFriendToggle method with username
    - _Requirements: 8.3, 10.1_

  - [x] 10.3 Implement handleFriendToggle method

    - Create private handleFriendToggle method in PlayerModeUI
    - Get friends list from PlayerModeManager
    - Check if username is in friends list
    - If friend, call playerModeManager.removeFriend(username)
    - If not friend, call playerModeManager.addFriend(username)
    - Call updateBuildersList() to refresh UI
    - _Requirements: 8.3, 8.4, 10.1, 10.2, 10.4_

  - [x] 10.4 Add CSS styles for friend buttons

    - Add .friend-btn base styles (20x20px, white border, transparent bg)
    - Add .friend-btn:hover styles (lighter background, scale transform)
    - Add .friend-btn-active styles (green background and border)
    - Add .friend-btn-active:hover styles (brighter green)
    - Update .builder-item to use flexbox with align-items: center
    - Add margin-right to friend button for spacing
    - _Requirements: 8.1, 8.2, 9.1, 9.2_

  - [x] 10.5 Update builder-item flexbox layout

    - Ensure builder-item uses display: flex
    - Set align-items: center for vertical alignment
    - Ensure friend button, builder name, and upvote button align properly
    - Add flex-shrink: 0 to friend button to prevent squishing
    - _Requirements: 8.1, 9.1_

- [ ] 11. Integration and testing

  - [ ] 11.1 Test collapse/expand functionality

    - Verify smooth transitions
    - Verify toggle icon changes
    - Verify highlights clear on collapse
    - _Requirements: 3.2, 3.3, 5.6_

  - [ ] 11.2 Test scrolling with many builders

    - Add test data with 20+ builders
    - Verify scrollbar appears
    - Verify smooth scrolling
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 11.3 Test highlight synchronization

    - Click builder name to highlight
    - Verify visual highlight in list
    - Verify blocks highlighted in game
    - Verify highlight clears on collapse
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 11.4 Test region-aware updates

    - Move player to new region
    - Verify builders list updates
    - Verify new builders appear
    - Verify old builders removed
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 11.5 Test with current player in list

    - Verify current player appears in builders list
    - Verify current player can be highlighted
    - _Requirements: 1.2_

  - [ ] 11.6 Test friend management functionality
    - Click "+" button next to a builder name
    - Verify button changes to "✓" immediately (optimistic update)
    - Verify tooltip changes from "Add as friend" to "Remove friend"
    - Click "✓" button to remove friend
    - Verify button changes back to "+" immediately
    - Test with multiple builders
    - Verify friend status persists after UI refresh
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 10.4_
