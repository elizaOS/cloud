/**
 * Tests for slow-query-store.ts
 * 
 * Tests:
 * - Query hashing (normalization, edge cases)
 * - Recording slow queries (memory store)
 * - Stats aggregation
 * - Edge cases and boundary conditions
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  hashQuery,
  recordSlowQuery,
  getSlowQueriesFromMemory,
  getTopSlowQueries,
  getMostFrequentSlowQueries,
  getSlowQueryStats,
  clearMemoryStore,
} from "@/lib/db/slow-query-store";

describe("slow-query-store", () => {
  beforeEach(() => {
    clearMemoryStore();
  });

  describe("hashQuery", () => {
    it("normalizes whitespace", () => {
      const hash1 = hashQuery("SELECT * FROM users");
      const hash2 = hashQuery("SELECT   *   FROM   users");
      const hash3 = hashQuery("SELECT\n*\nFROM\nusers");
      const hash4 = hashQuery("  SELECT * FROM users  ");

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
      expect(hash3).toBe(hash4);
    });

    it("is case insensitive", () => {
      const hash1 = hashQuery("SELECT * FROM users");
      const hash2 = hashQuery("select * from users");
      const hash3 = hashQuery("SELECT * FROM USERS");

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it("replaces numeric literals with placeholders", () => {
      const hash1 = hashQuery("SELECT * FROM users WHERE id = 123");
      const hash2 = hashQuery("SELECT * FROM users WHERE id = 456");
      const hash3 = hashQuery("SELECT * FROM users WHERE id = 999999999");

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it("replaces string literals with placeholders", () => {
      const hash1 = hashQuery("SELECT * FROM users WHERE name = 'alice'");
      const hash2 = hashQuery("SELECT * FROM users WHERE name = 'bob'");
      const hash3 = hashQuery("SELECT * FROM users WHERE name = 'charlie jones'");

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it("replaces UUIDs with placeholders", () => {
      const hash1 = hashQuery("SELECT * FROM users WHERE id = '550e8400-e29b-41d4-a716-446655440000'");
      const hash2 = hashQuery("SELECT * FROM users WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'");

      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different queries", () => {
      const hash1 = hashQuery("SELECT * FROM users");
      const hash2 = hashQuery("SELECT * FROM orders");
      const hash3 = hashQuery("INSERT INTO users VALUES (1)");

      expect(hash1).not.toBe(hash2);
      expect(hash2).not.toBe(hash3);
    });

    it("handles empty string", () => {
      const hash = hashQuery("");
      expect(hash).toBe("0"); // Empty string hashes to 0
    });

    it("handles very long queries", () => {
      const longQuery = "SELECT " + "col, ".repeat(1000) + "id FROM big_table";
      const hash = hashQuery(longQuery);
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("handles special characters", () => {
      const hash1 = hashQuery("SELECT * FROM users WHERE data->>'key' = 'value'");
      const hash2 = hashQuery("SELECT * FROM users WHERE data->>'key' = 'other'");

      expect(hash1).toBe(hash2); // Same structure, different string literal
    });
  });

  describe("recordSlowQuery", () => {
    it("records a new query to memory store", async () => {
      await recordSlowQuery("SELECT * FROM users", 100);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].sqlText).toBe("SELECT * FROM users");
      expect(queries[0].durationMs).toBe(100);
      expect(queries[0].callCount).toBe(1);
    });

    it("aggregates multiple calls of same query", async () => {
      await recordSlowQuery("SELECT * FROM users", 100);
      await recordSlowQuery("SELECT * FROM users", 150);
      await recordSlowQuery("SELECT * FROM users", 200);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].callCount).toBe(3);
      expect(queries[0].totalDurationMs).toBe(450);
      expect(queries[0].avgDurationMs).toBe(150);
      expect(queries[0].minDurationMs).toBe(100);
      expect(queries[0].maxDurationMs).toBe(200);
    });

    it("tracks min and max correctly", async () => {
      await recordSlowQuery("SELECT 1", 500);
      await recordSlowQuery("SELECT 1", 100);
      await recordSlowQuery("SELECT 1", 300);

      const queries = getSlowQueriesFromMemory();
      expect(queries[0].minDurationMs).toBe(100);
      expect(queries[0].maxDurationMs).toBe(500);
    });

    it("records separate queries separately", async () => {
      await recordSlowQuery("SELECT * FROM users", 100);
      await recordSlowQuery("SELECT * FROM orders", 200);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(2);
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
      const longSql = "SELECT " + "x".repeat(20000);
      await recordSlowQuery(longSql, 100);

      const queries = getSlowQueriesFromMemory();
      expect(queries[0].sqlText.length).toBeLessThanOrEqual(10000);
    });

    it("records source file and function", async () => {
      await recordSlowQuery("SELECT 1", 100, "test.ts", "myFunction");

      const queries = getSlowQueriesFromMemory();
      expect(queries[0].sourceFile).toBe("test.ts");
      expect(queries[0].sourceFunction).toBe("myFunction");
    });

    it("handles undefined source metadata", async () => {
      await recordSlowQuery("SELECT 1", 100);

      const queries = getSlowQueriesFromMemory();
      expect(queries[0].sourceFile).toBeUndefined();
      expect(queries[0].sourceFunction).toBeUndefined();
    });

    it("updates timestamps correctly", async () => {
      const before = new Date();
      await recordSlowQuery("SELECT 1", 100);
      
      const queries = getSlowQueriesFromMemory();
      const firstSeen = queries[0].firstSeenAt;
      const lastSeen1 = queries[0].lastSeenAt;

      expect(firstSeen.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lastSeen1.getTime()).toBeGreaterThanOrEqual(firstSeen.getTime());

      // Wait a bit and record again
      await new Promise((r) => setTimeout(r, 10));
      await recordSlowQuery("SELECT 1", 100);

      const updated = getSlowQueriesFromMemory();
      expect(updated[0].firstSeenAt.getTime()).toBe(firstSeen.getTime()); // Unchanged
      expect(updated[0].lastSeenAt.getTime()).toBeGreaterThan(lastSeen1.getTime()); // Updated
    });
  });

  describe("getTopSlowQueries", () => {
    it("returns queries sorted by avg duration descending", async () => {
      await recordSlowQuery("query_fast", 50);
      await recordSlowQuery("query_medium", 150);
      await recordSlowQuery("query_slow", 300);

      const top = getTopSlowQueries(10);
      expect(top[0].avgDurationMs).toBe(300);
      expect(top[1].avgDurationMs).toBe(150);
      expect(top[2].avgDurationMs).toBe(50);
    });

    it("respects limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await recordSlowQuery(`query_${i}`, i * 10);
      }

      const top3 = getTopSlowQueries(3);
      expect(top3.length).toBe(3);

      const top5 = getTopSlowQueries(5);
      expect(top5.length).toBe(5);
    });

    it("returns empty array when no queries", () => {
      const top = getTopSlowQueries(10);
      expect(top).toEqual([]);
    });

    it("uses default limit of 20", async () => {
      for (let i = 0; i < 30; i++) {
        await recordSlowQuery(`query_${i}`, i);
      }

      const top = getTopSlowQueries();
      expect(top.length).toBe(20);
    });
  });

  describe("getMostFrequentSlowQueries", () => {
    it("returns queries sorted by call count descending", async () => {
      await recordSlowQuery("query_rare", 100);
      
      await recordSlowQuery("query_common", 100);
      await recordSlowQuery("query_common", 100);
      await recordSlowQuery("query_common", 100);
      
      await recordSlowQuery("query_very_common", 100);
      await recordSlowQuery("query_very_common", 100);
      await recordSlowQuery("query_very_common", 100);
      await recordSlowQuery("query_very_common", 100);
      await recordSlowQuery("query_very_common", 100);

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

    it("calculates correct stats for single query", async () => {
      await recordSlowQuery("SELECT 1", 100);

      const stats = getSlowQueryStats();
      expect(stats.totalQueries).toBe(1);
      expect(stats.totalCalls).toBe(1);
      expect(stats.avgDuration).toBe(100);
      expect(stats.maxDuration).toBe(100);
    });

    it("calculates correct stats for multiple queries and calls", async () => {
      await recordSlowQuery("query_1", 100);
      await recordSlowQuery("query_1", 200); // 2 calls, total 300, avg 150
      await recordSlowQuery("query_2", 300);
      await recordSlowQuery("query_2", 400); // 2 calls, total 700, avg 350
      
      const stats = getSlowQueryStats();
      expect(stats.totalQueries).toBe(2);
      expect(stats.totalCalls).toBe(4);
      expect(stats.avgDuration).toBe(250); // (300 + 700) / 4
      expect(stats.maxDuration).toBe(400);
    });
  });

  describe("clearMemoryStore", () => {
    it("removes all queries from memory", async () => {
      await recordSlowQuery("query_1", 100);
      await recordSlowQuery("query_2", 200);

      expect(getSlowQueriesFromMemory().length).toBe(2);

      clearMemoryStore();

      expect(getSlowQueriesFromMemory().length).toBe(0);
    });
  });

  describe("concurrent access", () => {
    it("handles concurrent recordings safely", async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(recordSlowQuery("concurrent_query", 100 + i));
      }

      await Promise.all(promises);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].callCount).toBe(100);
      // Sum of 100..199 = 100 * (100 + 199) / 2 = 14950
      expect(queries[0].totalDurationMs).toBe(14950);
    });
  });
});

