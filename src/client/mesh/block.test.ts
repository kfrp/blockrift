import { describe, it, expect } from "vitest";
import Block from "./block";
import type { BlockType } from "../terrain/index";

// Use numeric values as BlockType for testing (avoiding full terrain import which loads Three.js)
const TestBlockType = {
  grass: 0 as BlockType,
  stone: 1 as BlockType,
  tree: 2 as BlockType,
  wood: 3 as BlockType,
  diamond: 4 as BlockType,
  quartz: 5 as BlockType,
  glass: 6 as BlockType,
  sand: 7 as BlockType,
  coal: 8 as BlockType,
  iron: 9 as BlockType,
  bedrock: 10 as BlockType,
};

describe("Block Class - Optimistic Updates", () => {
  describe("Constructor with username and timestamp", () => {
    it("should create a block with username and timestamp", () => {
      const username = "Player123";
      const timestamp = Date.now();
      const block = new Block(
        10,
        5,
        3,
        TestBlockType.grass,
        true,
        username,
        timestamp
      );

      expect(block.x).toBe(10);
      expect(block.y).toBe(5);
      expect(block.z).toBe(3);
      expect(block.type).toBe(TestBlockType.grass);
      expect(block.placed).toBe(true);
      expect(block.username).toBe(username);
      expect(block.timestamp).toBe(timestamp);
    });

    it("should create a block with default username and timestamp", () => {
      const block = new Block(10, 5, 3, TestBlockType.stone, false);

      expect(block.x).toBe(10);
      expect(block.y).toBe(5);
      expect(block.z).toBe(3);
      expect(block.type).toBe(TestBlockType.stone);
      expect(block.placed).toBe(false);
      expect(block.username).toBe("");
      expect(block.timestamp).toBeDefined();
      expect(typeof block.timestamp).toBe("number");
    });

    it("should track block placement with username", () => {
      const username = "TestPlayer";
      const block = new Block(0, 0, 0, TestBlockType.diamond, true, username);

      expect(block.placed).toBe(true);
      expect(block.username).toBe(username);
    });

    it("should track block removal with username", () => {
      const username = "TestPlayer";
      const block = new Block(0, 0, 0, TestBlockType.grass, false, username);

      expect(block.placed).toBe(false);
      expect(block.username).toBe(username);
    });

    it("should have timestamp for conflict resolution", () => {
      const timestamp1 = Date.now();
      const block1 = new Block(
        5,
        5,
        5,
        TestBlockType.wood,
        true,
        "Player1",
        timestamp1
      );

      // Wait a tiny bit
      const timestamp2 = Date.now();
      const block2 = new Block(
        5,
        5,
        5,
        TestBlockType.stone,
        true,
        "Player2",
        timestamp2
      );

      expect(block1.timestamp).toBeLessThanOrEqual(block2.timestamp);
    });
  });
});
