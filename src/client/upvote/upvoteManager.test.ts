/**
 * Tests for UpvoteManager
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { UpvoteManager } from "./upvoteManager";
import { PlayerModeManager } from "../player/playerModeManager";

// Mock localStorage for Node.js environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

global.localStorage = localStorageMock as any;

// Mock fetch for Node.js environment
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ ok: true }),
  } as Response)
);

// Mock alert for Node.js environment
global.alert = vi.fn();

describe("UpvoteManager", () => {
  let upvoteManager: UpvoteManager;
  let playerModeManager: PlayerModeManager;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();

    // Create a mock PlayerModeManager
    playerModeManager = new PlayerModeManager();
    playerModeManager.initialize({
      mode: "player",
      username: "TestPlayer",
      sessionId: "test-session",
      level: "test-level",
      terrainSeeds: { seed: 12345 },
      spawnPosition: { x: 0, y: 20, z: 0 },
      initialChunks: [],
      players: [],
      playerData: {
        score: 0,
        friends: [],
        friendedBy: [],
      },
    });

    upvoteManager = new UpvoteManager("test-level", playerModeManager);
  });

  describe("canUpvote", () => {
    it("should prevent self-upvote", () => {
      const result = upvoteManager.canUpvote("TestPlayer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("cannot upvote yourself");
    });

    it("should prevent upvote in viewer mode", () => {
      // Reinitialize in viewer mode
      playerModeManager.initialize({
        mode: "viewer",
        username: "TestPlayer",
        sessionId: "test-session",
        level: "test-level",
        terrainSeeds: { seed: 12345 },
        spawnPosition: { x: 0, y: 20, z: 0 },
        initialChunks: [],
        players: [],
      });

      const result = upvoteManager.canUpvote("OtherPlayer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Viewer Mode");
    });

    it("should allow upvote for different player", () => {
      const result = upvoteManager.canUpvote("OtherPlayer");
      expect(result.allowed).toBe(true);
    });

    it("should enforce cooldown period", async () => {
      // First upvote should succeed
      const result1 = await upvoteManager.upvote("OtherPlayer");
      expect(result1.success).toBe(true);

      // Immediate second upvote should fail
      const result2 = upvoteManager.canUpvote("OtherPlayer");
      expect(result2.allowed).toBe(false);
      expect(result2.reason).toContain("wait");
    });

    it("should enforce daily limit", async () => {
      // Mock Date.now to control time
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      // Perform 5 upvotes (max per day)
      for (let i = 0; i < 5; i++) {
        // Advance time by 2 minutes to bypass cooldown
        vi.spyOn(Date, "now").mockReturnValue(now + i * 120000);
        await upvoteManager.upvote("OtherPlayer");
      }

      // 6th upvote should fail due to daily limit
      vi.spyOn(Date, "now").mockReturnValue(now + 600000);
      const result = upvoteManager.canUpvote("OtherPlayer");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("daily limit");
    });
  });

  describe("getRemainingCooldown", () => {
    it("should return 0 when no upvotes recorded", () => {
      const remaining = upvoteManager.getRemainingCooldown("OtherPlayer");
      expect(remaining).toBe(0);
    });

    it("should return remaining seconds after upvote", async () => {
      await upvoteManager.upvote("OtherPlayer");
      const remaining = upvoteManager.getRemainingCooldown("OtherPlayer");
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(60);
    });
  });

  describe("getRemainingUpvotes", () => {
    it("should return max upvotes when none recorded", () => {
      const remaining = upvoteManager.getRemainingUpvotes("OtherPlayer");
      expect(remaining).toBe(5);
    });

    it("should decrease after each upvote", async () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      await upvoteManager.upvote("OtherPlayer");

      vi.spyOn(Date, "now").mockReturnValue(now + 120000);
      const remaining = upvoteManager.getRemainingUpvotes("OtherPlayer");
      expect(remaining).toBe(4);
    });
  });

  describe("upvote", () => {
    it("should record upvote in localStorage", async () => {
      await upvoteManager.upvote("OtherPlayer");

      const key = "upvotes:test-level:OtherPlayer";
      const stored = localStorage.getItem(key);
      expect(stored).toBeTruthy();

      const records = JSON.parse(stored!);
      expect(records).toHaveLength(1);
      expect(records[0]).toHaveProperty("timestamp");
    });

    it("should clean up old records", async () => {
      const now = Date.now();
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

      // Manually add an old record
      const key = "upvotes:test-level:OtherPlayer";
      localStorage.setItem(key, JSON.stringify([{ timestamp: twoDaysAgo }]));

      // Perform new upvote
      vi.spyOn(Date, "now").mockReturnValue(now);
      await upvoteManager.upvote("OtherPlayer");

      // Old record should be cleaned up
      const stored = localStorage.getItem(key);
      const records = JSON.parse(stored!);
      expect(records).toHaveLength(1);
      expect(records[0].timestamp).toBe(now);
    });
  });
});
