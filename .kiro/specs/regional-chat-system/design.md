# Regional Chat System Design Document

## Overview

This design document outlines the architecture for implementing an ephemeral regional chat system in the voxel game. The chat system allows players to communicate with others in their current region through text messages that are broadcast via WebSocket and expire client-side after 60 seconds.

### Key Design Principles

1. **Ephemeral Messages**: No server-side persistence, messages exist only in client memory
2. **Regional Scope**: Messages broadcast to existing regional channels, no new subscriptions
3. **Client-Side Expiration**: 60-second lifetime managed entirely by client
4. **Minimal UI Footprint**: Small, non-intrusive display in bottom-left corner
5. **Keyboard-Driven**: Press 'C' to open, Enter to send, Escape to cancel

## Architecture

### Component Structure

```
┌─────────────────────────────────────────────┐
│  Game Client                                │
│  ┌───────────────────────────────────────┐  │
│  │  Control Manager                      │  │
│  │  - Detects 'C' key press              │  │
│  │  - Toggles chat input visibility      │  │
│  │  - Manages keyboard input routing     │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  Chat Manager                         │  │
│  │  - Manages message queue (max 10)     │  │
│  │  - Handles message expiration (60s)   │  │
│  │  - Sends messages via HTTP            │  │
│  │  - Receives broadcasts via WebSocket  │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  Chat UI                              │  │
│  │  - Chat input (center, modal)         │  │
│  │  - Chat display (bottom-left)         │  │
│  │  - Message rendering with wrapping    │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  Multiplayer Manager                  │  │
│  │  - Routes chat-message broadcasts     │  │
│  │  - Uses existing regional channels    │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Game Server                                │
│  ┌───────────────────────────────────────┐  │
│  │  /api/chat Endpoint                   │  │
│  │  - Receives chat message via HTTP     │  │
│  │  - Calculates regional channel        │  │
│  │  - Broadcasts to WebSocket channel    │  │
│  │  - Returns immediately (fire-forget)  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Chat Manager (Client)

**File**: `src/client/chatManager.ts`

**Responsibilities**:

- Maintain message queue (max 10 messages)
- Handle message expiration (60-second timer per message)
- Send chat messages via HTTP
- Process incoming chat broadcasts
- Notify UI of message updates

**Interface**:

```typescript
interface ChatMessage {
  username: string;
  message: string;
  timestamp: number; // Server timestamp
  expiresAt: number; // Client-calculated expiration time
}

class ChatManager {
  private messages: ChatMessage[] = [];
  private readonly MAX_MESSAGES = 10;
  private readonly MESSAGE_LIFETIME_MS = 60000; // 60 seconds
  private playerModeManager: PlayerModeManager;
  private onMessagesChanged?: () => void;

  constructor(
    playerModeManager: PlayerModeManager,
    onMessagesChanged?: () => void
  ) {
    this.playerModeManager = playerModeManager;
    this.onMessagesChanged = onMessagesChanged;

    // Start expiration check interval
    setInterval(() => this.removeExpiredMessages(), 1000);
  }

