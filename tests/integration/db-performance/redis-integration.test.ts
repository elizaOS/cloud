/**
 * Integration tests for Redis slow query storage.
 * 
 * These tests verify the Redis tier of slow query tracking.
 * Requires: REDIS_URL or KV_REST_API_URL + KV_REST_API_TOKEN
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  recordSlowQuery,
  getSlowQueryFromRedis,
  getSlowQueryKeysFromRedis,
  isRedisAvailable,
  clearMemoryStore,
  hashQuery,
} from "@/lib/db/slow-query-store";

// Skip Redis tests if not configured
const hasRedis = isRedisAvailable();
const describeWithRedis = hasRedis ? describe : describe.skip;

describeWithRedis("redis slow query integration", () => {
  beforeEach(() => {
    clearMemoryStore();
  });

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

      // Give Redis time to write (async fire-and-forget)
      await new Promise((r) => setTimeout(r, 100));

      const fromRedis = await getSlowQueryFromRedis(queryHash);
      expect(fromRedis).not.toBeNull();
      expect(fromRedis!.sqlText).toBe(uniqueSql);
      expect(fromRedis!.durationMs).toBe(150);
    });

    it("updates Redis entry on subsequent recordings", async () => {
      const uniqueSql = `SELECT * FROM redis_update_${Date.now()}`;
      const queryHash = hashQuery(uniqueSql);

      await recordSlowQuery(uniqueSql, 100);
      await new Promise((r) => setTimeout(r, 50));

      await recordSlowQuery(uniqueSql, 200);
      await new Promise((r) => setTimeout(r, 50));

      const fromRedis = await getSlowQueryFromRedis(queryHash);
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
    it("returns list of query hashes", async () => {
      const uniqueSql = `SELECT * FROM keys_test_${Date.now()}`;
      const queryHash = hashQuery(uniqueSql);

      await recordSlowQuery(uniqueSql, 100);
      await new Promise((r) => setTimeout(r, 100));

      const keys = await getSlowQueryKeysFromRedis();
      expect(keys).toContain(queryHash);
    });
  });

  describe("date serialization", () => {
    it("correctly restores Date objects from Redis", async () => {
      const uniqueSql = `SELECT * FROM date_test_${Date.now()}`;
      const queryHash = hashQuery(uniqueSql);
      const before = new Date();

      await recordSlowQuery(uniqueSql, 100);
      await new Promise((r) => setTimeout(r, 100));

      const fromRedis = await getSlowQueryFromRedis(queryHash);
      expect(fromRedis).not.toBeNull();
      expect(fromRedis!.firstSeenAt).toBeInstanceOf(Date);
      expect(fromRedis!.lastSeenAt).toBeInstanceOf(Date);
      expect(fromRedis!.firstSeenAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });
});

// Tests that run without Redis
describe("redis availability", () => {
  it("isRedisAvailable returns boolean", () => {
    const result = isRedisAvailable();
    expect(typeof result).toBe("boolean");
  });

  it("getSlowQueryFromRedis handles missing Redis gracefully", async () => {
    // If Redis is not available, should return null without throwing
    if (!isRedisAvailable()) {
      const result = await getSlowQueryFromRedis("test_hash");
      expect(result).toBeNull();
    }
  });

  it("getSlowQueryKeysFromRedis handles missing Redis gracefully", async () => {
    if (!isRedisAvailable()) {
      const result = await getSlowQueryKeysFromRedis();
      expect(result).toEqual([]);
    }
  });
});

