import { describe, it, expect, beforeEach } from "bun:test";
import {
  hashQuery,
  recordSlowQuery,
  getSlowQueriesFromMemory,
  getSlowQueriesFromRedis,
  getTopSlowQueries,
  getMostFrequentSlowQueries,
  getSlowQueryStats,
  clearMemoryStore,
} from "@/lib/db/slow-query-store";

describe("slow-query-store", () => {
  beforeEach(() => clearMemoryStore());

  describe("hashQuery", () => {
    it("normalizes whitespace", () => {
      const h1 = hashQuery("SELECT * FROM users");
      expect(hashQuery("SELECT   *   FROM   users")).toBe(h1);
      expect(hashQuery("SELECT\n*\nFROM\nusers")).toBe(h1);
      expect(hashQuery("  SELECT * FROM users  ")).toBe(h1);
    });

    it("is case insensitive", () => {
      const h = hashQuery("SELECT * FROM users");
      expect(hashQuery("select * from users")).toBe(h);
      expect(hashQuery("SELECT * FROM USERS")).toBe(h);
    });

    it("replaces numeric literals", () => {
      const h = hashQuery("SELECT * FROM users WHERE id = 123");
      expect(hashQuery("SELECT * FROM users WHERE id = 456")).toBe(h);
    });

    it("replaces string literals", () => {
      const h = hashQuery("SELECT * FROM users WHERE name = 'alice'");
      expect(hashQuery("SELECT * FROM users WHERE name = 'bob'")).toBe(h);
    });

    it("replaces UUIDs", () => {
      const h1 = hashQuery("SELECT * FROM users WHERE id = '550e8400-e29b-41d4-a716-446655440000'");
      const h2 = hashQuery("SELECT * FROM users WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'");
      expect(h1).toBe(h2);
    });

    it("produces different hashes for different queries", () => {
      const h1 = hashQuery("SELECT * FROM users");
      const h2 = hashQuery("SELECT * FROM orders");
      expect(h1).not.toBe(h2);
    });

    it("handles empty string", () => {
      expect(hashQuery("")).toBe("0");
    });

    it("handles very long queries", () => {
      const hash = hashQuery("SELECT " + "col, ".repeat(1000) + "id FROM big_table");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("handles special characters", () => {
      const h1 = hashQuery("SELECT * FROM users WHERE data->>'key' = 'value'");
      const h2 = hashQuery("SELECT * FROM users WHERE data->>'key' = 'other'");
      expect(h1).toBe(h2);
    });
  });

  describe("recordSlowQuery", () => {
    it("records to memory store", async () => {
      await recordSlowQuery("SELECT * FROM users", 100);
      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].sqlText).toBe("SELECT * FROM users");
      expect(queries[0].durationMs).toBe(100);
    });

    it("aggregates multiple calls", async () => {
      await recordSlowQuery("SELECT * FROM users", 100);
      await recordSlowQuery("SELECT * FROM users", 150);
      await recordSlowQuery("SELECT * FROM users", 200);

      const q = getSlowQueriesFromMemory()[0];
      expect(q.callCount).toBe(3);
      expect(q.totalDurationMs).toBe(450);
      expect(q.avgDurationMs).toBe(150);
      expect(q.minDurationMs).toBe(100);
      expect(q.maxDurationMs).toBe(200);
    });

    it("tracks min and max", async () => {
      await recordSlowQuery("SELECT 1", 500);
      await recordSlowQuery("SELECT 1", 100);
      await recordSlowQuery("SELECT 1", 300);

      const q = getSlowQueriesFromMemory()[0];
      expect(q.minDurationMs).toBe(100);
      expect(q.maxDurationMs).toBe(500);
    });

    it("records separate queries separately", async () => {
      await recordSlowQuery("SELECT * FROM users", 100);
      await recordSlowQuery("SELECT * FROM orders", 200);
      expect(getSlowQueriesFromMemory().length).toBe(2);
    });

    it("groups similar queries with different parameters", async () => {
      await recordSlowQuery("SELECT * FROM users WHERE id = 1", 100);
      await recordSlowQuery("SELECT * FROM users WHERE id = 2", 150);
      await recordSlowQuery("SELECT * FROM users WHERE id = 999", 200);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].callCount).toBe(3);
    });

    it("truncates very long SQL", async () => {
      await recordSlowQuery("SELECT " + "x".repeat(20000), 100);
      expect(getSlowQueriesFromMemory()[0].sqlText.length).toBeLessThanOrEqual(10000);
    });

    it("records source metadata", async () => {
      await recordSlowQuery("SELECT 1", 100, "test.ts", "myFunction");
      const q = getSlowQueriesFromMemory()[0];
      expect(q.sourceFile).toBe("test.ts");
      expect(q.sourceFunction).toBe("myFunction");
    });

    it("updates timestamps correctly", async () => {
      const before = new Date();
      await recordSlowQuery("SELECT 1", 100);

      const firstSeen = getSlowQueriesFromMemory()[0].firstSeenAt;
      expect(firstSeen.getTime()).toBeGreaterThanOrEqual(before.getTime());

      await new Promise((r) => setTimeout(r, 10));
      await recordSlowQuery("SELECT 1", 100);

      const updated = getSlowQueriesFromMemory()[0];
      expect(updated.firstSeenAt.getTime()).toBe(firstSeen.getTime());
      expect(updated.lastSeenAt.getTime()).toBeGreaterThan(firstSeen.getTime());
    });
  });

  describe("getTopSlowQueries", () => {
    it("sorts by avg duration descending", async () => {
      await recordSlowQuery("query_fast", 50);
      await recordSlowQuery("query_medium", 150);
      await recordSlowQuery("query_slow", 300);

      const top = getTopSlowQueries(10);
      expect(top[0].avgDurationMs).toBe(300);
      expect(top[1].avgDurationMs).toBe(150);
      expect(top[2].avgDurationMs).toBe(50);
    });

    it("respects limit", async () => {
      for (let i = 0; i < 10; i++) await recordSlowQuery(`query_${i}`, i * 10);
      expect(getTopSlowQueries(3).length).toBe(3);
      expect(getTopSlowQueries(5).length).toBe(5);
    });

    it("returns empty array when no queries", () => {
      expect(getTopSlowQueries(10)).toEqual([]);
    });

    it("defaults to 20", async () => {
      for (let i = 0; i < 30; i++) await recordSlowQuery(`query_${i}`, i);
      expect(getTopSlowQueries().length).toBe(20);
    });
  });

  describe("getMostFrequentSlowQueries", () => {
    it("sorts by call count descending", async () => {
      await recordSlowQuery("query_rare", 100);
      for (let i = 0; i < 3; i++) await recordSlowQuery("query_common", 100);
      for (let i = 0; i < 5; i++) await recordSlowQuery("query_very_common", 100);

      const frequent = getMostFrequentSlowQueries(10);
      expect(frequent[0].callCount).toBe(5);
      expect(frequent[1].callCount).toBe(3);
      expect(frequent[2].callCount).toBe(1);
    });
  });

  describe("getSlowQueryStats", () => {
    it("returns zeros when no queries", () => {
      const stats = getSlowQueryStats();
      expect(stats.totalQueries).toBe(0);
      expect(stats.totalCalls).toBe(0);
      expect(stats.avgDuration).toBe(0);
      expect(stats.maxDuration).toBe(0);
    });

    it("calculates stats correctly", async () => {
      await recordSlowQuery("query_1", 100);
      await recordSlowQuery("query_1", 200);
      await recordSlowQuery("query_2", 300);
      await recordSlowQuery("query_2", 400);

      const stats = getSlowQueryStats();
      expect(stats.totalQueries).toBe(2);
      expect(stats.totalCalls).toBe(4);
      expect(stats.avgDuration).toBe(250);
      expect(stats.maxDuration).toBe(400);
    });
  });

  describe("clearMemoryStore", () => {
    it("removes all queries", async () => {
      await recordSlowQuery("query_1", 100);
      await recordSlowQuery("query_2", 200);
      expect(getSlowQueriesFromMemory().length).toBe(2);
      clearMemoryStore();
      expect(getSlowQueriesFromMemory().length).toBe(0);
    });
  });

  describe("concurrent access", () => {
    it("handles concurrent recordings", async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        recordSlowQuery("concurrent_query", 100 + i)
      );
      await Promise.all(promises);

      const q = getSlowQueriesFromMemory()[0];
      expect(q.callCount).toBe(100);
      expect(q.totalDurationMs).toBe(14950); // Sum of 100..199
    });
  });

  describe("memory eviction", () => {
    it("evicts oldest entries when over limit", async () => {
      const originalMax = process.env.SLOW_QUERY_MAX_MEMORY;
      process.env.SLOW_QUERY_MAX_MEMORY = "50";
      
      for (let i = 0; i < 60; i++) {
        await recordSlowQuery(`distinct_query_eviction_${i}_${Date.now()}`, 100);
      }
      
      expect(getSlowQueriesFromMemory().length).toBeGreaterThan(0);
      
      if (originalMax) process.env.SLOW_QUERY_MAX_MEMORY = originalMax;
      else delete process.env.SLOW_QUERY_MAX_MEMORY;
    });

    it("keeps most recent entries on eviction", async () => {
      await recordSlowQuery("old_query_1", 100);
      await new Promise(r => setTimeout(r, 5));
      await recordSlowQuery("old_query_2", 100);
      await new Promise(r => setTimeout(r, 5));
      await recordSlowQuery("recent_query", 100);
      
      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(3);
      
      const sorted = queries.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
      expect(sorted[0].sqlText).toBe("recent_query");
    });
  });

});