  /**
   * Send a chat message
   */
  async sendMessage(message: string): Promise<void> {
    const username = this.playerModeManager.getUsername();
    const level = this.playerModeManager.getLevel();

    // Validate message
    if (!message.trim()) return;
    if (message.length > 200) {
      console.warn("Message too long, truncating to 200 characters");
      message = message.substring(0, 200);
    }

    // Send to server (fire-and-forget)
    fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, level, message: message.trim() }),
    }).catch((error) => {
      console.error("Failed to send chat message:", error);
    });
  }

  /**
   * Handle incoming chat broadcast
   */
  handleChatBroadcast(data: {
    username: string;
    message: string;
    timestamp: number;
  }): void {
    const now = Date.now();
    const chatMessage: ChatMessage = {
      username: data.username,
      message: data.message,
      timestamp: data.timestamp,
      expiresAt: now + this.MESSAGE_LIFETIME_MS,
    };

    // Add to queue
    this.messages.push(chatMessage);

    // Enforce max messages limit
    if (this.messages.length > this.MAX_MESSAGES) {
      this.messages.shift(); // Remove oldest
    }

    // Notify UI
    this.onMessagesChanged?.();
  }

  /**
   * Remove expired messages
   */
  private removeExpiredMessages(): void {
    const now = Date.now();
    const initialLength = this.messages.length;

    this.messages = this.messages.filter((msg) => msg.expiresAt > now);

    // Notify UI if messages were removed
    if (this.messages.length !== initialLength) {
      this.onMessagesChanged?.();
    }
  }

  /**
   * Get current messages for display
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = [];
    this.onMessagesChanged?.();
  }
}
```

### 2. Chat UI Component (Client)

**File**: `src/client/ui/chatUI.ts`

**Responsibilities**:

- Render chat input (center, modal)
- Render chat display (bottom-left)
- Handle text wrapping and formatting
- Show/hide chat input on demand

**Interface**:

```typescript
class ChatUI {
  private chatInputContainer: HTMLDivElement;
  private chatInput: HTMLInputElement;
  private chatDisplay: HTMLDivElement;
  private chatManager: ChatManager;
  private playerModeManager: PlayerModeManager;
  private isInputVisible: boolean = false;

  constructor(chatManager: ChatManager, playerModeManager: PlayerModeManager) {
    this.chatManager = chatManager;
    this.playerModeManager = playerModeManager;
    this.chatInputContainer = this.createChatInput();
    this.chatDisplay = this.createChatDisplay();

    // Only add to DOM if in Player Mode
    if (this.playerModeManager.isPlayerMode()) {
      document.body.appendChild(this.chatInputContainer);
      document.body.appendChild(this.chatDisplay);

      // Subscribe to message updates
      this.updateChatDisplay();
    }
  }

  /**
   * Create chat input (center, modal)
   */
  private createChatInput(): HTMLDivElement {
    const container = document.createElement("div");
    container.className = "chat-input-container";
    container.style.display = "none";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "chat-input";
    input.placeholder = "Type a message...";
    input.maxLength = 200;

    // Handle Enter key
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.sendMessage();
      }
    });

    container.appendChild(input);
    this.chatInput = input;

    return container;
  }

  /**
   * Create chat display (bottom-left)
   */
  private createChatDisplay(): HTMLDivElement {
    const display = document.createElement("div");
    display.className = "chat-display";
    return display;
  }

  /**
   * Show chat input (only in Player Mode)
   */
  showInput(): void {
    // Don't show chat in Viewer Mode
    if (!this.playerModeManager.isPlayerMode()) {
      return;
    }

    this.isInputVisible = true;
    this.chatInputContainer.style.display = "flex";
    this.chatInput.value = "";
    this.chatInput.focus();
  }

  /**
   * Hide chat input
   */
  hideInput(): void {
    this.isInputVisible = false;
    this.chatInputContainer.style.display = "none";
    this.chatInput.value = "";
  }

  /**
   * Check if input is visible
   */
  isInputActive(): boolean {
    return this.isInputVisible;
  }

  /**
   * Send message
   */
  private async sendMessage(): Promise<void> {
    const message = this.chatInput.value.trim();
    if (!message) {
      this.hideInput();
      return;
    }

    await this.chatManager.sendMessage(message);
    this.hideInput();
  }

  /**
   * Update chat display with current messages (only in Player Mode)
   */
  updateChatDisplay(): void {
    // Don't render chat in Viewer Mode
    if (!this.playerModeManager.isPlayerMode()) {
      return;
    }

    const messages = this.chatManager.getMessages();

    if (messages.length === 0) {
      this.chatDisplay.innerHTML = "";
      return;
    }

    // Render messages (oldest at top, newest at bottom)
    this.chatDisplay.innerHTML = messages
      .map((msg) => {
        return `
          <div class="chat-message">
            <span class="chat-username">${this.escapeHtml(msg.username)}:</span>
            <span class="chat-text">${this.escapeHtml(msg.message)}</span>
          </div>
        `;
      })
      .join("");
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.chatInputContainer.remove();
    this.chatDisplay.remove();
  }
}
```

### 3. Control Manager Integration (Client)

**File**: `src/client/control.ts`

**Modifications**:

```typescript
class Control {
  private chatUI: ChatUI;

