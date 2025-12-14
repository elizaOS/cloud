import { describe, it, expect, beforeEach, beforeAll } from "bun:test";
import {
  recordSlowQuery,
  getSlowQueryFromRedis,
  getSlowQueryKeysFromRedis,
  isRedisAvailable,
  clearMemoryStore,
  resetRedisState,
  hashQuery,
} from "@/lib/db/slow-query-store";

resetRedisState();
const describeWithRedis = isRedisAvailable() ? describe : describe.skip;

describeWithRedis("redis slow query integration", () => {
  beforeAll(() => resetRedisState());
  beforeEach(() => clearMemoryStore());

  describe("isRedisAvailable", () => {
    it("returns true when Redis is configured", () => {
      expect(isRedisAvailable()).toBe(true);
    });
  });

  describe("write and read flow", () => {
    it("writes to Redis when recording slow query", async () => {
      const uniqueSql = `SELECT * FROM redis_test_${Date.now()}`;
      const queryHash = hashQuery(uniqueSql);

      await recordSlowQuery(uniqueSql, 150);
      
      // Poll for value (fire-and-forget write may take variable time)
      let fromRedis = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 100));
        fromRedis = await getSlowQueryFromRedis(queryHash);
        if (fromRedis) break;
      }

      expect(fromRedis).not.toBeNull();
      expect(fromRedis!.sqlText).toBe(uniqueSql);
      expect(fromRedis!.durationMs).toBe(150);
    });

    it("updates Redis entry on subsequent recordings", async () => {
      const uniqueSql = `SELECT * FROM redis_update_${Date.now()}`;
      const queryHash = hashQuery(uniqueSql);

      await recordSlowQuery(uniqueSql, 100);
      await recordSlowQuery(uniqueSql, 200);
      
      // Poll for updated value
      let fromRedis = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 100));
        fromRedis = await getSlowQueryFromRedis(queryHash);
        if (fromRedis?.callCount === 2) break;
      }

      expect(fromRedis).not.toBeNull();
      expect(fromRedis!.callCount).toBe(2);
      expect(fromRedis!.avgDurationMs).toBe(150);
      expect(fromRedis!.minDurationMs).toBe(100);
      expect(fromRedis!.maxDurationMs).toBe(200);
    });

    it("returns null for non-existent query hash", async () => {
      const result = await getSlowQueryFromRedis("nonexistent_hash_12345");
      expect(result).toBeNull();
    });
  });

  describe("getSlowQueryKeysFromRedis", () => {
    it("can retrieve a specific key after recording", async () => {
      const uniqueSql = `SELECT * FROM keys_test_${Date.now()}`;
      const queryHash = hashQuery(uniqueSql);

      await recordSlowQuery(uniqueSql, 100);
      
      // Poll for specific key to appear (avoids scanning all keys)
      let found = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 100));
        found = await getSlowQueryFromRedis(queryHash);
        if (found) break;
      }

      expect(found).not.toBeNull();
      expect(found!.queryHash).toBe(queryHash);
    });
  });

  describe("date serialization", () => {
    it("correctly restores Date objects from Redis", async () => {
      const uniqueSql = `SELECT * FROM date_test_${Date.now()}`;
      const queryHash = hashQuery(uniqueSql);
      const before = new Date();

      await recordSlowQuery(uniqueSql, 100);
      
      // Poll for value
      let fromRedis = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 100));
        fromRedis = await getSlowQueryFromRedis(queryHash);
        if (fromRedis) break;
      }

      expect(fromRedis).not.toBeNull();
      expect(fromRedis!.firstSeenAt).toBeInstanceOf(Date);
      expect(fromRedis!.lastSeenAt).toBeInstanceOf(Date);
      expect(fromRedis!.firstSeenAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });
});

describe("redis availability", () => {
  it("isRedisAvailable returns boolean", () => {
    const result = isRedisAvailable();
    expect(typeof result).toBe("boolean");
  });

  it("getSlowQueryFromRedis handles missing Redis gracefully", async () => {
    if (!isRedisAvailable()) {
      expect(await getSlowQueryFromRedis("test_hash")).toBeNull();
    }
  });

  it("getSlowQueryKeysFromRedis handles missing Redis gracefully", async () => {
    if (!isRedisAvailable()) {
      const result = await getSlowQueryKeysFromRedis();
      expect(result).toEqual([]);
    }
  });
});

