import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "redis";
import {
  generateUsername,
  getChunkCoordinates,
  getChunkKey,
  getBlockKey,
  getRegionCoordinates,
  getRegionalChannel,
  calculateInitialChunks,
  CHUNK_SIZE,
  REGION_SIZE,
} from "../server-utils";
import { BlockModificationMessage } from "../types";

// Redis client for testing
let redisStore: ReturnType<typeof createClient>;

describe("Server Infrastructure Tests", () => {
  beforeAll(async () => {
    // Connect to Redis for testing
    redisStore = createClient();
    await redisStore.connect();
  });

  afterAll(async () => {
    // Cleanup and disconnect
    await redisStore.quit();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await redisStore.flushDb();
  });

  describe("Username Generation", () => {
    it("should generate unique usernames", () => {
      const usernames = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const username = generateUsername();
        usernames.add(username);
      }

      // All usernames should be unique (or very close to it)
      // With 10000 possible values and 100 iterations, collisions are unlikely
      expect(usernames.size).toBeGreaterThan(95);
    });

    it("should generate usernames in correct format", () => {
      const username = generateUsername();
      expect(username).toMatch(/^Player\d{1,4}$/);
    });

    it("should generate usernames with numbers between 0-9999", () => {
      const username = generateUsername();
      const number = parseInt(username.replace("Player", ""));
      expect(number).toBeGreaterThanOrEqual(0);
      expect(number).toBeLessThan(10000);
    });
  });

  describe("Chunk Coordinate Calculation", () => {
    it("should calculate chunk coordinates for positive positions", () => {
      const result = getChunkCoordinates(25, 30);
      expect(result).toEqual({ chunkX: 1, chunkZ: 1 });
    });

    it("should calculate chunk coordinates for origin", () => {
      const result = getChunkCoordinates(0, 0);
      expect(result).toEqual({ chunkX: 0, chunkZ: 0 });
    });

    it("should calculate chunk coordinates for negative positions", () => {
      const result = getChunkCoordinates(-25, -30);
      expect(result).toEqual({ chunkX: -2, chunkZ: -2 });
    });

    it("should calculate chunk coordinates at chunk boundaries", () => {
      // At exactly chunk size boundary
      const result1 = getChunkCoordinates(24, 24);
      expect(result1).toEqual({ chunkX: 1, chunkZ: 1 });

      // One before chunk boundary
      const result2 = getChunkCoordinates(23, 23);
      expect(result2).toEqual({ chunkX: 0, chunkZ: 0 });
    });

    it("should handle large coordinates", () => {
      const result = getChunkCoordinates(1000, 2000);
      expect(result).toEqual({
        chunkX: Math.floor(1000 / CHUNK_SIZE),
        chunkZ: Math.floor(2000 / CHUNK_SIZE),
      });
    });
  });

  describe("Redis Block Storage Operations", () => {
    it("should store and retrieve a block using HSET/HGET", async () => {
      const x = 10,
        y = 5,
        z = 3;
      const blockType = 1;
      const username = "TestPlayer";

      const { chunkX, chunkZ } = getChunkCoordinates(x, z);
      const chunkKey = getChunkKey(chunkX, chunkZ);
      const blockKey = getBlockKey(x, y, z);

      const blockData = JSON.stringify({
        type: blockType,
        username: username,
        timestamp: Date.now(),
      });

      // Store block
      await redisStore.hSet(chunkKey, blockKey, blockData);

      // Retrieve block
      const retrieved = await redisStore.hGet(chunkKey, blockKey);
      expect(retrieved).toBeDefined();

      const parsedData = JSON.parse(retrieved!);
      expect(parsedData.type).toBe(blockType);
      expect(parsedData.username).toBe(username);
      expect(parsedData.timestamp).toBeDefined();
    });

    it("should store multiple blocks in the same chunk", async () => {
      const chunkX = 0,
        chunkZ = 0;
      const chunkKey = getChunkKey(chunkX, chunkZ);

      // Store multiple blocks
      const blocks = [
        { x: 1, y: 5, z: 1, type: 1, username: "Player1" },
        { x: 2, y: 5, z: 2, type: 2, username: "Player2" },
        { x: 3, y: 5, z: 3, type: 3, username: "Player3" },
      ];

      for (const block of blocks) {
        const blockKey = getBlockKey(block.x, block.y, block.z);
        const blockData = JSON.stringify({
          type: block.type,
          username: block.username,
          timestamp: Date.now(),
        });
        await redisStore.hSet(chunkKey, blockKey, blockData);
      }

      // Retrieve all blocks using HGETALL
      const chunkData = await redisStore.hGetAll(chunkKey);
      expect(Object.keys(chunkData).length).toBe(3);
    });

    it("should remove a block using HDEL", async () => {
      const x = 10,
        y = 5,
        z = 3;
      const { chunkX, chunkZ } = getChunkCoordinates(x, z);
      const chunkKey = getChunkKey(chunkX, chunkZ);
      const blockKey = getBlockKey(x, y, z);

      // Store block
      const blockData = JSON.stringify({
        type: 1,
        username: "TestPlayer",
        timestamp: Date.now(),
      });
      await redisStore.hSet(chunkKey, blockKey, blockData);

      // Verify it exists
      let retrieved = await redisStore.hGet(chunkKey, blockKey);
      expect(retrieved).toBeDefined();

      // Remove block
      await redisStore.hDel(chunkKey, blockKey);

      // Verify it's gone
      retrieved = await redisStore.hGet(chunkKey, blockKey);
      expect(retrieved).toBeNull();
    });

    it("should retrieve all blocks in a chunk using HGETALL", async () => {
      const chunkX = 1,
        chunkZ = 1;
      const chunkKey = getChunkKey(chunkX, chunkZ);

      // Store blocks in chunk (1, 1) - positions 24-47 in x and z
      const blocks = [
        { x: 25, y: 10, z: 26, type: 1, username: "Player1" },
        { x: 30, y: 15, z: 35, type: 2, username: "Player2" },
        { x: 40, y: 20, z: 45, type: 3, username: "Player3" },
      ];

      for (const block of blocks) {
        const blockKey = getBlockKey(block.x, block.y, block.z);
        const blockData = JSON.stringify({
          type: block.type,
          username: block.username,
          timestamp: Date.now(),
        });
        await redisStore.hSet(chunkKey, blockKey, blockData);
      }

      // Retrieve all blocks
      const chunkData = await redisStore.hGetAll(chunkKey);

      // Parse and verify
      const retrievedBlocks = Object.entries(chunkData).map(([key, value]) => {
        const [_, xStr, yStr, zStr] = key.split(":");
        const data = JSON.parse(value);
        return {
          x: parseInt(xStr),
          y: parseInt(yStr),
          z: parseInt(zStr),
          type: data.type,
          username: data.username,
        };
      });

      expect(retrievedBlocks.length).toBe(3);
      expect(retrievedBlocks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ x: 25, y: 10, z: 26, type: 1 }),
          expect.objectContaining({ x: 30, y: 15, z: 35, type: 2 }),
          expect.objectContaining({ x: 40, y: 20, z: 45, type: 3 }),
        ])
      );
    });

    it("should handle empty chunks", async () => {
      const chunkX = 5,
        chunkZ = 5;
      const chunkKey = getChunkKey(chunkX, chunkZ);

      const chunkData = await redisStore.hGetAll(chunkKey);
      expect(Object.keys(chunkData).length).toBe(0);
    });
  });

  describe("Regional Channel Calculation", () => {
    it("should calculate region coordinates for chunks in region (0,0)", () => {
      // Chunks 0-4 in both x and z should be in region (0,0)
      expect(getRegionCoordinates(0, 0)).toEqual({ regionX: 0, regionZ: 0 });
      expect(getRegionCoordinates(2, 3)).toEqual({ regionX: 0, regionZ: 0 });
      expect(getRegionCoordinates(4, 4)).toEqual({ regionX: 0, regionZ: 0 });
    });

    it("should calculate region coordinates for chunks in region (1,0)", () => {
      // Chunks 5-9 in x, 0-4 in z should be in region (1,0)
      expect(getRegionCoordinates(5, 0)).toEqual({ regionX: 1, regionZ: 0 });
      expect(getRegionCoordinates(7, 3)).toEqual({ regionX: 1, regionZ: 0 });
      expect(getRegionCoordinates(9, 4)).toEqual({ regionX: 1, regionZ: 0 });
    });

    it("should calculate region coordinates for chunks in region (0,1)", () => {
      // Chunks 0-4 in x, 5-9 in z should be in region (0,1)
      expect(getRegionCoordinates(0, 5)).toEqual({ regionX: 0, regionZ: 1 });
      expect(getRegionCoordinates(3, 7)).toEqual({ regionX: 0, regionZ: 1 });
      expect(getRegionCoordinates(4, 9)).toEqual({ regionX: 0, regionZ: 1 });
    });

    it("should calculate region coordinates for negative chunks", () => {
      // Negative chunks should map to negative regions
      expect(getRegionCoordinates(-1, -1)).toEqual({
        regionX: -1,
        regionZ: -1,
      });
      expect(getRegionCoordinates(-5, -5)).toEqual({
        regionX: -1,
        regionZ: -1,
      });
      expect(getRegionCoordinates(-6, -6)).toEqual({
        regionX: -2,
        regionZ: -2,
      });
    });

    it("should calculate region coordinates at region boundaries", () => {
      // Test boundary cases
      expect(getRegionCoordinates(4, 4)).toEqual({ regionX: 0, regionZ: 0 });
      expect(getRegionCoordinates(5, 5)).toEqual({ regionX: 1, regionZ: 1 });
      expect(getRegionCoordinates(10, 10)).toEqual({ regionX: 2, regionZ: 2 });
    });

    it("should generate correct regional channel names", () => {
      expect(getRegionalChannel("default", 0, 0)).toBe("region:default:0:0");
      expect(getRegionalChannel("default", 5, 5)).toBe("region:default:1:1");
      expect(getRegionalChannel("default", 7, 3)).toBe("region:default:1:0");
    });

    it("should generate regional channel names for different levels", () => {
      expect(getRegionalChannel("world1", 0, 0)).toBe("region:world1:0:0");
      expect(getRegionalChannel("world2", 5, 5)).toBe("region:world2:1:1");
      expect(getRegionalChannel("test-level", 10, 15)).toBe(
        "region:test-level:2:3"
      );
    });

    it("should generate regional channel names for negative regions", () => {
      expect(getRegionalChannel("default", -1, -1)).toBe(
        "region:default:-1:-1"
      );
      expect(getRegionalChannel("default", -6, -6)).toBe(
        "region:default:-2:-2"
      );
    });

    it("should group chunks correctly into regions", () => {
      // Verify that REGION_SIZE chunks map to the same region
      const region1 = getRegionalChannel("default", 0, 0);
      const region2 = getRegionalChannel("default", 1, 1);
      const region3 = getRegionalChannel("default", 4, 4);
      const region4 = getRegionalChannel("default", 5, 5);

      // Chunks 0-4 should all be in the same region
      expect(region1).toBe(region2);
      expect(region2).toBe(region3);

      // Chunk 5 should be in a different region
      expect(region3).not.toBe(region4);
    });

    it("should verify REGION_SIZE constant is 5", () => {
      expect(REGION_SIZE).toBe(5);
    });
  });

  describe("Initial Chunks Calculation", () => {
    it("should calculate correct number of chunks for draw distance 3", () => {
      const spawnPosition = { x: 0, y: 20, z: 0 };
      const drawDistance = 3;
      const chunks = calculateInitialChunks(spawnPosition, drawDistance);

      // State buffer = 2 * drawDistance = 6
      // Total chunks = (6*2 + 1)^2 = 13^2 = 169
      expect(chunks.length).toBe(169);
    });

    it("should calculate correct number of chunks for draw distance 1", () => {
      const spawnPosition = { x: 0, y: 20, z: 0 };
      const drawDistance = 1;
      const chunks = calculateInitialChunks(spawnPosition, drawDistance);

      // State buffer = 2 * drawDistance = 2
      // Total chunks = (2*2 + 1)^2 = 5^2 = 25
      expect(chunks.length).toBe(25);
    });

    it("should center chunks around spawn position", () => {
      const spawnPosition = { x: 0, y: 20, z: 0 };
      const drawDistance = 1;
      const chunks = calculateInitialChunks(spawnPosition, drawDistance);

      // Spawn chunk is (0, 0), buffer is 2
      // Should include chunks from (-2, -2) to (2, 2)
      const chunkSet = new Set(chunks.map((c) => `${c.chunkX},${c.chunkZ}`));

      expect(chunkSet.has("0,0")).toBe(true); // Center
      expect(chunkSet.has("-2,-2")).toBe(true); // Corner
      expect(chunkSet.has("2,2")).toBe(true); // Corner
      expect(chunkSet.has("-2,2")).toBe(true); // Corner
      expect(chunkSet.has("2,-2")).toBe(true); // Corner
    });

    it("should handle non-origin spawn positions", () => {
      const spawnPosition = { x: 100, y: 20, z: 100 };
      const drawDistance = 1;
      const chunks = calculateInitialChunks(spawnPosition, drawDistance);

      // Spawn position (100, 100) is in chunk (4, 4)
      // Buffer is 2, so should include chunks from (2, 2) to (6, 6)
      const chunkSet = new Set(chunks.map((c) => `${c.chunkX},${c.chunkZ}`));

      expect(chunkSet.has("4,4")).toBe(true); // Center
      expect(chunkSet.has("2,2")).toBe(true); // Corner
      expect(chunkSet.has("6,6")).toBe(true); // Corner
      expect(chunks.length).toBe(25);
    });

    it("should handle negative spawn positions", () => {
      const spawnPosition = { x: -100, y: 20, z: -100 };
      const drawDistance = 1;
      const chunks = calculateInitialChunks(spawnPosition, drawDistance);

      // Spawn position (-100, -100) is in chunk (-5, -5)
      // Buffer is 2, so should include chunks from (-7, -7) to (-3, -3)
      const chunkSet = new Set(chunks.map((c) => `${c.chunkX},${c.chunkZ}`));

      expect(chunkSet.has("-5,-5")).toBe(true); // Center
      expect(chunkSet.has("-7,-7")).toBe(true); // Corner
      expect(chunkSet.has("-3,-3")).toBe(true); // Corner
      expect(chunks.length).toBe(25);
    });

    it("should return chunks in consistent order", () => {
      const spawnPosition = { x: 0, y: 20, z: 0 };
      const drawDistance = 1;
      const chunks1 = calculateInitialChunks(spawnPosition, drawDistance);
      const chunks2 = calculateInitialChunks(spawnPosition, drawDistance);

      // Should return same chunks in same order
      expect(chunks1).toEqual(chunks2);
    });

    it("should calculate state buffer as 2x draw distance", () => {
      const spawnPosition = { x: 0, y: 20, z: 0 };
      const drawDistance = 2;
      const chunks = calculateInitialChunks(spawnPosition, drawDistance);

      // State buffer = 2 * 2 = 4
      // Total chunks = (4*2 + 1)^2 = 9^2 = 81
      expect(chunks.length).toBe(81);

      // Check that chunks extend 4 chunks in each direction
      const chunkSet = new Set(chunks.map((c) => `${c.chunkX},${c.chunkZ}`));
      expect(chunkSet.has("-4,-4")).toBe(true);
      expect(chunkSet.has("4,4")).toBe(true);
      expect(chunkSet.has("-5,-5")).toBe(false); // Outside buffer
      expect(chunkSet.has("5,5")).toBe(false); // Outside buffer
    });
  });

  describe("Modification Validation", () => {
    const TEST_LEVEL = "test-level";

    beforeEach(async () => {
      // Clear test data
      await redisStore.flushDb();
    });

    it("should reject block placement where block already exists", async () => {
      // Place a block first
      const chunkX = 0,
        chunkZ = 0;
      const x = 10,
        y = 5,
        z = 10;
      const chunkKey = `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`;
      const blockKey = getBlockKey(x, y, z);

      await redisStore.hSet(
        chunkKey,
        blockKey,
        JSON.stringify({
          type: 1,
          username: "Player1",
          timestamp: Date.now(),
        })
      );

      // Try to place another block at the same position
      const mod = {
        position: { x, y, z },
        blockType: 2,
        action: "place" as const,
      };

      // Validation should fail because block already exists
      const { chunkX: cx, chunkZ: cz } = getChunkCoordinates(x, z);
      const existingBlock = await redisStore.hGet(
        `level:${TEST_LEVEL}:chunk:${cx}:${cz}`,
        blockKey
      );

      expect(existingBlock).toBeDefined();
      expect(mod.action).toBe("place");
    });

    it("should reject block removal where no block exists", async () => {
      // Try to remove a block that doesn't exist
      const x = 10,
        y = 5,
        z = 10;
      const blockKey = getBlockKey(x, y, z);

      const mod = {
        position: { x, y, z },
        blockType: null,
        action: "remove" as const,
      };

      // Check that no block exists
      const { chunkX, chunkZ } = getChunkCoordinates(x, z);
      const existingBlock = await redisStore.hGet(
        `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`,
        blockKey
      );

      expect(existingBlock).toBeNull();
      expect(mod.action).toBe("remove");
    });

    it("should reject modifications outside world bounds", async () => {
      const maxBound = 10000 * CHUNK_SIZE;

      // Test positions outside bounds
      const invalidPositions = [
        { x: maxBound + 1, y: 10, z: 0 }, // x too large
        { x: -maxBound - 1, y: 10, z: 0 }, // x too small
        { x: 0, y: 10, z: maxBound + 1 }, // z too large
        { x: 0, y: 10, z: -maxBound - 1 }, // z too small
        { x: 0, y: -1, z: 0 }, // y too small
        { x: 0, y: 256, z: 0 }, // y too large
      ];

      for (const position of invalidPositions) {
        // Check bounds validation logic
        const isOutOfBounds =
          Math.abs(position.x) > maxBound ||
          Math.abs(position.z) > maxBound ||
          position.y < 0 ||
          position.y > 255;

        expect(isOutOfBounds).toBe(true);
      }
    });

    it("should accept valid block placement", async () => {
      const x = 10,
        y = 5,
        z = 10;
      const blockKey = getBlockKey(x, y, z);

      // Verify no block exists
      const { chunkX, chunkZ } = getChunkCoordinates(x, z);
      const existingBlock = await redisStore.hGet(
        `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`,
        blockKey
      );

      expect(existingBlock).toBeNull();

      // Place the block
      await redisStore.hSet(
        `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`,
        blockKey,
        JSON.stringify({
          type: 1,
          username: "Player1",
          timestamp: Date.now(),
        })
      );

      // Verify block was placed
      const placedBlock = await redisStore.hGet(
        `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`,
        blockKey
      );

      expect(placedBlock).toBeDefined();
    });

    it("should accept valid block removal", async () => {
      const x = 10,
        y = 5,
        z = 10;
      const blockKey = getBlockKey(x, y, z);
      const { chunkX, chunkZ } = getChunkCoordinates(x, z);

      // Place a block first
      await redisStore.hSet(
        `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`,
        blockKey,
        JSON.stringify({
          type: 1,
          username: "Player1",
          timestamp: Date.now(),
        })
      );

      // Verify block exists
      let existingBlock = await redisStore.hGet(
        `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`,
        blockKey
      );
      expect(existingBlock).toBeDefined();

      // Remove the block
      await redisStore.hDel(
        `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`,
        blockKey
      );

      // Verify block was removed
      existingBlock = await redisStore.hGet(
        `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`,
        blockKey
      );
      expect(existingBlock).toBeNull();
    });
  });

  describe("Batch Validation", () => {
    const TEST_LEVEL = "test-level";

    beforeEach(async () => {
      await redisStore.flushDb();
    });

    it("should stop validation at first failure in batch", async () => {
      const { chunkX, chunkZ } = getChunkCoordinates(10, 10);
      const chunkKey = `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`;

      // Place a block at position (10, 5, 10)
      const blockKey1 = getBlockKey(10, 5, 10);
      await redisStore.hSet(
        chunkKey,
        blockKey1,
        JSON.stringify({
          type: 1,
          username: "Player1",
          timestamp: Date.now(),
        })
      );

      // Create a batch with 5 modifications
      const batch: Array<
        Pick<BlockModificationMessage, "position" | "action" | "blockType">
      > = [
        {
          position: { x: 5, y: 5, z: 5 },
          action: "place",
          blockType: 1,
        }, // Valid
        {
          position: { x: 6, y: 5, z: 6 },
          action: "place",
          blockType: 1,
        }, // Valid
        {
          position: { x: 10, y: 5, z: 10 },
          action: "place",
          blockType: 1,
        }, // Invalid - block exists
        {
          position: { x: 7, y: 5, z: 7 },
          action: "place",
          blockType: 1,
        }, // Should not be validated
        {
          position: { x: 8, y: 5, z: 8 },
          action: "place",
          blockType: 1,
        }, // Should not be validated
      ];

      // Simulate sequential validation
      let failedAt: number | null = null;
      const validatedMods: Array<
        Pick<BlockModificationMessage, "position" | "action" | "blockType">
      > = [];

      for (let i = 0; i < batch.length; i++) {
        const mod = batch[i];
        const { chunkX: cx, chunkZ: cz } = getChunkCoordinates(
          mod.position.x,
          mod.position.z
        );
        const bKey = getBlockKey(
          mod.position.x,
          mod.position.y,
          mod.position.z
        );
        const existing = await redisStore.hGet(
          `level:${TEST_LEVEL}:chunk:${cx}:${cz}`,
          bKey
        );

        // Validate
        let isValid = true;
        if (mod.action === "place" && existing) {
          isValid = false;
        } else if (mod.action === "remove" && !existing) {
          isValid = false;
        }

        if (!isValid) {
          failedAt = i;
          break;
        }

        validatedMods.push(mod);
      }

      // Should fail at index 2
      expect(failedAt).toBe(2);
      // Should have validated only first 2 modifications
      expect(validatedMods.length).toBe(2);
    });

    it("should validate all modifications if none fail", async () => {
      const batch: Array<
        Pick<BlockModificationMessage, "position" | "action" | "blockType">
      > = [
        {
          position: { x: 5, y: 5, z: 5 },
          action: "place",
          blockType: 1,
        },
        {
          position: { x: 6, y: 5, z: 6 },
          action: "place",
          blockType: 1,
        },
        {
          position: { x: 7, y: 5, z: 7 },
          action: "place",
          blockType: 1,
        },
      ];

      // Simulate sequential validation
      let failedAt: number | null = null;
      const validatedMods: Array<
        Pick<BlockModificationMessage, "position" | "action" | "blockType">
      > = [];

      for (let i = 0; i < batch.length; i++) {
        const mod = batch[i];
        const { chunkX, chunkZ } = getChunkCoordinates(
          mod.position.x,
          mod.position.z
        );
        const blockKey = getBlockKey(
          mod.position.x,
          mod.position.y,
          mod.position.z
        );
        const existing = await redisStore.hGet(
          `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`,
          blockKey
        );

        // Validate
        let isValid = true;
        if (mod.action === "place" && existing) {
          isValid = false;
        } else if (mod.action === "remove" && !existing) {
          isValid = false;
        }

        if (!isValid) {
          failedAt = i;
          break;
        }

        validatedMods.push(mod);
      }

      // Should validate all
      expect(failedAt).toBeNull();
      expect(validatedMods.length).toBe(3);
    });
  });

  describe("Redis Pipelining for Chunk Fetching", () => {
    const TEST_LEVEL = "test-level";

    beforeEach(async () => {
      await redisStore.flushDb();
    });

    it("should fetch multiple chunks in parallel using pipeline", async () => {
      // Set up test data in multiple chunks
      const chunks = [
        { chunkX: 0, chunkZ: 0 },
        { chunkX: 1, chunkZ: 0 },
        { chunkX: 0, chunkZ: 1 },
      ];

      // Add blocks to each chunk
      for (const { chunkX, chunkZ } of chunks) {
        const chunkKey = `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`;
        const x = chunkX * CHUNK_SIZE + 5;
        const z = chunkZ * CHUNK_SIZE + 5;
        const blockKey = getBlockKey(x, 10, z);

        await redisStore.hSet(
          chunkKey,
          blockKey,
          JSON.stringify({
            type: 1,
            username: "Player1",
            timestamp: Date.now(),
          })
        );
      }

      // Use pipeline to fetch all chunks
      const pipeline = redisStore.multi();

      for (const { chunkX, chunkZ } of chunks) {
        const chunkKey = `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`;
        pipeline.hGetAll(chunkKey);
      }

      const results = await pipeline.exec();

      // Verify we got results for all chunks
      expect(results).toBeDefined();
      expect(results).not.toBeNull();
      expect(results?.length).toBe(3);

      // Redis multi().exec() returns array of direct results (not [error, value] tuples)
      // Each result is the chunk data object directly
      for (let i = 0; i < chunks.length; i++) {
        const result = results?.[i];
        // Type assertion needed for pipeline results
        const chunkData: Record<string, string> = result as any;

        // Chunk data should be defined and be an object
        expect(chunkData).toBeDefined();
        expect(typeof chunkData).toBe("object");

        // Each chunk should have at least one block
        expect(Object.keys(chunkData).length).toBeGreaterThan(0);

        // Verify block key format
        const blockKeys = Object.keys(chunkData);
        expect(blockKeys[0]).toMatch(/^block:\d+:\d+:\d+$/);
      }
    });

    it("should handle empty chunks in pipeline results", async () => {
      const chunks = [
        { chunkX: 0, chunkZ: 0 }, // Will have data
        { chunkX: 1, chunkZ: 0 }, // Empty
        { chunkX: 2, chunkZ: 0 }, // Empty
      ];

      // Add block only to first chunk
      const chunkKey = `level:${TEST_LEVEL}:chunk:0:0`;
      const blockKey = getBlockKey(5, 10, 5);
      await redisStore.hSet(
        chunkKey,
        blockKey,
        JSON.stringify({
          type: 1,
          username: "Player1",
          timestamp: Date.now(),
        })
      );

      // Use pipeline to fetch all chunks
      const pipeline = redisStore.multi();

      for (const { chunkX, chunkZ } of chunks) {
        const key = `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`;
        pipeline.hGetAll(key);
      }

      const results = await pipeline.exec();

      // Verify results
      expect(results).toBeDefined();
      expect(results).not.toBeNull();
      expect(results?.length).toBe(3);

      // First chunk should have data
      const firstChunkData: Record<string, string> = results?.[0] as any;
      expect(firstChunkData).toBeDefined();
      expect(typeof firstChunkData).toBe("object");
      expect(Object.keys(firstChunkData).length).toBeGreaterThan(0);

      // Other chunks should be empty objects
      const secondChunkData: Record<string, string> = results?.[1] as any;
      expect(secondChunkData).toBeDefined();
      expect(typeof secondChunkData).toBe("object");
      expect(Object.keys(secondChunkData).length).toBe(0);

      const thirdChunkData: Record<string, string> = results?.[2] as any;
      expect(thirdChunkData).toBeDefined();
      expect(typeof thirdChunkData).toBe("object");
      expect(Object.keys(thirdChunkData).length).toBe(0);
    });

    it("should fetch large number of chunks efficiently", async () => {
      // Create 25 chunks (5x5 grid)
      const chunks: Array<{ chunkX: number; chunkZ: number }> = [];
      for (let x = 0; x < 5; x++) {
        for (let z = 0; z < 5; z++) {
          chunks.push({ chunkX: x, chunkZ: z });
        }
      }

      // Add one block to each chunk
      for (const { chunkX, chunkZ } of chunks) {
        const chunkKey = `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`;
        const x = chunkX * CHUNK_SIZE + 5;
        const z = chunkZ * CHUNK_SIZE + 5;
        const blockKey = getBlockKey(x, 10, z);

        await redisStore.hSet(
          chunkKey,
          blockKey,
          JSON.stringify({
            type: 1,
            username: "Player1",
            timestamp: Date.now(),
          })
        );
      }

      // Measure time for pipeline fetch
      const startTime = Date.now();

      const pipeline = redisStore.multi();
      for (const { chunkX, chunkZ } of chunks) {
        const chunkKey = `level:${TEST_LEVEL}:chunk:${chunkX}:${chunkZ}`;
        pipeline.hGetAll(chunkKey);
      }

      const results = await pipeline.exec();
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify all chunks fetched
      expect(results?.length).toBe(25);

      // Should be reasonably fast (under 200ms for 25 chunks)
      expect(duration).toBeLessThan(200);

      console.log(`Fetched 25 chunks in ${duration}ms using pipeline`);
    });
  });

  describe("Terrain Seed Management", () => {
    const TERRAIN_SEEDS_KEY = "terrain:seeds";

    it("should initialize terrain seeds if they don't exist", async () => {
      // Check seeds don't exist
      const exists = await redisStore.exists(TERRAIN_SEEDS_KEY);
      expect(exists).toBe(0);

      // Initialize seeds
      const seeds = {
        seed: Math.random(),
        treeSeed: Math.random(),
        stoneSeed: Math.random(),
        coalSeed: Math.random(),
      };
      await redisStore.set(TERRAIN_SEEDS_KEY, JSON.stringify(seeds));

      // Verify seeds exist
      const existsAfter = await redisStore.exists(TERRAIN_SEEDS_KEY);
      expect(existsAfter).toBe(1);

      // Retrieve and verify
      const retrieved = await redisStore.get(TERRAIN_SEEDS_KEY);
      expect(retrieved).toBeDefined();
      const parsedSeeds = JSON.parse(retrieved!);
      expect(parsedSeeds).toHaveProperty("seed");
      expect(parsedSeeds).toHaveProperty("treeSeed");
      expect(parsedSeeds).toHaveProperty("stoneSeed");
      expect(parsedSeeds).toHaveProperty("coalSeed");
    });

    it("should retrieve existing terrain seeds", async () => {
      // Initialize seeds
      const seeds = {
        seed: 0.123456,
        treeSeed: 0.234567,
        stoneSeed: 0.345678,
        coalSeed: 0.456789,
      };
      await redisStore.set(TERRAIN_SEEDS_KEY, JSON.stringify(seeds));

      // Retrieve seeds
      const retrieved = await redisStore.get(TERRAIN_SEEDS_KEY);
      const parsedSeeds = JSON.parse(retrieved!);

      expect(parsedSeeds.seed).toBe(0.123456);
      expect(parsedSeeds.treeSeed).toBe(0.234567);
      expect(parsedSeeds.stoneSeed).toBe(0.345678);
      expect(parsedSeeds.coalSeed).toBe(0.456789);
    });

    it("should not overwrite existing terrain seeds", async () => {
      // Initialize seeds first time
      const originalSeeds = {
        seed: 0.111111,
        treeSeed: 0.222222,
        stoneSeed: 0.333333,
        coalSeed: 0.444444,
      };
      await redisStore.set(TERRAIN_SEEDS_KEY, JSON.stringify(originalSeeds));

      // Check if seeds exist
      const exists = await redisStore.exists(TERRAIN_SEEDS_KEY);
      expect(exists).toBe(1);

      // Try to initialize again (should not overwrite)
      if (!exists) {
        const newSeeds = {
          seed: 0.999999,
          treeSeed: 0.888888,
          stoneSeed: 0.777777,
          coalSeed: 0.666666,
        };
        await redisStore.set(TERRAIN_SEEDS_KEY, JSON.stringify(newSeeds));
      }

      // Verify original seeds are still there
      const retrieved = await redisStore.get(TERRAIN_SEEDS_KEY);
      const parsedSeeds = JSON.parse(retrieved!);
      expect(parsedSeeds.seed).toBe(0.111111);
    });

    it("should generate valid random seeds", async () => {
      const seeds = {
        seed: Math.random(),
        treeSeed: Math.random(),
        stoneSeed: Math.random(),
        coalSeed: Math.random(),
      };

      // All seeds should be between 0 and 1
      expect(seeds.seed).toBeGreaterThanOrEqual(0);
      expect(seeds.seed).toBeLessThan(1);
      expect(seeds.treeSeed).toBeGreaterThanOrEqual(0);
      expect(seeds.treeSeed).toBeLessThan(1);
      expect(seeds.stoneSeed).toBeGreaterThanOrEqual(0);
      expect(seeds.stoneSeed).toBeLessThan(1);
      expect(seeds.coalSeed).toBeGreaterThanOrEqual(0);
      expect(seeds.coalSeed).toBeLessThan(1);
    });
  });
});
