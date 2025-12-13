import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import * as schema from "./schemas";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

/**
 * Union type for supported database drivers.
 */
type Database = NodePgDatabase<typeof schema> | NeonDatabase<typeof schema>;

let _db: Database | null = null;
let _instrumentationEnabled: boolean | null = null;
let _alertConfigChecked = false;

/**
 * Checks if a database URL is for Neon serverless.
 */
function isNeonDatabase(url: string): boolean {
  return url.includes("neon.tech") || url.includes("neon.database");
}

/**
 * Determines if query instrumentation should be active.
 * 
 * ONLY enabled in development/staging/preview.
 * DISABLED in production for zero CPU overhead.
 */
function shouldEnableInstrumentation(): boolean {
  if (_instrumentationEnabled !== null) return _instrumentationEnabled;
  
  const env = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;
  
  // Explicitly disabled
  if (process.env.DB_INSTRUMENTATION_DISABLED === "true") {
    _instrumentationEnabled = false;
    return false;
  }
  
  // Production = disabled (zero CPU impact)
  if (env === "production" && vercelEnv === "production") {
    _instrumentationEnabled = false;
    return false;
  }
  
  // Development, staging, preview = enabled
  _instrumentationEnabled = env === "development" || 
         vercelEnv === "preview" || 
         vercelEnv === "development" ||
         process.env.DB_INSTRUMENTATION_ENABLED === "true";
  
  return _instrumentationEnabled;
}

/** Slow query threshold in milliseconds */
const SLOW_QUERY_THRESHOLD_MS = parseInt(
  process.env.SLOW_QUERY_THRESHOLD_MS || "50",
  10
);

/**
 * Check and log alert configuration on first query.
 */
function checkAlertConfig(): void {
  if (_alertConfigChecked) return;
  _alertConfigChecked = true;

  const discordUrl = process.env.DB_SLOW_QUERY_DISCORD_WEBHOOK;
  const slackUrl = process.env.DB_SLOW_QUERY_SLACK_WEBHOOK;

  if (!discordUrl && !slackUrl) {
    console.warn(
      "\n" +
      "╔══════════════════════════════════════════════════════════════════════════════╗\n" +
      "║  ⚠️  DATABASE SLOW QUERY ALERTS NOT CONFIGURED                                ║\n" +
      "╠══════════════════════════════════════════════════════════════════════════════╣\n" +
      "║  Queries exceeding 200ms will not trigger real-time alerts.                  ║\n" +
      "║                                                                              ║\n" +
      "║  To enable alerts, add one or both of these to your .env.local:              ║\n" +
      "║                                                                              ║\n" +
      "║  DB_SLOW_QUERY_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...          ║\n" +
      "║  DB_SLOW_QUERY_SLACK_WEBHOOK=https://hooks.slack.com/services/...            ║\n" +
      "║                                                                              ║\n" +
      "║  Slow queries are still tracked in slow_query_log table and memory.          ║\n" +
      "╚══════════════════════════════════════════════════════════════════════════════╝\n"
    );
  } else {
    const channels: string[] = [];
    if (discordUrl) channels.push("Discord");
    if (slackUrl) channels.push("Slack");
    console.info(`[DB] ✓ Slow query alerts enabled via: ${channels.join(", ")}`);
  }
}

/**
 * Records a slow query to storage and sends alerts if needed.
 */
function handleSlowQuery(sqlText: string, durationMs: number): void {
  const queryPreview = sqlText.substring(0, 120).replace(/\s+/g, " ");
  console.warn(
    `[SlowQuery] ${durationMs}ms | ${queryPreview}${sqlText.length > 120 ? "..." : ""}`
  );

  // Record to stores (async, don't block)
  import("@/lib/db/slow-query-store").then(({ recordSlowQuery }) => {
    recordSlowQuery(sqlText, durationMs);
  }).catch(() => {
    // Ignore import errors during startup
  });

  // Send alerts for very slow queries (>200ms)
  if (durationMs >= 200) {
    import("@/lib/db/query-alerting").then(({ sendSlowQueryAlert, getAlertSeverity }) => {
      const severity = getAlertSeverity(durationMs);
      if (severity) {
        sendSlowQueryAlert({
          query: sqlText,
          durationMs,
          timestamp: new Date(),
          severity,
        });
      }
    }).catch(() => {
      // Ignore import errors
    });
  }
}

/**
 * Wraps an async function with timing instrumentation.
 */
