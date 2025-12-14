import { describe, it, expect, beforeEach } from "bun:test";
import { recordSlowQuery, clearMemoryStore, getSlowQueriesFromMemory } from "@/lib/db/slow-query-store";
import { sendSlowQueryAlert, clearRateLimiter } from "@/lib/db/query-alerting";

describe("error handling", () => {
  beforeEach(() => {
    clearMemoryStore();
    clearRateLimiter();
  });

  describe("memory store resilience", () => {
    it("records to memory even if Redis/PG fail", async () => {
      await recordSlowQuery("SELECT * FROM resilience_test", 100);
      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].sqlText).toBe("SELECT * FROM resilience_test");
    });

    it("continues recording after errors", async () => {
      for (let i = 0; i < 5; i++) await recordSlowQuery(`SELECT ${i}`, 100);
      expect(getSlowQueriesFromMemory().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("alert resilience", () => {
    it("doesn't throw when webhooks unavailable", async () => {
      await expect(
        sendSlowQueryAlert({ query: "SELECT 1", durationMs: 1000, timestamp: new Date(), severity: "critical" })
      ).resolves.toBeUndefined();
    });

    it("handles edge case inputs", async () => {
      await expect(sendSlowQueryAlert({ query: "", durationMs: 1000, timestamp: new Date(), severity: "critical" })).resolves.toBeUndefined();
      await expect(sendSlowQueryAlert({ query: "x".repeat(100000), durationMs: 1000, timestamp: new Date(), severity: "critical" })).resolves.toBeUndefined();
    });
  });

  describe("input validation", () => {
    it("handles empty SQL", async () => {
      await recordSlowQuery("", 100);
      expect(getSlowQueriesFromMemory()[0].sqlText).toBe("");
    });

    it("handles zero/negative duration", async () => {
      await recordSlowQuery("SELECT 1", 0);
      expect(getSlowQueriesFromMemory()[0].durationMs).toBe(0);
      clearMemoryStore();
      await recordSlowQuery("SELECT 1", -10);
      expect(getSlowQueriesFromMemory()[0].durationMs).toBe(-10);
    });

    it("handles special characters", async () => {
      const sql = "SELECT * FROM users WHERE name = '\"; DROP TABLE users;--'";
      await recordSlowQuery(sql, 100);
      expect(getSlowQueriesFromMemory()[0].sqlText).toBe(sql);
    });
  });

  describe("concurrent recordings", () => {
    it("handles rapid concurrent writes", async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        recordSlowQuery(`rapid_query_${i % 5}`, 100 + i)
      );
      await Promise.all(promises);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(5);
      expect(queries.reduce((sum, q) => sum + q.callCount, 0)).toBe(50);
    });
  });
});

describe("rate limiter", () => {
  beforeEach(() => clearRateLimiter());

  it("rate limits per query pattern", async () => {
    const alert = { query: "SELECT * FROM users", durationMs: 1000, timestamp: new Date(), severity: "critical" as const };
    await sendSlowQueryAlert(alert);
    await sendSlowQueryAlert(alert);
    await sendSlowQueryAlert({ ...alert, query: "SELECT * FROM orders" });
  });

  it("clears rate limits", async () => {
    const alert = { query: "SELECT 1", durationMs: 1000, timestamp: new Date(), severity: "critical" as const };
    await sendSlowQueryAlert(alert);
    clearRateLimiter();
    await sendSlowQueryAlert(alert);
  });
});
