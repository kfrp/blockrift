/**
 * Chunk-based position manager
 * Only sends position updates when player crosses chunk boundaries
 */

import type { Vector3 } from "three";

const CHUNK_SIZE = 24;

interface PositionUpdate {
  username: string;
  level: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    x: number;
    y: number;
  };
}

export class ChunkBasedPositionManager {
  private lastChunk = { x: 0, z: 0 };
  private username: string;
  private level: string;
  private initialized = false;
  private debounceTimer: number | null = null;
  private lastPosition: Vector3 | null = null;
  private lastRotation: { x: number; y: number } | null = null;

  constructor(username: string, level: string) {
    this.username = username;
    this.level = level;
  }

  /**
   * Check if position update should be sent
   * Sends when chunk changes OR after 500ms of no movement
   */
  checkPosition(position: Vector3, rotation: { x: number; y: number }): void {
    const chunkX = Math.floor(position.x / CHUNK_SIZE);
    const chunkZ = Math.floor(position.z / CHUNK_SIZE);

    // Send immediately on first call or when chunk changes
    if (
      !this.initialized ||
      chunkX !== this.lastChunk.x ||
      chunkZ !== this.lastChunk.z
    ) {
      this.sendPosition(position, rotation);
      this.lastChunk = { x: chunkX, z: chunkZ };
      this.initialized = true;

      // Clear any pending debounced update
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
    } else {
      // Within same chunk - debounce the update
      this.lastPosition = position;
      this.lastRotation = rotation;

      // Clear existing timer
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }

      // Set new timer - send after 500ms of no movement
      this.debounceTimer = window.setTimeout(() => {
        if (this.lastPosition && this.lastRotation) {
          this.sendPosition(this.lastPosition, this.lastRotation);
        }
        this.debounceTimer = null;
      }, 500);
    }
  }

  /**
   * Send position update to server
   */
  private async sendPosition(
    position: Vector3,
    rotation: { x: number; y: number }
  ): Promise<void> {
    const update: PositionUpdate = {
      username: this.username,
      level: this.level,
      position: {
        x: Math.round(position.x * 100) / 100,
        y: Math.round(position.y * 100) / 100,
        z: Math.round(position.z * 100) / 100,
      },
      rotation: {
        x: Math.round(rotation.x * 100) / 100,
        y: Math.round(rotation.y * 100) / 100,
      },
    };

    try {
      const response = await fetch(window.ENDPOINTS.POSITION_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });

      if (!response.ok) {
        console.error("Position update failed:", response.statusText);
      }
    } catch (error) {
      console.error("Position update error:", error);
    }
  }

  /**
   * Force send position (for disconnect, etc.)
   */
  forceSend(position: Vector3, rotation: { x: number; y: number }): void {
    // Clear any pending debounced update
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.sendPosition(position, rotation);
  }

  /**
   * Cleanup timers
   */
  destroy(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