  // Add to constructor
  constructor(..., chatUI: ChatUI) {
    this.chatUI = chatUI;
    // ... existing code
  }

  // Modify keydown handler
  private onKeyDown(event: KeyboardEvent): void {
    // Check if chat input is active
    if (this.chatUI.isInputActive()) {
      // Only handle Escape to close chat
      if (event.key === "Escape") {
        this.chatUI.hideInput();
      }
      // Let all other keys go to the input field
      return;
    }

    // Existing key handling
    const key = event.key.toLowerCase();

    // Add 'C' key for chat
    if (key === "c") {
      this.chatUI.showInput();
      return;
    }

    // ... rest of existing key handling
  }
}
```

### 4. Multiplayer Manager Integration (Client)

**File**: `src/client/multiplayer.ts`

**Modifications**:

```typescript
class MultiplayerManager {
  private chatManager: ChatManager;

  // Add to constructor
  constructor(..., chatManager: ChatManager) {
    this.chatManager = chatManager;
    // ... existing code
  }

  // Modify handleMessage to route chat broadcasts
  private handleMessage(data: any): void {
    if (data.type === "chat-message") {
      this.chatManager.handleChatBroadcast({
        username: data.username,
        message: data.message,
        timestamp: data.timestamp,
      });
      return;
    }

    // ... existing message handling for player-positions, block-modify, etc.
  }
}
```

### 5. Server Chat Endpoint

**File**: `src/server/index.ts`

**New Endpoint**:

```typescript
// Chat message interfaces
interface ChatRequest {
  username: string;
  level: string;
  message: string;
}

interface ChatResponse {
  ok: boolean;
  message?: string;
}

interface ChatBroadcast {
  type: "chat-message";
  username: string;
  message: string;
  timestamp: number;
}

// POST /api/chat endpoint
app.post("/api/chat", async (req, res) => {
  const { username, level, message } = req.body as ChatRequest;

  // Validate message
  if (!message || !message.trim()) {
    return res.status(400).json({ ok: false, message: "Message is required" });
  }

  if (message.length > 200) {
    return res
      .status(400)
      .json({ ok: false, message: "Message too long (max 200 characters)" });
  }

  console.log(`Chat from ${username}: ${message}`);

  // Get player's current position to calculate regional channel
  const client = connectedClients.get(username);
  if (!client) {
    return res.status(404).json({ ok: false, message: "Player not connected" });
  }

  const position = client.position || { x: 0, y: 20, z: 0 };
  const channel = getRegionalChannelFromPosition(level, position);

  // Broadcast to regional channel
  const broadcast: ChatBroadcast = {
    type: "chat-message",
    username,
    message: message.trim(),
    timestamp: Date.now(),
  };

  await realtime.send(channel, broadcast);

  console.log(`Broadcast chat to channel ${channel}`);

  // Immediate response (fire-and-forget)
  res.json({ ok: true });
});
```

## Data Models

### ChatMessage (Client-Side Only)

```typescript
interface ChatMessage {
  username: string; // Sender's username
  message: string; // Message text (max 200 characters)
  timestamp: number; // Server timestamp (for ordering)
  expiresAt: number; // Client-calculated expiration time
}
```

### Chat Broadcast (WebSocket)

```typescript
interface ChatBroadcast {
  type: "chat-message";
  username: string;
  message: string;
  timestamp: number;
}
```

### HTTP Request/Response

```typescript
// POST /api/chat
interface ChatRequest {
  username: string;
  level: string;
  message: string; // Max 200 characters
}

