import { PlayerModeManager } from "../player/playerModeManager";
import { BuilderRecognitionManager } from "./builderRecognitionManager";
import { UpvoteManager } from "../upvote/upvoteManager";

/**
 * PlayerModeUI - Manages all UI components for player mode features
 */
export default class PlayerModeUI {
  private playerModeManager: PlayerModeManager;
  private builderRecognitionManager: BuilderRecognitionManager;
  private upvoteManager: UpvoteManager;

  // UI Elements
  private buildersListContainer: HTMLDivElement;
  private friendsListContainer: HTMLDivElement;
  private viewerModeNotification: HTMLDivElement;
  private blockRemovalFeedback: HTMLDivElement;

  // State
  private isExpanded: boolean = false;

  constructor(
    playerModeManager: PlayerModeManager,
    builderRecognitionManager: BuilderRecognitionManager,
    upvoteManager: UpvoteManager
  ) {
    this.playerModeManager = playerModeManager;
    this.builderRecognitionManager = builderRecognitionManager;
    this.upvoteManager = upvoteManager;

    // Create UI elements
    this.buildersListContainer = this.createBuildersListContainer();
    this.friendsListContainer = this.createFriendsListContainer();
    this.viewerModeNotification = this.createViewerModeNotification();
    this.blockRemovalFeedback = this.createBlockRemovalFeedback();

    // Append to body
    document.body.appendChild(this.buildersListContainer);
    document.body.appendChild(this.friendsListContainer);
    document.body.appendChild(this.viewerModeNotification);
    document.body.appendChild(this.blockRemovalFeedback);

    // Initial render
    this.updateBuildersList();
    this.updateFriendsList();
  }

  /**
   * Create builders list container
   */
  private createBuildersListContainer(): HTMLDivElement {
    const container = document.createElement("div");
    container.className = "builders-list collapsed";

    container.innerHTML = `
      <div class="builders-list-header">
        <div class="builders-header-info">
          <span class="players-online">Players Online: 0</span>
          <span class="builders-count">Builders: 0</span>
        </div>
        <span class="builders-toggle" style="opacity:0.2">▼</span>
      </div>
      <div class="builders-list-content">
        <div class="builders-list-scroll"></div>
      </div>
    `;

    // Add click handler for header
    const header = container.querySelector(".builders-list-header");
    header?.addEventListener("click", () => {
      this.toggleBuildersList();
    });

    return container;
  }

  /**
   * Toggle builders list expanded/collapsed state
   */
  private toggleBuildersList(): void {
    this.isExpanded = !this.isExpanded;

    if (this.isExpanded) {
      this.buildersListContainer.classList.remove("collapsed");
      this.buildersListContainer.classList.add("expanded");

      // Update toggle icon
      const toggle =
        this.buildersListContainer.querySelector(".builders-toggle");
      if (toggle) toggle.textContent = "▲";
    } else {
      this.buildersListContainer.classList.remove("expanded");
      this.buildersListContainer.classList.add("collapsed");

      // Update toggle icon
      const toggle =
        this.buildersListContainer.querySelector(".builders-toggle");
      if (toggle) toggle.textContent = "▼";

      // Clear any active highlights when collapsing
      this.builderRecognitionManager.clearHighlight();
      this.updateBuildersList(); // Refresh to remove highlight styling
    }
  }

