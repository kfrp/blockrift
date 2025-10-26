import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ChunkStateManager } from "./chunkStateManager";
import Block from "./mesh/block";
import type { BlockType } from "./terrain/index";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
});

// Mock fetch
global.fetch = vi.fn();

// Mock window object for setTimeout/clearTimeout
Object.defineProperty(global, "window", {
  value: {
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  },
  writable: true,
});

// Mock WebSocket connection
const mockConnection = {
  ws: {
    send: vi.fn(),
  },
};

describe("ChunkStateManager", () => {
  let manager: ChunkStateManager;
  const drawDistance = 3;

  beforeEach(() => {
    manager = new ChunkStateManager(drawDistance);
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe("Chunk Key Generation", () => {
    it("should generate consistent chunk keys", () => {
      // Store a chunk and verify we can retrieve it
      const blocks: Block[] = [];
      manager.storeChunk(5, 10, blocks);

      expect(manager.isChunkLoaded(5, 10)).toBe(true);
      expect(manager.getChunkBlocks(5, 10)).toEqual(blocks);
    });

    it("should generate unique keys for different chunks", () => {
      const blocks1: Block[] = [
        new Block(1, 1, 1, 0 as BlockType, true, "Player1"),
      ];
      const blocks2: Block[] = [
        new Block(2, 2, 2, 1 as BlockType, true, "Player2"),
      ];

      manager.storeChunk(0, 0, blocks1);
      manager.storeChunk(1, 1, blocks2);

      expect(manager.isChunkLoaded(0, 0)).toBe(true);
      expect(manager.isChunkLoaded(1, 1)).toBe(true);
      expect(manager.getChunkBlocks(0, 0)).toEqual(blocks1);
      expect(manager.getChunkBlocks(1, 1)).toEqual(blocks2);
    });

    it("should handle negative chunk coordinates", () => {
      const blocks: Block[] = [];
      manager.storeChunk(-5, -10, blocks);

      expect(manager.isChunkLoaded(-5, -10)).toBe(true);
      expect(manager.getChunkBlocks(-5, -10)).toEqual(blocks);
    });
  });

  describe("Region Coordinate Calculation", () => {
    it("should calculate correct regions for chunks in region (0,0)", () => {
      // Chunks 0-4 should be in region (0,0)
      const regions = manager.getRequiredRegions(2, 2);

      // With draw distance 3, state buffer is 6
      // Player at chunk (2,2) should cover chunks from (-4,-4) to (8,8)
      // This spans regions (-1,-1) to (1,1) = 3x3 = 9 regions
      expect(regions.length).toBe(9);

      // Check that region (0,0) is included
      expect(regions.some((r) => r.regionX === 0 && r.regionZ === 0)).toBe(
        true
      );
    });

    it("should calculate correct regions for chunks in region (1,0)", () => {
      // Chunk (7, 2) is in region (1, 0)
      const regions = manager.getRequiredRegions(7, 2);

      // Should include region (1,0)
      expect(regions.some((r) => r.regionX === 1 && r.regionZ === 0)).toBe(
        true
      );
    });

    it("should calculate correct regions for negative chunks", () => {
      // Chunk (-3, -3) is in region (-1, -1)
      const regions = manager.getRequiredRegions(-3, -3);

      // Should include region (-1,-1)
      expect(regions.some((r) => r.regionX === -1 && r.regionZ === -1)).toBe(
        true
      );
    });

    it("should deduplicate regions correctly", () => {
      // Multiple chunks in the same region should only result in one region
      const regions = manager.getRequiredRegions(0, 0);

      // Check for duplicates
      const regionKeys = regions.map((r) => `${r.regionX}_${r.regionZ}`);
      const uniqueKeys = new Set(regionKeys);

      expect(regionKeys.length).toBe(uniqueKeys.size);
    });
  });

  describe("Required Chunks Calculation", () => {
    it("should calculate correct range of chunks", () => {
      // Draw distance 3, state buffer 6
      // Player at (0,0) should require chunks from (-6,-6) to (6,6)
      const chunks = manager.getRequiredChunks(0, 0);

      // Total chunks = (6*2 + 1)^2 = 13^2 = 169
      expect(chunks.length).toBe(169);

      // Check corners
      expect(chunks.some((c) => c.chunkX === -6 && c.chunkZ === -6)).toBe(true);
      expect(chunks.some((c) => c.chunkX === 6 && c.chunkZ === 6)).toBe(true);
      expect(chunks.some((c) => c.chunkX === 0 && c.chunkZ === 0)).toBe(true);
    });

    it("should center chunks around player position", () => {
      const chunks = manager.getRequiredChunks(5, 5);

      // Should include player chunk
      expect(chunks.some((c) => c.chunkX === 5 && c.chunkZ === 5)).toBe(true);

      // Should include chunks at buffer distance
      expect(chunks.some((c) => c.chunkX === -1 && c.chunkZ === -1)).toBe(true);
      expect(chunks.some((c) => c.chunkX === 11 && c.chunkZ === 11)).toBe(true);
    });

    it("should handle negative player positions", () => {
      const chunks = manager.getRequiredChunks(-5, -5);

      expect(chunks.length).toBe(169);
      expect(chunks.some((c) => c.chunkX === -5 && c.chunkZ === -5)).toBe(true);
      expect(chunks.some((c) => c.chunkX === -11 && c.chunkZ === -11)).toBe(
        true
      );
      expect(chunks.some((c) => c.chunkX === 1 && c.chunkZ === 1)).toBe(true);
    });
  });

  describe("Missing Chunks Filtering", () => {
    it("should filter out already loaded chunks", () => {
      // Load some chunks
      manager.storeChunk(0, 0, []);
      manager.storeChunk(1, 1, []);

      const required = [
        { chunkX: 0, chunkZ: 0 },
        { chunkX: 1, chunkZ: 1 },
        { chunkX: 2, chunkZ: 2 },
      ];

      const missing = manager.getMissingChunks(required);

      // Should only return chunk (2,2)
      expect(missing.length).toBe(1);
      expect(missing[0]).toEqual({ chunkX: 2, chunkZ: 2 });
    });

    it("should filter out pending chunks", () => {
      // Mark some chunks as pending
      manager.markPending([
        { chunkX: 0, chunkZ: 0 },
        { chunkX: 1, chunkZ: 1 },
      ]);

      const required = [
        { chunkX: 0, chunkZ: 0 },
        { chunkX: 1, chunkZ: 1 },
        { chunkX: 2, chunkZ: 2 },
      ];

      const missing = manager.getMissingChunks(required);

      // Should only return chunk (2,2)
      expect(missing.length).toBe(1);
      expect(missing[0]).toEqual({ chunkX: 2, chunkZ: 2 });
    });

    it("should return all chunks if none are loaded or pending", () => {
      const required = [
        { chunkX: 0, chunkZ: 0 },
        { chunkX: 1, chunkZ: 1 },
        { chunkX: 2, chunkZ: 2 },
      ];

      const missing = manager.getMissingChunks(required);

      expect(missing.length).toBe(3);
      expect(missing).toEqual(required);
    });

    it("should return empty array if all chunks are loaded", () => {
      const required = [
        { chunkX: 0, chunkZ: 0 },
        { chunkX: 1, chunkZ: 1 },
      ];

      // Load all required chunks
      manager.storeChunk(0, 0, []);
      manager.storeChunk(1, 1, []);

      const missing = manager.getMissingChunks(required);

      expect(missing.length).toBe(0);
    });
  });

  describe("Modification Batching", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      manager.setConnection(mockConnection as any, "TestPlayer", "default");
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should add modifications to batch correctly", () => {
      manager.addModification({ x: 1, y: 2, z: 3 }, 1, "place");
      manager.addModification({ x: 4, y: 5, z: 6 }, 2, "place");

      // Batch should not be sent yet (debounced)
      expect(fetch).not.toHaveBeenCalled();
    });

    it("should send batch after debounce interval", async () => {
      (fetch as any).mockResolvedValueOnce({
        json: async () => ({ ok: true, failedAt: null }),
      });

      manager.addModification({ x: 1, y: 2, z: 3 }, 1, "place");

      // Fast-forward time by debounce interval (1000ms)
      await vi.advanceTimersByTimeAsync(1000);

      // Batch should be sent
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/modifications",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"action":"place"'),
        })
      );
    });

    it("should send batch immediately when batch is full", async () => {
      (fetch as any).mockResolvedValueOnce({
        json: async () => ({ ok: true, failedAt: null }),
      });

      // Add 100 modifications (MAX_BATCH_SIZE)
      for (let i = 0; i < 100; i++) {
        manager.addModification({ x: i, y: 0, z: 0 }, 1, "place");
      }

      // Should send immediately without waiting for debounce
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("should reset debounce timer when new modification is added", async () => {
      (fetch as any).mockResolvedValueOnce({
        json: async () => ({ ok: true, failedAt: null }),
      });

      manager.addModification({ x: 1, y: 2, z: 3 }, 1, "place");

      // Advance time by 500ms
      await vi.advanceTimersByTimeAsync(500);

      // Add another modification (should reset timer)
      manager.addModification({ x: 4, y: 5, z: 6 }, 2, "place");

      // Advance time by another 500ms (total 1000ms from first, but only 500ms from second)
      await vi.advanceTimersByTimeAsync(500);

      // Should not have sent yet
      expect(fetch).not.toHaveBeenCalled();

      // Advance time by another 500ms (1000ms from second modification)
      await vi.advanceTimersByTimeAsync(500);

      // Now it should send
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("should include correct modification data in batch", async () => {
      (fetch as any).mockResolvedValueOnce({
        json: async () => ({ ok: true, failedAt: null }),
      });

      manager.addModification({ x: 10, y: 20, z: 30 }, 5, "place");
      manager.addModification({ x: 40, y: 50, z: 60 }, null, "remove");

      await vi.advanceTimersByTimeAsync(1000);

      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/modifications",
        expect.objectContaining({
          body: expect.stringContaining('"username":"TestPlayer"'),
        })
      );

      const callArgs = (fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.modifications).toHaveLength(2);
      expect(body.modifications[0]).toMatchObject({
        position: { x: 10, y: 20, z: 30 },
        blockType: 5,
        action: "place",
      });
      expect(body.modifications[1]).toMatchObject({
        position: { x: 40, y: 50, z: 60 },
        blockType: null,
        action: "remove",
      });
    });
  });

  describe("Offline Storage and Retrieval", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      manager.setConnection(mockConnection as any, "TestPlayer", "default");
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should store modifications offline when fetch fails", async () => {
      (fetch as any).mockRejectedValueOnce(new Error("Network error"));

      manager.addModification({ x: 1, y: 2, z: 3 }, 1, "place");

      await vi.advanceTimersByTimeAsync(1000);

      // Wait for async operations
      await vi.waitFor(() => {
        const stored = localStorageMock.getItem("offline_mods_default");
        expect(stored).toBeTruthy();
      });

      const stored = localStorageMock.getItem("offline_mods_default");
      const parsed = JSON.parse(stored!);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({
        position: { x: 1, y: 2, z: 3 },
        blockType: 1,
        action: "place",
      });
    });

    it("should retrieve offline modifications from localStorage", async () => {
      // Manually store some offline modifications
      const offlineMods = [
        {
          position: { x: 1, y: 2, z: 3 },
          blockType: 1,
          action: "place",
          clientTimestamp: Date.now(),
        },
        {
          position: { x: 4, y: 5, z: 6 },
          blockType: 2,
          action: "place",
          clientTimestamp: Date.now(),
        },
      ];

      localStorageMock.setItem(
        "offline_mods_default",
        JSON.stringify(offlineMods)
      );

      (fetch as any).mockResolvedValueOnce({
        json: async () => ({ ok: true, failedAt: null }),
      });

      // Sync offline modifications
      await manager.syncOfflineModifications();

      // Should have sent the offline modifications
      expect(fetch).toHaveBeenCalledTimes(1);

      const callArgs = (fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.modifications).toHaveLength(2);
    });

    it("should clear localStorage after successful sync", async () => {
      const offlineMods = [
        {
          position: { x: 1, y: 2, z: 3 },
          blockType: 1,
          action: "place",
          clientTimestamp: Date.now(),
        },
      ];

      localStorageMock.setItem(
        "offline_mods_default",
        JSON.stringify(offlineMods)
      );

      (fetch as any).mockResolvedValueOnce({
        json: async () => ({ ok: true, failedAt: null }),
      });

      await manager.syncOfflineModifications();

      // localStorage should be cleared
      const stored = localStorageMock.getItem("offline_mods_default");
      expect(stored).toBeNull();
    });

    it("should keep failed modifications in localStorage after partial sync", async () => {
      const offlineMods = [
        {
          position: { x: 1, y: 2, z: 3 },
          blockType: 1,
          action: "place",
          clientTimestamp: Date.now(),
        },
        {
          position: { x: 4, y: 5, z: 6 },
          blockType: 2,
          action: "place",
          clientTimestamp: Date.now(),
        },
        {
          position: { x: 7, y: 8, z: 9 },
          blockType: 3,
          action: "place",
          clientTimestamp: Date.now(),
        },
      ];

      localStorageMock.setItem(
        "offline_mods_default",
        JSON.stringify(offlineMods)
      );

      // Validation fails at index 1
      (fetch as any).mockResolvedValueOnce({
        json: async () => ({ ok: false, failedAt: 1 }),
      });

      await manager.syncOfflineModifications();

      // Should keep modifications from index 1 onwards
      const stored = localStorageMock.getItem("offline_mods_default");
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);

      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toMatchObject({
        position: { x: 4, y: 5, z: 6 },
      });
      expect(parsed[1]).toMatchObject({
        position: { x: 7, y: 8, z: 9 },
      });
    });

    it("should append new offline modifications to existing ones", async () => {
      // Store initial offline modifications
      const initialMods = [
        {
          position: { x: 1, y: 2, z: 3 },
          blockType: 1,
          action: "place",
          clientTimestamp: Date.now(),
        },
      ];

      localStorageMock.setItem(
        "offline_mods_default",
        JSON.stringify(initialMods)
      );

      // Trigger a new offline modification
      (fetch as any).mockRejectedValueOnce(new Error("Network error"));

      manager.addModification({ x: 4, y: 5, z: 6 }, 2, "place");

      await vi.advanceTimersByTimeAsync(1000);

      // Wait for async operations
      await vi.waitFor(() => {
        const stored = localStorageMock.getItem("offline_mods_default");
        const parsed = JSON.parse(stored!);
        expect(parsed.length).toBe(2);
      });

      const stored = localStorageMock.getItem("offline_mods_default");
      const parsed = JSON.parse(stored!);

      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toMatchObject({
        position: { x: 1, y: 2, z: 3 },
      });
      expect(parsed[1]).toMatchObject({
        position: { x: 4, y: 5, z: 6 },
      });
    });
  });

  describe("Chunk Unloading", () => {
    it("should unload chunks beyond 3x draw distance", () => {
      // Draw distance 3, unload distance = 3 * 3 = 9
      // Load chunks at various distances
      manager.storeChunk(0, 0, []); // At player position
      manager.storeChunk(5, 5, []); // Within range
      manager.storeChunk(10, 10, []); // Beyond unload distance
      manager.storeChunk(-10, -10, []); // Beyond unload distance

      // Player at (0, 0)
      manager.unloadDistantChunks(0, 0);

      // Chunks at (0,0) and (5,5) should still be loaded
      expect(manager.isChunkLoaded(0, 0)).toBe(true);
      expect(manager.isChunkLoaded(5, 5)).toBe(true);

      // Chunks at (10,10) and (-10,-10) should be unloaded
      expect(manager.isChunkLoaded(10, 10)).toBe(false);
      expect(manager.isChunkLoaded(-10, -10)).toBe(false);
    });

    it("should keep chunks within state buffer + draw distance", () => {
      // State buffer = 6, draw distance = 3, unload distance = 9
      manager.storeChunk(0, 0, []);
      manager.storeChunk(9, 9, []); // Exactly at unload distance
      manager.storeChunk(8, 8, []); // Just within range

      manager.unloadDistantChunks(0, 0);

      // Chunk at (8,8) should be kept
      expect(manager.isChunkLoaded(8, 8)).toBe(true);

      // Chunk at (9,9) should be kept (at boundary)
      expect(manager.isChunkLoaded(9, 9)).toBe(true);
    });

    it("should unload chunks when player moves", () => {
      // Load chunks around origin
      for (let x = -5; x <= 5; x++) {
        for (let z = -5; z <= 5; z++) {
          manager.storeChunk(x, z, []);
        }
      }

      // Player moves to (20, 20)
      manager.unloadDistantChunks(20, 20);

      // Chunks near origin should be unloaded
      expect(manager.isChunkLoaded(0, 0)).toBe(false);
      expect(manager.isChunkLoaded(-5, -5)).toBe(false);

      // Chunks near new position should still be loaded (if they were loaded)
      // Since we didn't load chunks at (20,20), we can't test this directly
      // But we can verify that distant chunks were unloaded
      expect(manager.isChunkLoaded(5, 5)).toBe(false);
    });
  });

  describe("Lifecycle Methods", () => {
    it("should set connection, username, and level", () => {
      manager.setConnection(mockConnection as any, "TestPlayer", "world1");

      // Verify by trying to update subscriptions (should not throw)
      expect(() => manager.updateSubscriptions(0, 0)).not.toThrow();
    });

    it("should clear all state", () => {
      // Set up some state
      manager.storeChunk(0, 0, []);
      manager.storeChunk(1, 1, []);
      manager.markPending([{ chunkX: 2, chunkZ: 2 }]);
      manager.setConnection(mockConnection as any, "TestPlayer", "default");

      // Clear state
      manager.clear();

      // Verify everything is cleared
      expect(manager.isChunkLoaded(0, 0)).toBe(false);
      expect(manager.isChunkLoaded(1, 1)).toBe(false);

      const required = [{ chunkX: 2, chunkZ: 2 }];
      const missing = manager.getMissingChunks(required);
      expect(missing).toHaveLength(1); // Should not be marked as pending anymore
    });

    it("should clear batch timer on clear", () => {
      vi.useFakeTimers();

      manager.setConnection(mockConnection as any, "TestPlayer", "default");
      manager.addModification({ x: 1, y: 2, z: 3 }, 1, "place");

      // Clear before timer fires
      manager.clear();

      // Advance time
      vi.advanceTimersByTime(1000);

      // Fetch should not be called
      expect(fetch).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
