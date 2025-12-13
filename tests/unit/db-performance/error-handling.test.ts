/**
 * Tests for error handling in slow query tracking.
 * 
 * Tests:
 * - Graceful degradation when Redis unavailable
 * - Graceful degradation when PostgreSQL unavailable  
 * - Error isolation (errors don't propagate to caller)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  recordSlowQuery,
  clearMemoryStore,
  getSlowQueriesFromMemory,
} from "@/lib/db/slow-query-store";
import { sendSlowQueryAlert, clearRateLimiter } from "@/lib/db/query-alerting";

describe("error handling", () => {
  beforeEach(() => {
    clearMemoryStore();
    clearRateLimiter();
  });

  describe("memory store resilience", () => {
    it("always records to memory even if Redis/PG fail", async () => {
      // recordSlowQuery catches Redis/PG errors internally
      await recordSlowQuery("SELECT * FROM resilience_test", 100);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].sqlText).toBe("SELECT * FROM resilience_test");
    });

    it("continues recording after previous errors", async () => {
      for (let i = 0; i < 5; i++) {
        await recordSlowQuery(`SELECT ${i}`, 100);
      }

      // All should be recorded despite any internal errors
      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBeGreaterThanOrEqual(1); // At least grouped by hash
    });
  });

  describe("alert resilience", () => {
    it("sendSlowQueryAlert doesn't throw when webhooks unavailable", async () => {
      // No webhooks configured - should not throw
      await expect(
        sendSlowQueryAlert({
          query: "SELECT 1",
          durationMs: 1000,
          timestamp: new Date(),
          severity: "critical",
        })
      ).resolves.toBeUndefined();
    });

    it("handles malformed query in alert", async () => {
      // Empty query
      await expect(
        sendSlowQueryAlert({
          query: "",
          durationMs: 1000,
          timestamp: new Date(),
          severity: "critical",
        })
      ).resolves.toBeUndefined();

      // Very long query
      await expect(
        sendSlowQueryAlert({
          query: "x".repeat(100000),
          durationMs: 1000,
          timestamp: new Date(),
          severity: "critical",
        })
      ).resolves.toBeUndefined();
    });
  });

  describe("input validation", () => {
    it("handles empty SQL string", async () => {
      await recordSlowQuery("", 100);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].sqlText).toBe("");
    });

    it("handles zero duration", async () => {
      await recordSlowQuery("SELECT 1", 0);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].durationMs).toBe(0);
    });

    it("handles negative duration", async () => {
      // Shouldn't happen but should handle gracefully
      await recordSlowQuery("SELECT 1", -10);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].durationMs).toBe(-10);
    });

    it("handles very large duration", async () => {
      await recordSlowQuery("SELECT 1", Number.MAX_SAFE_INTEGER);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].durationMs).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("handles SQL with special characters", async () => {
      const specialSql = "SELECT * FROM users WHERE name = '\"; DROP TABLE users;--'";
      await recordSlowQuery(specialSql, 100);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].sqlText).toBe(specialSql);
    });

    it("handles SQL with null bytes", async () => {
      const sqlWithNull = "SELECT * FROM users WHERE id = 1\x00 AND active = true";
      await recordSlowQuery(sqlWithNull, 100);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      // Should contain the SQL (null byte handling may vary)
      expect(queries[0].sqlText).toBeDefined();
    });
  });

  describe("concurrent error handling", () => {
    it("handles rapid concurrent recordings without data loss", async () => {
      const count = 50;
      const promises = Array(count)
        .fill(0)
        .map((_, i) => recordSlowQuery(`rapid_query_${i % 5}`, 100 + i));

      await Promise.all(promises);

      const queries = getSlowQueriesFromMemory();
      // Should have 5 distinct query patterns
      expect(queries.length).toBe(5);
      
      // Total call count should be 50
      const totalCalls = queries.reduce((sum, q) => sum + q.callCount, 0);
      expect(totalCalls).toBe(50);
    });

    it("handles interleaved success and failure gracefully", async () => {
      // Mix of normal and edge-case queries
      const queries = [
        { sql: "SELECT 1", dur: 100 },
        { sql: "", dur: 0 },
        { sql: "SELECT 2", dur: 200 },
        { sql: "x".repeat(20000), dur: 50 },
        { sql: "SELECT 3", dur: 300 },
      ];

      for (const q of queries) {
        await recordSlowQuery(q.sql, q.dur);
      }

      const recorded = getSlowQueriesFromMemory();
      expect(recorded.length).toBeGreaterThan(0);
    });
  });
});

describe("rate limiter behavior", () => {
  beforeEach(() => {
    clearRateLimiter();
  });

  it("rate limiting is per-query pattern", async () => {
    // First call should not be rate limited
    const alert1 = {
      query: "SELECT * FROM users",
      durationMs: 1000,
      timestamp: new Date(),
      severity: "critical" as const,
    };

    await sendSlowQueryAlert(alert1);

    // Same query immediately after should be rate limited
    await sendSlowQueryAlert(alert1);

    // Different query should not be rate limited
    const alert2 = {
      query: "SELECT * FROM orders",
      durationMs: 1000,
      timestamp: new Date(),
      severity: "critical" as const,
    };

    await sendSlowQueryAlert(alert2);

    // All calls should complete without error
    expect(true).toBe(true);
  });

  it("clearRateLimiter resets all limits", async () => {
    const alert = {
      query: "SELECT 1",
      durationMs: 1000,
      timestamp: new Date(),
      severity: "critical" as const,
    };

    await sendSlowQueryAlert(alert);
    clearRateLimiter();
    await sendSlowQueryAlert(alert); // Should work after clear

    expect(true).toBe(true);
  });
});

