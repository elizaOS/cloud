/**
 * Integration tests for slow query tracking with real database.
 * 
 * These tests verify the complete flow from query execution
 * through to storage in the slow_query_log table.
 * 
 * Requires: DATABASE_URL to be set
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import {
  recordSlowQuery,
  forceFlush,
  clearMemoryStore,
  getSlowQueriesFromMemory,
  hashQuery,
} from "@/lib/db/slow-query-store";

// Skip integration tests if no database
const hasDatabase = !!process.env.DATABASE_URL;
const describeWithDb = hasDatabase ? describe : describe.skip;

describeWithDb("slow query integration", () => {
  const testQueryHash = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    // Ensure slow_query_log table exists
    try {
      await db.execute(sql`
        SELECT 1 FROM slow_query_log LIMIT 1
      `);
    } catch {
      console.log("slow_query_log table not found, skipping integration tests");
    }
  });

  afterAll(async () => {
    // Clean up test data
    clearMemoryStore();
    await db.execute(sql`
      DELETE FROM slow_query_log WHERE query_hash LIKE 'test_%'
    `).catch(() => {});
  });

  describe("database connectivity", () => {
    it("connects to database successfully", async () => {
      const result = await db.execute(sql`SELECT 1 as test`);
      expect(result.rows).toBeDefined();
    });

    it("slow_query_log table exists", async () => {
      const result = await db.execute(sql`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'slow_query_log'
      `);
      
      const columns = result.rows.map((r) => r.column_name);
      expect(columns).toContain("query_hash");
      expect(columns).toContain("sql_text");
      expect(columns).toContain("duration_ms");
      expect(columns).toContain("call_count");
    });

    it("can insert and query slow_query_log", async () => {
      const uniqueHash = `test_insert_${Date.now()}`;
      
      // Insert
      await db.execute(sql`
        INSERT INTO slow_query_log (query_hash, sql_text, duration_ms)
        VALUES (${uniqueHash}, 'SELECT 1', 100)
      `);

      // Query
      const result = await db.execute(sql`
        SELECT * FROM slow_query_log WHERE query_hash = ${uniqueHash}
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].query_hash).toBe(uniqueHash);
      expect(result.rows[0].sql_text).toBe("SELECT 1");

      // Cleanup
      await db.execute(sql`
        DELETE FROM slow_query_log WHERE query_hash = ${uniqueHash}
      `);
    });
  });

  describe("memory to postgres flow", () => {
    it("records slow query to memory first", async () => {
      clearMemoryStore();
      
      await recordSlowQuery("SELECT * FROM test_table", 150);
      
      const memoryQueries = getSlowQueriesFromMemory();
      expect(memoryQueries.length).toBe(1);
      expect(memoryQueries[0].sqlText).toBe("SELECT * FROM test_table");
      expect(memoryQueries[0].durationMs).toBe(150);
    });

    it("flushes to postgres on forceFlush", async () => {
      clearMemoryStore();
      const uniqueSql = `SELECT * FROM test_${Date.now()}`;
      const queryHash = hashQuery(uniqueSql);
      
      await recordSlowQuery(uniqueSql, 200);
      await forceFlush();

      const result = await db.execute(sql`
        SELECT * FROM slow_query_log WHERE query_hash = ${queryHash}
      `);

      expect(result.rows.length).toBe(1);
      expect(Number(result.rows[0].duration_ms)).toBe(200);

      // Cleanup
      await db.execute(sql`
        DELETE FROM slow_query_log WHERE query_hash = ${queryHash}
      `);
    });

    it("aggregates multiple calls via upsert", async () => {
      clearMemoryStore();
      const uniqueSql = `SELECT * FROM aggregate_test_${Date.now()}`;
      const queryHash = hashQuery(uniqueSql);
      
      // Record multiple times
      await recordSlowQuery(uniqueSql, 100);
      await recordSlowQuery(uniqueSql, 200);
      await recordSlowQuery(uniqueSql, 300);
      await forceFlush();

      // Memory should show aggregated stats
      const memoryQueries = getSlowQueriesFromMemory();
      const entry = memoryQueries.find((q) => q.queryHash === queryHash);
      expect(entry).toBeDefined();
      expect(entry!.callCount).toBe(3);
      expect(entry!.avgDurationMs).toBe(200);

      // Cleanup
      await db.execute(sql`
        DELETE FROM slow_query_log WHERE query_hash = ${queryHash}
      `);
    });
  });

  describe("query timing accuracy", () => {
    it("measures real query execution time", async () => {
      // Execute a query with pg_sleep
      const start = performance.now();
      await db.execute(sql`SELECT pg_sleep(0.05)`); // 50ms sleep
      const duration = performance.now() - start;

      // Should take at least 50ms (the sleep time)
      expect(duration).toBeGreaterThanOrEqual(50);
      // Should complete within 500ms (generous buffer for network latency)
      expect(duration).toBeLessThan(500);
    });

    it("captures slow queries above threshold", async () => {
      clearMemoryStore();
      
      // Simulate recording a query that took 100ms
      await recordSlowQuery("SELECT pg_sleep(0.1)", 100);

      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].durationMs).toBe(100);
    });
  });

  describe("edge cases with real data", () => {
    it("handles very long SQL text", async () => {
      clearMemoryStore();
      const longSql = "SELECT " + "a".repeat(15000) + " FROM test";
      
      await recordSlowQuery(longSql, 100);
      
      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      // Should be truncated to 10000 chars
      expect(queries[0].sqlText.length).toBeLessThanOrEqual(10000);
    });

    it("handles special characters in SQL", async () => {
      clearMemoryStore();
      const specialSql = "SELECT * FROM users WHERE name = 'O''Brien' AND data->>'key' = 'value'";
      
      await recordSlowQuery(specialSql, 100);
      
      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].sqlText).toBe(specialSql);
    });

    it("handles unicode in SQL", async () => {
      clearMemoryStore();
      const unicodeSql = "SELECT * FROM users WHERE name = '日本語'";
      
      await recordSlowQuery(unicodeSql, 100);
      
      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].sqlText).toBe(unicodeSql);
    });

    it("handles newlines and formatting in SQL", async () => {
      clearMemoryStore();
      const formattedSql = `
        SELECT 
          id,
          name,
          email
        FROM users
        WHERE active = true
        ORDER BY created_at DESC
      `;
      
      await recordSlowQuery(formattedSql, 100);
      
      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].sqlText).toBe(formattedSql);
    });
  });

  describe("concurrent database access", () => {
    it("handles parallel slow query recordings with distinct queries", async () => {
      clearMemoryStore();
      
      // Use structurally different queries (different table names, not just parameters)
      const tables = ["users", "orders", "products", "customers", "invoices"];
      const promises = tables.map((table) => 
        recordSlowQuery(`SELECT * FROM ${table}_table_distinct`, 100)
      );
      
      await Promise.all(promises);
      
      // All queries should be recorded (5 distinct queries)
      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(5);
    });

    it("handles parallel recordings of same query", async () => {
      clearMemoryStore();
      
      const promises = [];
      const sameSql = "SELECT * FROM same_query_test";
      for (let i = 0; i < 20; i++) {
        promises.push(recordSlowQuery(sameSql, 100));
      }
      
      await Promise.all(promises);
      
      // Should be aggregated into one entry
      const queries = getSlowQueriesFromMemory();
      expect(queries.length).toBe(1);
      expect(queries[0].callCount).toBe(20);
    });
  });
});

// Tests that run without database
describe("slow query store (no db)", () => {
  it("hashQuery is deterministic", () => {
    const sql1 = "SELECT * FROM users WHERE id = 1";
    const sql2 = "SELECT * FROM users WHERE id = 1";
    
    expect(hashQuery(sql1)).toBe(hashQuery(sql2));
  });

  it("similar queries produce same hash", () => {
    const sql1 = "SELECT * FROM users WHERE id = 1";
    const sql2 = "SELECT * FROM users WHERE id = 999";
    
    expect(hashQuery(sql1)).toBe(hashQuery(sql2));
  });

  it("different queries produce different hashes", () => {
    const sql1 = "SELECT * FROM users";
    const sql2 = "SELECT * FROM orders";
    
    expect(hashQuery(sql1)).not.toBe(hashQuery(sql2));
  });
});

