import * as THREE from "three";
import Terrain from "./terrain";
import { PlayerModeManager } from "./playerModeManager";

/**
 * BuilderInfo - Information about a builder in the current region
 */
export interface BuilderInfo {
  username: string;
  blockCount: number;
}

/**
 * BuilderRecognitionManager - Manages builder display and highlighting
 */
export class BuilderRecognitionManager {
  private currentBuilders: BuilderInfo[] = [];
  private highlightedBuilder: string | null = null;
  private terrain: Terrain;
  private playerModeManager: PlayerModeManager;
  private highlightMeshes: THREE.Mesh[] = [];
  private scene: THREE.Scene;

  constructor(
    terrain: Terrain,
    playerModeManager: PlayerModeManager,
    scene: THREE.Scene
  ) {
    this.terrain = terrain;
    this.playerModeManager = playerModeManager;
    this.scene = scene;
  }

  /**
   * Update builders list based on currently loaded chunks
   */
  updateBuilders(): void {
    const currentUsername = this.playerModeManager.getUsername();
    const builderCounts = new Map<string, number>();

    // Count blocks per builder in custom blocks
    for (const block of this.terrain.customBlocks) {
      if (!block.placed) continue; // Skip removed blocks
      if (!block.username) continue; // Skip blocks without username (procedurally generated)

      // Include current player's blocks
      const count = builderCounts.get(block.username) || 0;
      builderCounts.set(block.username, count + 1);
    }

    // Convert to array and sort by block count
    // Current player always appears first, then others sorted by block count
    this.currentBuilders = Array.from(builderCounts.entries())
      .map(([username, blockCount]) => ({ username, blockCount }))
      .sort((a, b) => {
        // Current player always first
        if (a.username === currentUsername) return -1;
        if (b.username === currentUsername) return 1;
        // Others sorted by block count
        return b.blockCount - a.blockCount;
      });

    // Clear highlights if highlighted builder is no longer in list
    if (
      this.highlightedBuilder &&
      !this.currentBuilders.find((b) => b.username === this.highlightedBuilder)
    ) {
      this.clearHighlight();
    }

    // Trigger UI update
    this.renderBuildersUI();
  }

  /**
   * Toggle highlight for a builder's blocks
   */
  toggleBuilderHighlight(username: string): void {
    if (this.highlightedBuilder === username) {
      // Already highlighted, clear it
      this.clearHighlight();
    } else {
      // Highlight this builder
      this.highlightBuilder(username);
    }
  }

  /**
   * Highlight all blocks by a specific builder
   */
  private highlightBuilder(username: string): void {
    this.clearHighlight();

    const blocksToHighlight: THREE.Vector3[] = [];

    for (const block of this.terrain.customBlocks) {
      if (block.placed && block.username === username) {
        blocksToHighlight.push(new THREE.Vector3(block.x, block.y, block.z));
      }
    }

    // Create highlight meshes for each block
    const geometry = new THREE.BoxGeometry(1.02, 1.02, 1.02); // Slightly larger than block
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ffff, // Cyan for builder blocks
      transparent: true,
      opacity: 0.3,
      emissive: 0x00ffff,
      emissiveIntensity: 0.5,
    });

    for (const position of blocksToHighlight) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position.x, position.y, position.z);
      this.scene.add(mesh);
      this.highlightMeshes.push(mesh);
    }

    this.highlightedBuilder = username;
    console.log(
      `BuilderRecognitionManager: Highlighted ${blocksToHighlight.length} blocks by ${username}`
    );
  }

  /**
   * Clear all builder highlights
   */
  clearHighlight(): void {
    if (!this.highlightedBuilder) return;

    // Remove all highlight meshes from scene
    for (const mesh of this.highlightMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    }
    this.highlightMeshes = [];

    this.highlightedBuilder = null;
    console.log("BuilderRecognitionManager: Cleared builder highlights");
  }

  /**
   * Refresh highlights if a builder is currently highlighted
   * Called when blocks are added/removed to keep highlights in sync
   */
  refreshHighlightsIfActive(): void {
    if (this.highlightedBuilder) {
      // Re-highlight the same builder to pick up new/removed blocks
      const username = this.highlightedBuilder;
      this.highlightBuilder(username);
    }
  }

  /**
   * Get current builders list
   */
  getBuilders(): BuilderInfo[] {
    return [...this.currentBuilders];
  }

  /**
   * Get currently highlighted builder
   */
  getHighlightedBuilder(): string | null {
    return this.highlightedBuilder;
  }

  /**
   * Render builders UI (placeholder - integrate with actual UI system)
   */
  private renderBuildersUI(): void {
    // TODO: Integrate with actual UI system
  }
}
