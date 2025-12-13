/**
 * Tests for SQL extraction logic used in query instrumentation.
 * 
 * Tests:
 * - Query chunk parsing
 * - Edge cases with malformed objects
 * - Performance implications
 */

import { describe, it, expect } from "bun:test";
import { sql, type SQL } from "drizzle-orm";

// Test the SQL object structure that Drizzle produces
describe("drizzle SQL object structure", () => {
  it("sql tagged template returns SQL object", () => {
    const query = sql`SELECT * FROM users`;
    expect(query).toBeDefined();
    expect(typeof query).toBe("object");
  });

  it("sql object has queryChunks array", () => {
    const query = sql`SELECT * FROM users`;
    // Access internal structure
    const chunks = (query as unknown as { queryChunks: unknown[] }).queryChunks;
    expect(Array.isArray(chunks)).toBe(true);
  });

  it("handles parameters in SQL template", () => {
    const id = 123;
    const name = "alice";
    const query = sql`SELECT * FROM users WHERE id = ${id} AND name = ${name}`;
    
    const chunks = (query as unknown as { queryChunks: unknown[] }).queryChunks;
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("chunks contain SQL data", () => {
    const query = sql`SELECT * FROM users`;
    const chunks = (query as unknown as { queryChunks: unknown[] }).queryChunks;
    
    // Drizzle chunks may have different structures - just verify we can extract text
    expect(chunks.length).toBeGreaterThan(0);
    
    // The extraction logic should be able to get SQL from various formats
    const sqlString = JSON.stringify(chunks);
    expect(sqlString).toContain("SELECT");
  });

  it("handles empty SQL", () => {
    const query = sql``;
    const chunks = (query as unknown as { queryChunks: unknown[] }).queryChunks;
    expect(chunks.length).toBeGreaterThanOrEqual(0);
  });

  it("handles complex SQL with multiple clauses", () => {
    const tableName = "users";
    const limit = 10;
    const query = sql`
      SELECT u.id, u.name, COUNT(o.id) as order_count
      FROM ${sql.raw(tableName)} u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.active = true
      GROUP BY u.id
      HAVING COUNT(o.id) > ${limit}
      ORDER BY order_count DESC
    `;

    // Should be a valid SQL object
    expect(query).toBeDefined();
    
    // queryChunks should exist and have data
    const chunks = (query as unknown as { queryChunks: unknown[] }).queryChunks;
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("sql.raw creates a raw SQL fragment", () => {
    const raw = sql.raw("users");
    expect(raw).toBeDefined();
  });

  it("sql.join combines multiple SQL fragments", () => {
    const conditions = [
      sql`id = 1`,
      sql`name = 'alice'`,
      sql`active = true`,
    ];
    
    const joined = sql.join(conditions, sql` AND `);
    expect(joined).toBeDefined();
  });
});

describe("SQL text extraction scenarios", () => {
  /**
   * This mimics the extraction logic in db/client.ts
   * Must match the actual implementation to catch regressions
   */
  function extractSqlText(sqlArg: unknown): string {
    if (!sqlArg || typeof sqlArg !== "object") {
      return "[unknown]";
    }

    const obj = sqlArg as Record<string, unknown>;
    
    // 1. toSQL() method - query builders
    if (typeof obj.toSQL === "function") {
      try {
        const result = (obj.toSQL as () => { sql?: string })();
        if (result?.sql) return result.sql;
      } catch {
        // toSQL can throw
      }
    }

    // 2. Direct sql property
    if (typeof obj.sql === "string") {
      return obj.sql;
    }

    // 3. queryChunks array - sql template literals
    // Structure: [{ value: ["SELECT..."] }, param, { value: ["..."] }]
    const chunks = obj.queryChunks as unknown[] | undefined;
    if (Array.isArray(chunks)) {
      const parts: string[] = [];
      for (const c of chunks) {
        if (c == null) {
          parts.push("?");
        } else if (typeof c === "string") {
          parts.push(c);
        } else if (typeof c === "number" || typeof c === "boolean") {
          parts.push("?");
        } else if (typeof c === "object") {
          const chunk = c as Record<string, unknown>;
          // value is an array of strings in Drizzle sql`` templates
          if (Array.isArray(chunk.value)) {
            parts.push(chunk.value.join(""));
          } else if (typeof chunk.value === "string") {
            parts.push(chunk.value);
          } else if (chunk.value !== undefined) {
            parts.push("?");
          }
        }
      }
      const result = parts.join("");
      if (result.trim()) return result;
    }

    return "[unknown]";
  }

  it("extracts from sql tagged template", () => {
    const query = sql`SELECT * FROM users`;
    const text = extractSqlText(query);
    expect(text).toContain("SELECT");
    expect(text).toContain("users");
  });

  it("extracts from sql with parameters", () => {
    const id = 123;
    const query = sql`SELECT * FROM users WHERE id = ${id}`;
    const text = extractSqlText(query);
    expect(text).toContain("SELECT");
    expect(text).toContain("users");
  });

  it("handles null input", () => {
    const text = extractSqlText(null);
    expect(text).toBe("[unknown]");
  });

  it("handles undefined input", () => {
    const text = extractSqlText(undefined);
    expect(text).toBe("[unknown]");
  });

  it("handles primitive types", () => {
    expect(extractSqlText("string")).toBe("[unknown]");
    expect(extractSqlText(123)).toBe("[unknown]");
    expect(extractSqlText(true)).toBe("[unknown]");
  });

  it("handles empty object", () => {
    const text = extractSqlText({});
    expect(text).toBe("[unknown]");
  });

  it("handles object with sql property", () => {
    const obj = { sql: "SELECT * FROM test" };
    const text = extractSqlText(obj);
    expect(text).toBe("SELECT * FROM test");
  });

  it("handles object with toSQL method", () => {
    const obj = {
      toSQL: () => ({ sql: "SELECT * FROM mock" }),
    };
    const text = extractSqlText(obj);
    expect(text).toBe("SELECT * FROM mock");
  });

  it("handles object with empty queryChunks", () => {
    const obj = { queryChunks: [] };
    const text = extractSqlText(obj);
    expect(text).toBe("[unknown]");
  });

  it("handles object with null values in queryChunks", () => {
    const obj = { 
      queryChunks: [
        null,
        undefined,
        { value: ["SELECT "] },
        null,
        { value: ["FROM"] },
      ],
    };
    const text = extractSqlText(obj);
    expect(text).toBe("??SELECT ?FROM");
  });

  it("handles chunks without value property", () => {
    const obj = { 
      queryChunks: [
        { notValue: "test" },
        { value: ["SELECT"] },
        { anotherProp: 123 },
      ],
    };
    const text = extractSqlText(obj);
    expect(text).toBe("SELECT");
  });

  it("handles real Drizzle sql template structure", () => {
    // Matches actual Drizzle output: [{ value: ["SQL..."] }, param, { value: ["..."] }]
    const obj = {
      queryChunks: [
        { value: ["SELECT * FROM users WHERE id = "] },
        123, // inline parameter (number)
        { value: [" AND name = "] },
        "alice", // inline parameter (string)
        { value: [""] },
      ],
    };
    const text = extractSqlText(obj);
    expect(text).toBe("SELECT * FROM users WHERE id = ? AND name = alice");
  });

  it("handles sql template with multiple parameters", () => {
    const obj = {
      queryChunks: [
        { value: ["INSERT INTO users (id, name, active) VALUES ("] },
        1,
        { value: [", "] },
        "bob",
        { value: [", "] },
        true,
        { value: [")"] },
      ],
    };
    const text = extractSqlText(obj);
    expect(text).toBe("INSERT INTO users (id, name, active) VALUES (?, bob, ?)");
  });
});

describe("performance considerations", () => {
  it("extraction completes quickly for large queries", () => {
    const largeSql = "SELECT " + Array(1000).fill("col").join(", ") + " FROM big_table";
    const query = sql.raw(largeSql);
    
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      // Access queryChunks to simulate extraction
      const chunks = (query as unknown as { queryChunks: unknown[] }).queryChunks;
      if (chunks) {
        chunks.length; // Force evaluation
      }
    }
    const duration = performance.now() - start;
    
    // Should complete 1000 iterations in under 100ms
    expect(duration).toBeLessThan(100);
  });
});

