# Implementation Plan

- [x] 1. Create ChatManager class for message management

  - [x] 1.1 Implement ChatManager with message queue

    - Create `src/client/chatManager.ts` file
    - Define `ChatMessage` interface with username, message, timestamp, expiresAt
    - Implement message queue with MAX_MESSAGES = 10
    - Implement MESSAGE_LIFETIME_MS = 60000 constant
    - Add constructor accepting PlayerModeManager and onMessagesChanged callback
    - _Requirements: 2.4, 3.1, 4.1_

  - [x] 1.2 Implement sendMessage method

    - Get username and level from PlayerModeManager
    - Validate message is not empty
    - Truncate message to 200 characters if too long
    - Send HTTP POST to `/api/chat` with username, level, message
    - Use fire-and-forget pattern (catch errors, don't block)
    - _Requirements: 1.4, 5.1, 7.1_

  - [x] 1.3 Implement handleChatBroadcast method

    - Accept broadcast data with username, message, timestamp
    - Calculate expiresAt as current time + MESSAGE_LIFETIME_MS
    - Create ChatMessage object
    - Add to messages array
    - Remove oldest message if queue exceeds MAX_MESSAGES
    - Call onMessagesChanged callback
    - _Requirements: 2.5, 3.2, 4.2, 5.4_

  - [x] 1.4 Implement message expiration

    - Create removeExpiredMessages private method
    - Filter messages where expiresAt > current time
    - Call onMessagesChanged if messages were removed
    - Set up setInterval to call removeExpiredMessages every 1 second
    - _Requirements: 3.2, 3.3, 3.4_

  - [x] 1.5 Implement utility methods

    - Implement getMessages() to return copy of messages array
    - Implement clear() to empty messages array
    - _Requirements: 2.4, 4.3_

-

- [x] 2. Create ChatUI class for user interface

  - [x] 2.1 Create chat input UI (center, modal)

    - Create `src/client/ui/chatUI.ts` file
    - Add PlayerModeManager to constructor parameters
    - Implement createChatInput method
    - Create container div with chat-input-container class
    - Create input element with chat-input class
    - Set placeholder "Type a message..."
    - Set maxLength to 200
    - Add Enter key handler to send message
    - Initially hide container (display: none)
    - Only append to DOM if in Player Mode
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 2.2 Create chat display UI (bottom-left)

    - Implement createChatDisplay method
    - Create div with chat-display class
    - Position fixed at bottom-left
    - Set max width to 300px
    - Only append to DOM if in Player Mode
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.3 Implement show/hide input methods

    - Implement showInput() to check Player Mode first, return early if Viewer Mode
    - Display container, clear input, focus input if in Player Mode
    - Implement hideInput() to hide container, clear input
    - Implement isInputActive() to return visibility state
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 2.4 Implement message sending

    - Create private sendMessage method
    - Get trimmed message from input
    - If empty, just hide input
    - Call chatManager.sendMessage with message text
    - Hide input after sending
    - _Requirements: 1.4_

  - [x] 2.5 Implement chat display rendering

    - Create updateChatDisplay method
    - Check Player Mode first, return early if Viewer Mode
    - Get messages from chatManager
    - Clear display if no messages
    - Render each message as div with chat-message class
    - Format as "[username]: [message]" with separate spans
    - Use escapeHtml helper to prevent XSS
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 6.1, 6.2, 6.3_

  - [x] 2.6 Implement HTML escaping

    - Create private escapeHtml method
    - Use textContent to safely escape HTML entities
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 2.7 Add CSS styles to index.html

    - Add chat-input-container styles (center, modal, dark background)
    - Add chat-input styles (white background, border, focus state)
    - Add chat-display styles (bottom-left, fixed position)
    - Add chat-message styles (dark background, padding, word-wrap)
    - Add chat-username styles (bold, green color)
    - Add chat-text styles (white color)
    - Add fadeIn animation for new messages
    - _Requirements: 2.1, 2.2, 2.3, 6.3_

- [x] 3. Integrate chat with Control Manager

  - [x] 3.1 Add ChatUI to Control constructor

    - Add chatUI parameter to Control constructor
    - Store as private property
    - _Requirements: 1.1_

  - [x] 3.2 Modify keydown handler for 'C' key

    - Check if chatUI.isInputActive() at start of onKeyDown
    - If active, only handle Escape key to close chat
    - If active, return early to let other keys go to input
    - Add 'c' key handler to call chatUI.showInput()
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 3.3 Prevent game controls when chat active

    - Ensure all game control keys are blocked when chat input is active
    - Verify movement, jumping, block placement all disabled during chat
    - _Requirements: 1.3_

- [x] 4. Integrate chat with Multiplayer Manager

  - [x] 4.1 Add ChatManager to MultiplayerManager constructor

    - Add chatManager parameter to constructor
    - Store as private property
    - _Requirements: 5.4, 7.7_

  - [x] 4.2 Route chat-message broadcasts

    - Modify handleMessage method
    - Add case for data.type === "chat-message"
    - Call chatManager.handleChatBroadcast with username, message, timestamp
    - Return early to avoid other message handling
    - _Requirements: 5.4, 7.7_

-

- [x] 5. Create server chat endpoint

  - [x] 5.1 Define chat interfaces

    - Add ChatRequest interface (username, level, message)
    - Add ChatResponse interface (ok, message?)
    - Add ChatBroadcast interface (type, username, message, timestamp)
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [x] 5.2 Implement POST /api/chat endpoint

    - Extract username, level, message from request body
    - Validate message is not empty (return 400 if empty)
    - Validate message length <= 200 characters (return 400 if too long)
    - Get player's current position from connectedClients
    - Return 404 if player not found
    - _Requirements: 7.1, 7.2, 7.6_

  - [x] 5.3 Calculate regional channel and broadcast

    - Call getRegionalChannelFromPosition with level and position
    - Create ChatBroadcast object with type, username, message, timestamp
    - Call realtime.send to broadcast to regional channel
    - Return immediate response { ok: true }
    - _Requirements: 5.1, 5.2, 7.3, 7.4, 7.6_

  - [x] 5.4 Add logging

    - Log incoming chat message with username and message
    - Log broadcast with channel name
    - _Requirements: 5.2_

- [x] 6. Wire up components in main.ts

  - [x] 6.1 Initialize ChatManager

    - Create ChatManager instance with playerModeManager
    - Pass updateChatDisplay callback from ChatUI
    - _Requirements: 1.1, 2.5_

  - [x] 6.2 Initialize ChatUI

    - Create ChatUI instance with chatManager and playerModeManager
    - Store reference for Control and cleanup
    - _Requirements: 1.1, 1.2, 2.1, 2.2_

  - [x] 6.3 Pass ChatUI to Control

    - Pass chatUI instance to Control constructor
    - _Requirements: 1.1_

  - [x] 6.4 Pass ChatManager to MultiplayerManager

    - Pass chatManager instance to MultiplayerManager constructor
    - _Requirements: 5.4, 7.7_

  - [x] 6.5 Set up ChatUI message update callback

    - Pass chatUI.updateChatDisplay.bind(chatUI) to ChatManager constructor
    - Ensure display updates when messages change
    - _Requirements: 2.5, 3.2_

- [ ] 7. Testing and polish

  - [ ] 7.1 Test basic chat flow

    - Press 'C' to open chat input
    - Type message and press Enter
    - Verify message appears in chat display
    - Verify message expires after 60 seconds
    - _Requirements: 1.1, 1.4, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [ ] 7.2 Test regional scope

    - Send message from player in one region
    - Verify only players in same region receive it
    - Move to different region and verify new messages appear
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 7.3, 7.4, 7.7_

  - [ ] 7.3 Test keyboard input routing

    - Open chat input and verify game controls don't respond
    - Press Escape to close chat
    - Verify game controls work again after closing
    - _Requirements: 1.2, 1.3, 1.5_

  - [ ] 7.4 Test message queue limits

    - Send more than 10 messages
    - Verify oldest messages are removed
    - Verify max 10 messages displayed
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 7.5 Test message formatting

    - Send message with special characters
    - Verify HTML is escaped (no XSS)
    - Verify username is bold and green
    - Verify message text wraps at 300px width
    - _Requirements: 2.3, 6.1, 6.2, 6.3_

  - [ ] 7.6 Test edge cases
    - Try sending empty message (should close input)
    - Try sending very long message (should truncate)
    - Test with multiple players chatting simultaneously
    - _Requirements: 1.4, 2.4_
