import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import * as schema from "./schemas";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

type Database = NodePgDatabase<typeof schema> | NeonDatabase<typeof schema>;

let _db: Database | null = null;
let _instrumentationEnabled: boolean | null = null;

const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || "50", 10);

function isNeonDatabase(url: string): boolean {
  return url.includes("neon.tech") || url.includes("neon.database");
}

/**
 * Checks if query instrumentation should be active.
 * Enabled in dev/staging/preview, disabled in production for zero overhead.
 */
function isInstrumentationEnabled(): boolean {
  if (_instrumentationEnabled !== null) return _instrumentationEnabled;

  if (process.env.DB_INSTRUMENTATION_DISABLED === "true") {
    _instrumentationEnabled = false;
    return false;
  }

  const env = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;

  // Production = disabled
  if (env === "production" && vercelEnv === "production") {
    _instrumentationEnabled = false;
    return false;
  }

  _instrumentationEnabled =
    env === "development" ||
    vercelEnv === "preview" ||
    vercelEnv === "development" ||
    process.env.DB_INSTRUMENTATION_ENABLED === "true";

  return _instrumentationEnabled;
}

/**
 * Handles slow query logging, storage, and alerting.
 */
function handleSlowQuery(sqlText: string, durationMs: number): void {
  const preview = sqlText.substring(0, 120).replace(/\s+/g, " ");
  console.warn(`[SlowQuery] ${durationMs}ms | ${preview}${sqlText.length > 120 ? "..." : ""}`);

  import("@/lib/db/slow-query-store")
    .then(({ recordSlowQuery }) => recordSlowQuery(sqlText, durationMs))
    .catch((e) => console.warn("[DB] slow-query-store import failed:", e));

  if (durationMs >= 200) {
    import("@/lib/db/query-alerting")
      .then(({ sendSlowQueryAlert, getAlertSeverity }) => {
        const severity = getAlertSeverity(durationMs);
        if (severity) {
          sendSlowQueryAlert({ query: sqlText, durationMs, timestamp: new Date(), severity });
        }
      })
      .catch((e) => console.warn("[DB] query-alerting import failed:", e));
  }
}

/**
 * Wraps a promise with timing instrumentation.
 */
function wrapWithTiming<T>(fn: () => Promise<T>, getSql: () => string): Promise<T> {
  if (!isInstrumentationEnabled()) return fn();

  const start = performance.now();
  return fn().finally(() => {
    const duration = Math.round(performance.now() - start);
    if (duration >= SLOW_QUERY_THRESHOLD_MS) {
      handleSlowQuery(getSql(), duration);
    }
  });
}

/**
 * Extracts SQL text from Drizzle objects (sql templates and query builders).
 */
function extractSql(sqlArg: unknown, fallback = "[unknown]"): string {
  if (typeof sqlArg !== "object" || sqlArg === null) return fallback;

  const obj = sqlArg as Record<string, unknown>;

  // 1. Direct sql string property (from toSQL result)
  if (typeof obj.sql === "string") return obj.sql;

  // 2. toSQL() method - query builders (select, insert, update, delete)
  if (typeof obj.toSQL === "function") {
    try {
      const result = (obj.toSQL as () => { sql?: string })();
      if (result?.sql) return result.sql;
    } catch {
      // toSQL can throw if query is incomplete
    }
  }

  // 3. getSQL() method - returns SQL object with queryChunks
  if (typeof obj.getSQL === "function") {
    try {
      const sqlObj = (obj.getSQL as () => Record<string, unknown>)();
      if (sqlObj) return extractSql(sqlObj, fallback);
    } catch {
      // getSQL can throw
    }
  }

  // 4. queryChunks array - sql template literals
  if (Array.isArray(obj.queryChunks)) {
    const parts: string[] = [];
    for (const c of obj.queryChunks) {
      if (c == null) {
        parts.push("?");
      } else if (typeof c === "string") {
        parts.push("?"); // String parameter
      } else if (typeof c === "number" || typeof c === "boolean") {
        parts.push("?"); // Numeric/boolean parameter
      } else if (typeof c === "object") {
        const chunk = c as Record<string, unknown>;
        // value can be a string or array of strings
        if (Array.isArray(chunk.value)) {
          parts.push(chunk.value.join(""));
        } else if (typeof chunk.value === "string") {
          parts.push(chunk.value);
        } else if (chunk.value !== undefined) {
          parts.push("?");
        }
      }
    }
    if (parts.length > 0) return parts.join("");
  }

  return fallback;
}

/**
 * Creates an instrumented proxy for query builders.
 * Extracts SQL when the query executes (on .then() or await).
 */
function instrumentQueryBuilder<T extends object>(target: T, methodName: string): T {
  if (!isInstrumentationEnabled()) return target;

  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop);
      if (typeof value !== "function") return value;

      return function (...args: unknown[]) {
        const result = Reflect.apply(value, obj, args);

        if (result instanceof Promise) {
          // Query is executing - extract SQL from current builder state (obj)
          const sqlText = extractSql(obj, `[${methodName}]`);
          return wrapWithTiming(() => result, () => sqlText);
        }

        if (result && typeof result === "object") {
          // Still building - wrap the result for continued chaining
          return instrumentQueryBuilder(result as object, methodName);
        }

        return result;
      };
    },
  });
}

function getDb(): Database {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set. Check your .env.local file.");
  }

  if (isInstrumentationEnabled()) {
    console.info(`[DB] ✓ Query instrumentation ENABLED (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`);

    // Check alert config once
    import("@/lib/db/query-alerting")
      .then(({ checkAlertConfig }) => checkAlertConfig())
      .catch(() => {});
  }

  if (isNeonDatabase(url)) {
    if (typeof WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    _db = drizzleNeon(new NeonPool({ connectionString: url }), { schema }) as Database;
  } else {
    _db = drizzleNode(new PgPool({ connectionString: url }), { schema }) as Database;
  }

  return _db;
}

/**
 * Database client with lazy initialization and optional instrumentation.
 * Instrumentation is only active in development/staging.
 */
export const db = new Proxy({} as Database, {
  get: (_, prop) => {
    const database = getDb();
    const value = database[prop as keyof typeof database];

    if (typeof value !== "function") return value;

    return function (...args: unknown[]) {
      const result = (value as (...a: unknown[]) => unknown).apply(database, args);

      // Handle execute() with SQL template
      if (prop === "execute" && args[0] && result instanceof Promise) {
        const sql = extractSql(args[0]);
        return wrapWithTiming(() => result, () => sql);
      }

      // Handle query builders (select, insert, etc.)
      if (result && typeof result === "object" && !(result instanceof Promise)) {
        return instrumentQueryBuilder(result as object, String(prop));
      }

      // Handle direct promises
      if (result instanceof Promise) {
        return wrapWithTiming(() => result, () => `[${String(prop)}]`);
      }

      return result;
    };
  },
});

export type { Database };