  /**
   * Create friends list container
   */
  private createFriendsListContainer(): HTMLDivElement {
    const container = document.createElement("div");
    container.className = "friends-list hidden";
    container.innerHTML = `
      <div class="friends-list-header">
        <span>Friends</span>
        <button class="friends-close-btn">×</button>
      </div>
      <div class="friends-list-content"></div>
      <div class="friends-list-footer">
        <input type="text" class="friend-input" placeholder="Enter username" />
        <button class="add-friend-btn">Add Friend</button>
      </div>
      <div class="friends-message"></div>
    `;

    // Add event listeners
    const closeBtn = container.querySelector(".friends-close-btn");
    closeBtn?.addEventListener("click", () => {
      container.classList.add("hidden");
    });

    const addBtn = container.querySelector(".add-friend-btn");
    const input = container.querySelector(".friend-input") as HTMLInputElement;
    addBtn?.addEventListener("click", () => {
      this.handleAddFriend(input.value.trim());
    });

    input?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.handleAddFriend(input.value.trim());
      }
    });

    return container;
  }

  /**
   * Create viewer mode notification
   */
  private createViewerModeNotification(): HTMLDivElement {
    const notification = document.createElement("div");
    notification.className = "viewer-mode-notification hidden";
    notification.innerHTML = `
      <div class="viewer-mode-content">
        <div class="viewer-mode-title">⚠️ Viewer Mode</div>
        <div class="viewer-mode-message">
          You are already playing from another device.<br/>
          Block modifications are disabled.
        </div>
      </div>
    `;
    return notification;
  }

  /**
   * Create block removal feedback
   */
  private createBlockRemovalFeedback(): HTMLDivElement {
    const feedback = document.createElement("div");
    feedback.className = "block-removal-feedback hidden";
    return feedback;
  }

  /**
   * Update builders list
   */
  updateBuildersList(playerCount?: number): void {
    const builders = this.builderRecognitionManager.getBuilders();
    const highlightedBuilder =
      this.builderRecognitionManager.getHighlightedBuilder();
    const currentUsername = this.playerModeManager.getUsername();
    const friends = this.playerModeManager.getFriends();

    // Update player count in header
    if (playerCount !== undefined) {
      const playersOnlineEl =
        this.buildersListContainer.querySelector(".players-online");
      if (playersOnlineEl) {
        playersOnlineEl.textContent = `Players Online: ${playerCount}`;
      }
    }

    // Update builders count in header
    const countEl = this.buildersListContainer.querySelector(".builders-count");
    if (countEl) {
      countEl.textContent = `Builders: ${builders.length}`;
    }

    // Update content (only if expanded)
    const scrollContainer = this.buildersListContainer.querySelector(
      ".builders-list-scroll"
    ) as HTMLDivElement;

    if (!scrollContainer) return;

    if (builders.length === 0) {
      scrollContainer.innerHTML =
        '<div class="no-builders">No builders nearby</div>';
      return;
    }

    scrollContainer.innerHTML = builders
      .map((builder) => {
        const isHighlighted = builder.username === highlightedBuilder;
        const highlightClass = isHighlighted ? "highlighted" : "";
        const isCurrentPlayer = builder.username === currentUsername;
        const isFriend = friends.includes(builder.username);

        // Friend button HTML (only for other players)
        let friendButton = "";
        if (!isCurrentPlayer) {
          if (isFriend) {
            friendButton = `
              <button 
                class="friend-btn friend-btn-active" 
                data-username="${builder.username}"
                title="Remove friend"
              >
                ✓
              </button>
            `;
          } else {
            friendButton = `
              <button 
                class="friend-btn" 
                data-username="${builder.username}"
                title="Add as friend"
              >
                +
              </button>
            `;
          }
        }

        return `
        <div class="builder-item ${highlightClass}">
          ${friendButton}
          <span class="builder-name" data-username="${builder.username}">
            ${builder.username}
          </span>
          <button 
            class="upvote-btn ${this.getUpvoteClass(builder.username)}" 
            data-username="${builder.username}"
            title="${this.getUpvoteTitle(builder.username)}"
          >
            ⬆
          </button>
        </div>
      `;
      })
      .join("");

    // Add click handlers for builder names
    scrollContainer.querySelectorAll(".builder-name").forEach((element) => {
      element.addEventListener("click", () => {
        const username = element.getAttribute("data-username");
        if (username) {
          this.builderRecognitionManager.toggleBuilderHighlight(username);
          // Re-render to update highlight state
          this.updateBuildersList();
        }
      });
    });

    // Add click handlers for friend buttons
    scrollContainer.querySelectorAll(".friend-btn").forEach((element) => {
      element.addEventListener("click", async (e) => {
        e.stopPropagation(); // Prevent triggering builder name click
        const username = element.getAttribute("data-username");
        if (username) {
          await this.handleFriendToggle(username);
        }
      });
    });

    // Add click handlers for upvote buttons
    scrollContainer.querySelectorAll(".upvote-btn").forEach((element) => {
      element.addEventListener("click", async (e) => {
        e.stopPropagation(); // Prevent triggering builder name click
        const username = element.getAttribute("data-username");
        if (username) {
          await this.handleUpvote(username);
        }
      });
    });
  }

  /**
   * Get upvote button CSS class based on upvote eligibility
   */
  private getUpvoteClass(username: string): string {
    const canUpvote = this.upvoteManager.canUpvote(username);
    return canUpvote.allowed ? "" : "upvote-disabled";
  }

  /**
   * Get upvote button title text based on upvote eligibility
   */
  private getUpvoteTitle(username: string): string {
    const canUpvote = this.upvoteManager.canUpvote(username);
    return canUpvote.allowed ? "Upvote" : canUpvote.reason || "Cannot upvote";
  }

  /**
   * Update friends list
   */
  updateFriendsList(): void {
    const friends = this.playerModeManager.getFriends();
    const content = this.friendsListContainer.querySelector(
      ".friends-list-content"
    ) as HTMLDivElement;

    if (!content) return;

    if (friends.length === 0) {
      content.innerHTML = '<div class="no-friends">No friends yet</div>';
      return;
    }

    content.innerHTML = friends
      .map(
        (friend) => `
      <div class="friend-item">
        <span class="friend-name">${friend}</span>
        <button class="remove-friend-btn" data-username="${friend}">Remove</button>
      </div>
    `
      )
      .join("");

    // Add click handlers for remove buttons
    content.querySelectorAll(".remove-friend-btn").forEach((element) => {
      element.addEventListener("click", async () => {
        const username = element.getAttribute("data-username");
        if (username) {
          await this.handleRemoveFriend(username);
        }
      });
    });
  }

  /**
   * Show viewer mode notification
   */
  showViewerModeNotification(message?: string): void {
    if (message) {
      const messageEl = this.viewerModeNotification.querySelector(
        ".viewer-mode-message"
      );
      if (messageEl) {
        messageEl.innerHTML = message;
      }
    }
    this.viewerModeNotification.classList.remove("hidden");
  }

  /**
   * Hide viewer mode notification
   */
  hideViewerModeNotification(): void {
    this.viewerModeNotification.classList.add("hidden");
  }

  /**
   * Show block removal feedback
   */
  showBlockRemovalFeedback(message: string): void {
    this.blockRemovalFeedback.innerHTML = message;
    this.blockRemovalFeedback.classList.remove("hidden");

    // Auto-hide after 3 seconds
    setTimeout(() => {
      this.blockRemovalFeedback.classList.add("hidden");
    }, 3000);
  }

  /**
   * Toggle friends list visibility
   */
  toggleFriendsList(): void {
    this.friendsListContainer.classList.toggle("hidden");
  }

  /**
   * Handle upvote action
   */
  private async handleUpvote(builderUsername: string): Promise<void> {
    const result = await this.upvoteManager.upvote(builderUsername);

    if (result.success) {
      // Update the builder's score in the UI optimistically
      this.showMessage(`Upvoted ${builderUsername}!`, "success");
      // The score will be updated via broadcast message
    } else {
      this.showMessage(result.message || "Cannot upvote", "error");
    }

    // Refresh builders list to update upvote button states
    this.updateBuildersList();
  }

  /**
   * Handle add friend action
   */
  private async handleAddFriend(friendUsername: string): Promise<void> {
    if (!friendUsername) {
      this.showFriendsMessage("Please enter a username", "error");
      return;
    }

    const success = await this.playerModeManager.addFriend(friendUsername);

    if (success) {
      this.showFriendsMessage(`Added ${friendUsername} as friend`, "success");
      this.updateFriendsList();

      // Clear input
      const input = this.friendsListContainer.querySelector(
        ".friend-input"
      ) as HTMLInputElement;
      if (input) input.value = "";
    } else {
      this.showFriendsMessage("Failed to add friend", "error");
    }
  }

  /**
   * Handle remove friend action
   */
  private async handleRemoveFriend(friendUsername: string): Promise<void> {
    const success = await this.playerModeManager.removeFriend(friendUsername);

    if (success) {
      this.showFriendsMessage(
        `Removed ${friendUsername} from friends`,
        "success"
      );
      this.updateFriendsList();
    } else {
      this.showFriendsMessage("Failed to remove friend", "error");
    }
  }

  /**
   * Handle friend button toggle (add or remove)
   */
  private async handleFriendToggle(username: string): Promise<void> {
    const friends = this.playerModeManager.getFriends();
    const isFriend = friends.includes(username);

    if (isFriend) {
      // Remove friend
      await this.playerModeManager.removeFriend(username);
    } else {
      // Add friend
      await this.playerModeManager.addFriend(username);
    }

    // Update UI to reflect change (optimistic update already happened in PlayerModeManager)
    this.updateBuildersList();
  }

  /**
   * Show general message
   */
  private showMessage(message: string, type: "success" | "error"): void {
    // Create temporary message element
    const messageEl = document.createElement("div");
    messageEl.className = `temp-message temp-message-${type}`;
    messageEl.innerHTML = message;
    document.body.appendChild(messageEl);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      messageEl.remove();
    }, 3000);
  }

  /**
   * Show friends list message
   */
  private showFriendsMessage(message: string, type: "success" | "error"): void {
    const messageEl = this.friendsListContainer.querySelector(
      ".friends-message"
    ) as HTMLDivElement;

    if (!messageEl) return;

    messageEl.innerHTML = message;
    messageEl.className = `friends-message friends-message-${type}`;

    // Auto-clear after 3 seconds
    setTimeout(() => {
      messageEl.innerHTML = "";
      messageEl.className = "friends-message";
    }, 3000);
  }

  /**
   * Check if currently in viewer mode
   */
  isViewerMode(): boolean {
    return this.playerModeManager.isViewerMode();
  }

  /**
   * Cleanup UI elements
   */
  destroy(): void {
    this.buildersListContainer.remove();
    this.friendsListContainer.remove();
    this.viewerModeNotification.remove();
    this.blockRemovalFeedback.remove();
  }
}