function wrapWithTiming<T>(
  fn: () => Promise<T>,
  getSqlText: () => string
): Promise<T> {
  if (!shouldEnableInstrumentation()) {
    return fn();
  }

  checkAlertConfig();
  
  const startTime = performance.now();
  
  return fn().then(
    (result) => {
      const durationMs = Math.round(performance.now() - startTime);
      if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
        handleSlowQuery(getSqlText(), durationMs);
      }
      return result;
    },
    (error) => {
      const durationMs = Math.round(performance.now() - startTime);
      if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
        handleSlowQuery(getSqlText(), durationMs);
      }
      throw error;
    }
  );
}

/**
 * Gets or creates the database connection instance.
 */
function getDb() {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL environment variable is not set. Make sure you have a .env.local file with DATABASE_URL defined.",
      );
    }

    if (shouldEnableInstrumentation()) {
      console.info(
        `[DB] ✓ Query instrumentation ENABLED (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`
      );
    }

    if (isNeonDatabase(databaseUrl)) {
      // Configure WebSocket for Node.js environment (Neon requires WebSocket)
      if (typeof WebSocket === "undefined") {
        neonConfig.webSocketConstructor = ws;
      }

      const pool = new NeonPool({ connectionString: databaseUrl });
      _db = drizzleNeon(pool, { schema }) as Database;
    } else {
      // Local development: Use standard PostgreSQL driver
      const pool = new PgPool({ connectionString: databaseUrl });
      _db = drizzleNode(pool, { schema }) as Database;
    }
  }

  return _db;
}

/**
 * Creates an instrumented proxy for a query builder.
 * Wraps methods that return promises with timing.
 */
function createInstrumentedQueryProxy<T extends object>(target: T, sqlGetter: () => string): T {
  if (!shouldEnableInstrumentation()) {
    return target;
  }

  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop);
      
      if (typeof value !== "function") {
        return value;
      }

      // Wrap the function
      return function(this: T, ...args: unknown[]) {
        const result = Reflect.apply(value, obj, args);
        
        // If it returns a promise, wrap it with timing
        if (result instanceof Promise) {
          return wrapWithTiming(
            () => result,
            sqlGetter
          );
        }
        
        // If it returns a query builder (chainable), wrap that too
        if (result && typeof result === "object" && result !== null) {
          return createInstrumentedQueryProxy(result, sqlGetter);
        }
        
        return result;
      };
    },
  });
}

/**
 * Database proxy that lazily initializes the connection and adds instrumentation.
 * 
 * Instrumentation wraps async query execution to measure timing.
 * In production, instrumentation is disabled for zero overhead.
 */
export const db = new Proxy({} as Database, {
  get: (_, prop) => {
    const database = getDb();
    const value = database[prop as keyof typeof database];
    
    if (typeof value !== "function") {
      return value;
    }

    // Return a wrapped function
    return function(...args: unknown[]) {
      const result = (value as (...args: unknown[]) => unknown).apply(database, args);
      
      // For execute() calls with SQL template, extract the SQL
      if (prop === "execute" && args[0]) {
        const sqlArg = args[0];
        let sqlText = "[execute]";
        
        if (typeof sqlArg === "object" && sqlArg !== null) {
          // Drizzle SQL template object
          if ("queryChunks" in sqlArg) {
            const chunks = (sqlArg as { queryChunks: unknown[] }).queryChunks;
            sqlText = chunks
              .map(c => {
                if (c === null || c === undefined) return "?";
                if (typeof c === "string") return c;
                if (typeof c === "object" && "value" in c) return String((c as { value: unknown }).value ?? "?");
                return "?";
              })
              .join("");
          } else if ("sql" in sqlArg) {
            sqlText = String((sqlArg as { sql: string }).sql);
          }
        }
        
        if (result instanceof Promise) {
          return wrapWithTiming(() => result as Promise<unknown>, () => sqlText);
        }
      }
      
      // For query builders (select, insert, update, delete), wrap the chain
      if (result && typeof result === "object" && result !== null && !(result instanceof Promise)) {
        const methodName = String(prop);
        return createInstrumentedQueryProxy(
          result as object,
          () => `[${methodName}]`
        );
      }
      
      // For direct promises, wrap with timing
      if (result instanceof Promise) {
        return wrapWithTiming(
          () => result,
          () => `[${String(prop)}]`
        );
      }
      
      return result;
    };
  },
});

export type { Database };
