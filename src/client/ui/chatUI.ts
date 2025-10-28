import { ChatManager } from "../chatManager";
import { PlayerModeManager } from "../playerModeManager";

/**
 * ChatUI - Manages chat user interface components
 */
export class ChatUI {
  private chatInputContainer: HTMLDivElement;
  private chatInput!: HTMLInputElement;
  private chatDisplay: HTMLDivElement;
  private chatManager: ChatManager;
  private playerModeManager: PlayerModeManager;
  private isInputVisible: boolean = false;

  constructor(chatManager: ChatManager, playerModeManager: PlayerModeManager) {
    this.chatManager = chatManager;
    this.playerModeManager = playerModeManager;

    // Create UI elements
    this.chatInputContainer = this.createChatInput();
    this.chatDisplay = this.createChatDisplay();

    // Only append to DOM if in Player Mode
    if (this.playerModeManager.isPlayerMode()) {
      document.body.appendChild(this.chatInputContainer);
      document.body.appendChild(this.chatDisplay);
    }
  }

  /**
   * Create chat input (center, modal)
   */
  private createChatInput(): HTMLDivElement {
    const container = document.createElement("div");
    container.className = "chat-input-container";
    container.style.display = "none"; // Initially hide

    const input = document.createElement("input");
    input.type = "text";
    input.className = "chat-input";
    input.placeholder = "Type a message...";
    input.maxLength = 200;

    // Add Enter key handler to send message
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
    // Check Player Mode first, return early if Viewer Mode
    if (!this.playerModeManager.isPlayerMode()) {
      return;
    }

    this.isInputVisible = true;
    this.chatInputContainer.style.display = "flex";
    this.chatInput.value = ""; // Clear input
    this.chatInput.focus(); // Focus input
  }

  /**
   * Hide chat input
   */
  hideInput(): void {
    this.isInputVisible = false;
    this.chatInputContainer.style.display = "none";
    this.chatInput.value = ""; // Clear input
  }

  /**
   * Hide input and re-engage pointer lock (for Escape key)
   */
  hideInputAndRelock(): void {
    this.hideInput();
    this.reengagePointerLock();
  }

  /**
   * Check if input is active
   */
  isInputActive(): boolean {
    return this.isInputVisible;
  }

  /**
   * Send message
   */
  private async sendMessage(): Promise<void> {
    const message = this.chatInput.value.trim();

    // If empty, just hide input
    if (!message) {
      this.hideInput();
      this.reengagePointerLock();
      return;
    }

    // Call chatManager.sendMessage with message text
    await this.chatManager.sendMessage(message);

    // Hide input after sending
    this.hideInput();

    // Re-engage pointer lock so player can continue playing
    this.reengagePointerLock();
  }

  /**
   * Re-engage pointer lock after closing chat
   */
  private reengagePointerLock(): void {
    // Request pointer lock to resume game controls
    document.body.requestPointerLock();
  }

  /**
   * Update chat display with current messages (only in Player Mode)
   */
  updateChatDisplay(): void {
    // Check Player Mode first, return early if Viewer Mode
    if (!this.playerModeManager.isPlayerMode()) {
      return;
    }

    const messages = this.chatManager.getMessages();

    // Clear display if no messages
    if (messages.length === 0) {
      this.chatDisplay.innerHTML = "";
      return;
    }

    // Render each message as div with chat-message class
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
