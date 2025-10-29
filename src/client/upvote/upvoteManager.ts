/**
 * UpvoteManager - Manages upvote rate limiting and submission
 */
import { PlayerModeManager } from "../player/playerModeManager";

/**
 * UpvoteRecord - Record of an upvote in localStorage
 */
interface UpvoteRecord {
  timestamp: number;
}

/**
 * UpvoteManager - Manages upvote rate limiting and submission
 */
export class UpvoteManager {
  private readonly COOLDOWN_MS = 60000; // 1 minute
  private readonly MAX_UPVOTES_PER_DAY = 5;
  private readonly DAY_MS = 24 * 60 * 60 * 1000;
  private level: string;
  private playerModeManager: PlayerModeManager;

  constructor(level: string, playerModeManager: PlayerModeManager) {
    this.level = level;
    this.playerModeManager = playerModeManager;
  }

  /**
   * Check if upvote is allowed for a builder
   */
  canUpvote(builderUsername: string): { allowed: boolean; reason?: string } {
    const currentUsername = this.playerModeManager.getUsername();

    // Can't upvote self
    if (builderUsername === currentUsername) {
      return { allowed: false, reason: "You cannot upvote yourself" };
    }

    // Can't upvote in Viewer Mode
    if (this.playerModeManager.isViewerMode()) {
      return { allowed: false, reason: "Cannot upvote in Viewer Mode" };
    }

    const records = this.getUpvoteRecords(builderUsername);

    // Check cooldown (last upvote within 1 minute)
    if (records.length > 0) {
      const lastUpvote = records[records.length - 1];
      const timeSinceLastUpvote = lastUpvote
        ? Date.now() - lastUpvote.timestamp
        : null;

      if (timeSinceLastUpvote && timeSinceLastUpvote < this.COOLDOWN_MS) {
        const remainingSeconds = Math.ceil(
          (this.COOLDOWN_MS - timeSinceLastUpvote) / 1000
        );
        return {
          allowed: false,
          reason: `Please wait ${remainingSeconds} seconds before upvoting again`,
        };
      }
    }

    // Check daily limit
    const recentUpvotes = records.filter(
      (r) => Date.now() - r.timestamp < this.DAY_MS
    );

    if (recentUpvotes.length >= this.MAX_UPVOTES_PER_DAY) {
      return {
        allowed: false,
        reason: `You have reached the daily limit of ${this.MAX_UPVOTES_PER_DAY} upvotes for this builder`,
      };
    }

    return { allowed: true };
  }

  /**
   * Submit an upvote for a builder (optimistic update)
   */
  async upvote(builderUsername: string): Promise<{
    success: boolean;
    optimisticScore?: number;
    message?: string;
  }> {
    const check = this.canUpvote(builderUsername);

    if (!check.allowed) {
      return { success: false, message: check.reason! };
    }

    const currentUsername = this.playerModeManager.getUsername();

    // Record upvote in localStorage immediately
    this.recordUpvote(builderUsername);

    // Calculate optimistic score (current + 1)
    const optimisticScore = this.getOptimisticScore(builderUsername);

    console.log(
      `Optimistically upvoted ${builderUsername}, estimated score: ${optimisticScore}`
    );

    // Fire-and-forget server request
    fetch(window.ENDPOINTS.UPVOTE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: currentUsername,
        level: this.level,
        builderUsername,
      }),
    }).catch((error) => {
      console.error("Failed to send upvote to server:", error);
      // Server will broadcast actual score update
    });

    return {
      success: true,
      optimisticScore,
      message: `Upvoted ${builderUsername}`,
    };
  }

  /**
   * Get optimistic score for a builder (current + 1)
   * Note: This is a placeholder. In a full implementation, this would track
   * builder scores from broadcasts or query the server.
   */
  private getOptimisticScore(_builderUsername: string): number {
    // This would need to be tracked or estimated
    // For now, return a placeholder
    return 0;
  }

  /**
   * Get upvote records for a builder from localStorage
   */
  private getUpvoteRecords(builderUsername: string): UpvoteRecord[] {
    const key = `upvotes:${this.level}:${builderUsername}`;
    const stored = localStorage.getItem(key);

    if (!stored) return [];

    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  /**
   * Record an upvote in localStorage
   */
  private recordUpvote(builderUsername: string): void {
    const key = `upvotes:${this.level}:${builderUsername}`;
    const records = this.getUpvoteRecords(builderUsername);

    records.push({ timestamp: Date.now() });

    // Clean up old records (older than 1 day)
    const recentRecords = records.filter(
      (r) => Date.now() - r.timestamp < this.DAY_MS
    );

    localStorage.setItem(key, JSON.stringify(recentRecords));
  }

  /**
   * Get remaining cooldown time in seconds
   */
  getRemainingCooldown(builderUsername: string): number {
    const records = this.getUpvoteRecords(builderUsername);

    if (records.length === 0) return 0;

    const lastUpvote = records[records.length - 1];
    if (lastUpvote) {
      const timeSinceLastUpvote = Date.now() - lastUpvote.timestamp;

      if (timeSinceLastUpvote >= this.COOLDOWN_MS) return 0;

      return Math.ceil((this.COOLDOWN_MS - timeSinceLastUpvote) / 1000);
    }
    return 0;
  }

  /**
   * Get remaining upvotes for today
   */
  getRemainingUpvotes(builderUsername: string): number {
    const records = this.getUpvoteRecords(builderUsername);
    const recentUpvotes = records.filter(
      (r) => Date.now() - r.timestamp < this.DAY_MS
    );

    return Math.max(0, this.MAX_UPVOTES_PER_DAY - recentUpvotes.length);
  }
}
