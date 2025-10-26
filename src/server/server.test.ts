import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "redis";
import {
  generateUsername,
  getChunkCoordinates,
  getChunkKey,
  getBlockKey,
  CHUNK_SIZE,
} from "./server-utils";

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
