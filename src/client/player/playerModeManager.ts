/** PlayerModeManager - Manages player mode state and capabilities */
import Block from "../mesh/block";

/**
 * Connection response from server
 */
export interface ConnectResponse {
  mode: "player" | "viewer";
  username: string;
  sessionId: string;
  level: string;
  terrainSeeds: { seed: number };
  spawnPosition: { x: number; y: number; z: number };
  initialChunks: any[];
  players: any[];
  playerData?: {
    score: number;
    friends: string[];
    friendedBy: string[];
  };
  message?: string;
}

/**
 * Friendship broadcast message types
 */
export interface FriendshipAddedMessage {
  type: "friendship-added";
  targetUsername: string;
  byUsername: string;
  message: string;
}

export interface FriendshipRemovedMessage {
  type: "friendship-removed";
  targetUsername: string;
  byUsername: string;
  message: string;
}

export type FriendshipBroadcastMessage =
  | FriendshipAddedMessage
  | FriendshipRemovedMessage;

/**
 * PlayerModeManager - Manages player mode state and capabilities
 */
export class PlayerModeManager {
  private mode: "player" | "viewer" = "player";
  private username: string = "";
  private level: string = "";
  private score: number = 0;
  private friends: string[] = []; // Users this player has added
  private friendedBy: string[] = []; // Users who added this player (for block removal)

  /**
   * Initialize player mode from connection response
   */
  initialize(connectResponse: ConnectResponse): void {
    this.mode = connectResponse.mode;
    this.username = connectResponse.username;
    this.level = connectResponse.level;

    if (connectResponse.playerData) {
      this.score = connectResponse.playerData.score;
      this.friends = connectResponse.playerData.friends;
      this.friendedBy = connectResponse.playerData.friendedBy;
    }

    if (this.mode === "viewer") {
      this.showViewerModeNotification(connectResponse.message);
    }
  }

  /**
   * Check if currently in Player Mode
   */
  isPlayerMode(): boolean {
    return this.mode === "player";
  }

  /**
   * Check if currently in Viewer Mode
   */
  isViewerMode(): boolean {
    return this.mode === "viewer";
  }

  /**
   * Check if block modifications are allowed
   */
  canModifyBlocks(): boolean {
    return this.mode === "player";
  }

  /**
   * Check if position updates should be sent
   */
  shouldSendPositionUpdates(): boolean {
    return this.mode === "player";
  }

  /**
   * Check if a block can be removed based on ownership
   */
  canRemoveBlock(block: Block): { allowed: boolean; reason?: string } {
    if (this.mode === "viewer") {
      return { allowed: false, reason: "Viewer Mode: Cannot modify blocks" };
    }

    // Non-custom blocks can always be removed
    if (
      !block.placed ||
      !block.username ||
      typeof block.username !== "string" ||
      block.username.trim() === ""
    ) {
      return { allowed: true };
    }

    // Own blocks can be removed
    if (block.username === this.username) {
      return { allowed: true };
    }

    // Blocks from users who added this player as friend can be removed
    if (this.friendedBy.includes(block.username)) {
      return { allowed: true };
    }

    // Other players' blocks cannot be removed
    return {
      allowed: false,
      reason: `Cannot remove ${block.username}'s block. Add them as a friend to collaborate.`,
    };
  }

  /**
   * Get current player score
   */
  getScore(): number {
    return this.score;
  }

  /**
   * Update score (called when receiving upvote)
   */
  updateScore(newScore: number): void {
    this.score = newScore;
  }

  /**
   * Get friends list
   */
  getFriends(): string[] {
    return [...this.friends];
  }

  /**
   * Add a friend (HTTP request/response)
   */
  async addFriend(
    friendUsername: string
  ): Promise<{ success: boolean; message?: string }> {
    if (this.mode === "viewer") {
      console.warn("Cannot add friends in Viewer Mode");
      return { success: false, message: "Cannot add friends in Viewer Mode" };
    }

    try {
      const response = await fetch(window.ENDPOINTS.FRIENDS_ADD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username,
          level: this.level,
          friendUsername,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        // Update local friends list with server response
        this.friends = result.friends;

        return { success: true, message: result.message };
      } else {
        console.warn(`Failed to add friend: ${result.message}`);
        return { success: false, message: result.message };
      }
    } catch (error) {
      console.error("Failed to add friend:", error);
      return { success: false, message: "Network error" };
    }
  }

  /**
   * Remove a friend (HTTP request/response)
   */
  async removeFriend(
    friendUsername: string
  ): Promise<{ success: boolean; message?: string }> {
    if (this.mode === "viewer") {
      console.warn("Cannot remove friends in Viewer Mode");
      return {
        success: false,
        message: "Cannot remove friends in Viewer Mode",
      };
    }

    try {
      const response = await fetch(window.ENDPOINTS.FRIENDS_REMOVE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username,
          level: this.level,
          friendUsername,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        // Update local friends list with server response
        this.friends = result.friends;

        return { success: true, message: result.message };
      } else {
        console.warn(`Failed to remove friend: ${result.message}`);
        return { success: false, message: result.message };
      }
    } catch (error) {
      console.error("Failed to remove friend:", error);
      return { success: false, message: "Network error" };
    }
  }

  /**
   * Show notification for Viewer Mode
   */
  private showViewerModeNotification(message?: string): void {
    const notification = message || "You are in Viewer Mode";

    // UI notification is handled by playerModeUI.showViewerModeNotification()
  }

  /**
   * Get current username
   */
  getUsername(): string {
    return this.username;
  }

  /**
   * Get current level
   */
  getLevel(): string {
    return this.level;
  }

  /**
   * Handle friendship broadcast messages
   */
  handleFriendshipBroadcast(data: FriendshipBroadcastMessage): void {
    // Only process if this player is the target
    if (data.targetUsername !== this.username) {
      return;
    }

    if (data.type === "friendship-added") {
      // Add byUsername to friendedBy array if not already present
      if (!this.friendedBy.includes(data.byUsername)) {
        this.friendedBy.push(data.byUsername);
      }
    } else if (data.type === "friendship-removed") {
      // Remove byUsername from friendedBy array
      this.friendedBy = this.friendedBy.filter((u) => u !== data.byUsername);
    }
  }
}
