import { PlayerModeManager } from "../player/playerModeManager";
/**
 * ChatMessage interface
 */
export interface ChatMessage {
  username: string;
  message: string;
  timestamp: number; // Server timestamp
}

/**
 * ChatManager - Manages chat messages and communication
 * Messages persist until overflow (no time-based expiration)
 */
export class ChatManager {
  private messages: ChatMessage[] = [];
  private playerModeManager: PlayerModeManager;
  private onMessagesChanged?: () => void;

  constructor(
    playerModeManager: PlayerModeManager,
    onMessagesChanged?: () => void
  ) {
    this.playerModeManager = playerModeManager;
    this.onMessagesChanged = onMessagesChanged!;
  }

  /**
   * Send a chat message
   */
  async sendMessage(message: string): Promise<void> {
    const username = this.playerModeManager.getUsername();
    const level = this.playerModeManager.getLevel();

    // Validate message is not empty
    if (!message.trim()) {
      return;
    }

    // Truncate message to 200 characters if too long
    let finalMessage = message;
    if (message.length > 200) {
      console.warn("Message too long, truncating to 200 characters");
      finalMessage = message.substring(0, 200);
    }

    // Send HTTP POST to /api/chat (fire-and-forget)
    fetch(window.ENDPOINTS.CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        level,
        message: finalMessage.trim(),
      }),
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
    // Check for duplicate message (same username, message, and timestamp)
    const isDuplicate = this.messages.some(
      (msg) =>
        msg.username === data.username &&
        msg.message === data.message &&
        msg.timestamp === data.timestamp
    );

    if (isDuplicate) {
      // Ignore duplicate message
      return;
    }

    const chatMessage: ChatMessage = {
      username: data.username,
      message: data.message,
      timestamp: data.timestamp,
    };

    // Add to messages array (no limit - overflow handled by CSS)
    this.messages.push(chatMessage);

    // Call onMessagesChanged callback
    this.onMessagesChanged?.();
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

  /**
   * Cleanup
   */
  destroy(): void {
    // No cleanup needed
  }
}
