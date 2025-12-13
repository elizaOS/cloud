import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import * as schema from "./schemas";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { Logger } from "drizzle-orm/logger";
import ws from "ws";

/**
 * Union type for supported database drivers.
 */
type Database = NodePgDatabase<typeof schema> | NeonDatabase<typeof schema>;

let _db: Database | null = null;

/**
 * Checks if a database URL is for Neon serverless.
 * 
 * @param url - Database connection URL.
 * @returns True if URL contains neon.tech or neon.database domain.
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
  const env = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV;
  
  // Explicitly disabled
  if (process.env.DB_INSTRUMENTATION_DISABLED === "true") {
    return false;
  }
  
  // Production = disabled (zero CPU impact)
  if (env === "production" && vercelEnv === "production") {
    return false;
  }
  
  // Development, staging, preview = enabled
  return env === "development" || 
         vercelEnv === "preview" || 
         vercelEnv === "development" ||
         process.env.DB_INSTRUMENTATION_ENABLED === "true";
}

/** Slow query threshold in milliseconds */
const SLOW_QUERY_THRESHOLD_MS = parseInt(
  process.env.SLOW_QUERY_THRESHOLD_MS || "50",
  10
);

/** Track query start times */
const queryTimers = new Map<string, number>();
let queryCounter = 0;

/**
 * Custom Drizzle logger that tracks query execution times.
 * 
 * Only active in development/staging environments.
 * In production, uses a no-op logger for zero overhead.
 */
class QueryInstrumentationLogger implements Logger {
  private enabled: boolean;
  private alertConfigChecked = false;

  constructor() {
    this.enabled = shouldEnableInstrumentation();
    
    if (this.enabled) {
      console.info(
        `[DB] ✓ Query instrumentation ENABLED (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`
      );
    }
  }

  logQuery(query: string, params: unknown[]): void {
    if (!this.enabled) return;

    // Check alert config on first query
    if (!this.alertConfigChecked) {
      this.alertConfigChecked = true;
      this.checkAlertConfig();
    }

    const queryId = `q_${++queryCounter}`;
    queryTimers.set(queryId, performance.now());

    // Use setImmediate to capture timing after query completes
    // This is a workaround since Drizzle's logger doesn't have an "after" hook
    setImmediate(() => {
      const startTime = queryTimers.get(queryId);
      if (startTime === undefined) return;
      
      queryTimers.delete(queryId);
      const durationMs = Math.round(performance.now() - startTime);

      if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
        this.logSlowQuery(query, params, durationMs);
      }
    });
  }

  private logSlowQuery(query: string, params: unknown[], durationMs: number): void {
    const queryPreview = query.substring(0, 120).replace(/\s+/g, " ");
    console.warn(
      `[SlowQuery] ${durationMs}ms | ${queryPreview}${query.length > 120 ? "..." : ""}`
    );

    // Import and record async to avoid circular dependencies
    import("@/lib/db/slow-query-store").then(({ recordSlowQuery }) => {
      recordSlowQuery(query, durationMs);
    }).catch(() => {
      // Ignore import errors during startup
    });

    // Send alerts for very slow queries
    if (durationMs >= 200) {
      import("@/lib/db/query-alerting").then(({ sendSlowQueryAlert, getAlertSeverity }) => {
        const severity = getAlertSeverity(durationMs);
        if (severity) {
          sendSlowQueryAlert({
            query,
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

  private checkAlertConfig(): void {
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
}

/** No-op logger for production - zero overhead */
class NoOpLogger implements Logger {
  logQuery(): void {
    // Intentionally empty - zero CPU overhead in production
  }
}

/**
 * Gets or creates the database connection instance.
 * 
 * Automatically selects the appropriate driver based on DATABASE_URL:
 * - Neon serverless driver for production (neon.tech domains)
 * - Node PostgreSQL driver for local development
 * 
 * Query instrumentation is ONLY enabled in development/staging.
 * In production, uses no-op logger for zero overhead.
 * 
 * @returns Initialized database instance.
 * @throws Error if DATABASE_URL is not set.
 */
function getDb() {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL environment variable is not set. Make sure you have a .env.local file with DATABASE_URL defined.",
      );
    }

    // Select logger based on environment
    const logger = shouldEnableInstrumentation()
      ? new QueryInstrumentationLogger()
      : new NoOpLogger();

    if (isNeonDatabase(databaseUrl)) {
      // Configure WebSocket for Node.js environment (Neon requires WebSocket)
      if (typeof WebSocket === "undefined") {
        neonConfig.webSocketConstructor = ws;
      }

      const pool = new NeonPool({ connectionString: databaseUrl });
      _db = drizzleNeon(pool, { schema, logger }) as Database;
    } else {
      // Local development: Use standard PostgreSQL driver
      const pool = new PgPool({ connectionString: databaseUrl });
      _db = drizzleNode(pool, { schema, logger }) as Database;
    }
  }

  return _db;
}

/**
 * Database proxy that lazily initializes the connection on first access.
 * 
 * This ensures the database is only initialized when actually used,
 * preventing connection errors during module import.
 */
export const db = new Proxy({} as Database, {
  get: (_, prop) => {
    const database = getDb();
    const value = database[prop as keyof typeof database];
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export type { Database };