interface ChatResponse {
  ok: boolean;
  message?: string; // Error message if ok is false
}
```

## CSS Styling

### Chat Input (Center, Modal)

```css
.chat-input-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding: 20px;
  border-radius: 8px;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.chat-input {
  width: 400px;
  padding: 12px 16px;
  font-size: 16px;
  font-family: "Courier New", monospace;
  background-color: rgba(255, 255, 255, 0.9);
  border: 2px solid #666;
  border-radius: 4px;
  outline: none;
  color: #333;
}

.chat-input:focus {
  border-color: #17cd07;
  background-color: white;
}

.chat-input::placeholder {
  color: #999;
}
```

### Chat Display (Bottom-Left)

```css
.chat-display {
  position: fixed;
  bottom: 10px;
  left: 10px;
  width: 300px;
  max-height: 300px;
  overflow: hidden;
  z-index: 100;
  pointer-events: none; /* Don't block clicks */
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-message {
  background-color: rgba(0, 0, 0, 0.6);
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-family: "Courier New", monospace;
  color: white;
  word-wrap: break-word;
  line-height: 1.4;
  animation: fadeIn 0.2s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-username {
  font-weight: bold;
  color: #17cd07;
  margin-right: 4px;
}

.chat-text {
  color: #ffffff;
}
```

## Error Handling

### Client-Side

1. **Empty Message**: Silently ignore, close input
2. **Message Too Long**: Truncate to 200 characters with console warning
3. **Network Error**: Log error, don't show to user (fire-and-forget)
4. **Player Not Connected**: Server returns 404, logged but not shown to user

### Server-Side

1. **Invalid Message**: Return 400 with error message
2. **Player Not Found**: Return 404 with error message
3. **Broadcast Failure**: Log error, continue (ephemeral, no retry)

## Testing Strategy

### Unit Tests

1. **ChatManager**:

   - Test message queue max size (10 messages)
   - Test message expiration (60 seconds)
   - Test message truncation (200 characters)
   - Test expired message removal

2. **ChatUI**:
   - Test input show/hide
   - Test HTML escaping (XSS prevention)
   - Test message rendering
   - Test Enter/Escape key handling

### Integration Tests

1. **Chat Flow**:

   - Press 'C', type message, press Enter
   - Verify HTTP request sent
   - Verify broadcast received
   - Verify message displayed in UI

2. **Regional Scope**:

   - Send message from player in region A
   - Verify only players in region A receive it
   - Verify players in region B don't receive it

3. **Message Expiration**:

   - Send message
   - Wait 60 seconds
   - Verify message removed from display

4. **Keyboard Input Routing**:
   - Verify game controls disabled when chat input active
   - Verify game controls enabled when chat input closed
   - Verify Escape closes chat input

## Performance Considerations

### Client-Side

1. **Message Expiration**: Single interval (1 second) checks all messages
2. **DOM Updates**: Only update display when messages change
3. **Memory**: Max 10 messages per client, auto-cleanup
4. **Text Wrapping**: CSS handles wrapping, no JS calculation needed

### Server-Side

1. **No Persistence**: Zero Redis operations for chat
2. **Fire-and-Forget**: Immediate HTTP response, async broadcast
3. **Regional Scope**: Only players in same region receive messages
4. **Message Validation**: Simple length check, no complex processing

## Security Considerations

1. **XSS Prevention**: HTML escape all user-generated content
2. **Message Length**: Enforce 200 character limit server-side
3. **Rate Limiting**: Consider adding rate limit (future enhancement)
4. **Content Filtering**: Consider profanity filter (future enhancement)

## Future Enhancements

1. **Message History**: Store last 50 messages in localStorage
2. **Chat Commands**: Support /commands for game actions
3. **Private Messages**: Direct messages between players
4. **Chat Channels**: Multiple channels (global, team, etc.)
5. **Emojis**: Support emoji input and rendering
6. **Timestamps**: Show message age (e.g., "2m ago")
7. **Player Mentions**: @username highlighting
8. **Chat Notifications**: Sound/visual notification for new messages
