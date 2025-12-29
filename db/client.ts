/**
 * Database Client with Multi-Region Support
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                    DATABASE ROUTING STRATEGY                         │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │                                                                      │
 * │   DWS Serverless Function                                           │
 * │              │                                                       │
 * │              ▼                                                       │
 * │   ┌─────────────────────┐                                           │
 * │   │  Detect Region      │ ← DWS_REGION env var                      │
 * │   │  (na-east, eu-west) │                                           │
 * │   └─────────┬───────────┘                                           │
 * │             │                                                        │
 * │     ┌───────┴───────────────────────────┐                           │
 * │     ▼                                   ▼                           │
 * │  ┌──────────────┐              ┌──────────────┐                     │
 * │  │   EU READ    │              │  NA PRIMARY  │                     │
 * │  │   Replica    │              │ (Read/Write) │                     │
 * │  └──────────────┘              └──────────────┘                     │
 * │        │                              │                             │
 * │        │  (EQLite Replication)        │                             │
 * │        └──────────────────────────────┘                             │
 * │                                                                      │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Multi-Region Setup:
 * - NA (North America): Primary database (read/write)
 * - EU (Europe): Logical replication read-only replica
 * - Writes ALWAYS go to NA primary regardless of request region
 * - EU reads go to EU replica for low latency
 * - NA/APAC reads go to NA primary
 *
 * Environment Variables:
 * - DWS_DATABASE_URL       : Primary EQLite database in NA (required)
 * - DWS_DATABASE_URL_EU    : EU region read replica (optional)
 * - DATABASE_URL           : Fallback PostgreSQL for local dev
 *
 * DWS Regions:
 * - na-east, na-west → NA
 * - eu-west, eu-central → EU
 * - apac → APAC (falls back to NA)
 *
 * @module db/client
 */

import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import * as schema from "./schemas";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getDWSConfig } from "@/lib/services/dws/config";
import { logger } from "@/lib/utils/logger";

// ============================================================================
// Types
// ============================================================================

type Database = NodePgDatabase<typeof schema>;

type DatabaseRegion = "na" | "eu" | "apac";
type DatabaseRole = "read" | "write";

// ============================================================================
// Region Detection
// ============================================================================

/**
 * DWS region to database region mapping
 */
const DWS_REGION_MAP: Record<string, DatabaseRegion> = {
  // North America
  "na-east": "na",
  "na-west": "na",
  
  // Europe
  "eu-west": "eu",
  "eu-central": "eu",
  
  // Asia Pacific
  "apac": "apac",
  "ap-southeast": "apac",
  "ap-northeast": "apac",
};

/**
 * Detect the current database region based on DWS environment
 */
function detectRegion(): DatabaseRegion {
  // Check DWS_REGION first (set by DWS in serverless functions)
  const dwsRegion = process.env.DWS_REGION;
  if (dwsRegion && DWS_REGION_MAP[dwsRegion]) {
    return DWS_REGION_MAP[dwsRegion];
  }

  // Check explicit override
  const explicitRegion = process.env.DATABASE_REGION?.toLowerCase();
  if (explicitRegion === "eu" || explicitRegion === "na" || explicitRegion === "apac") {
    return explicitRegion;
  }

  // Default to NA
  return "na";
}

/**
 * Get current region (cached for performance)
 */
let _cachedRegion: DatabaseRegion | null = null;
export function getCurrentRegion(): DatabaseRegion {
  if (_cachedRegion === null) {
    _cachedRegion = detectRegion();
  }
  return _cachedRegion;
}

// ============================================================================
// Database URL Resolution
// ============================================================================

/**
 * Get the appropriate database URL for a given region and role.
 */
function getDatabaseUrl(region: DatabaseRegion, role: DatabaseRole): string | null {
  // Writes always go to primary
  if (role === "write") {
    return getPrimaryDatabaseUrl();
  }

  // For EU reads, use EU replica if available
  if (region === "eu") {
    const euReadUrl = process.env.DWS_DATABASE_URL_EU || process.env.DATABASE_URL_EU_READ;
    if (euReadUrl) {
      return euReadUrl;
    }
  }

  // All other reads go to NA primary
  return getPrimaryDatabaseUrl();
}

/**
 * Get the primary database URL (always required)
 */
function getPrimaryDatabaseUrl(): string {
  const dwsConfig = getDWSConfig();
  
  // Prefer DWS database URL
  const dwsUrl = process.env.DWS_DATABASE_URL || dwsConfig.databaseUrl;
  if (dwsUrl) {
    return dwsUrl;
  }
  
  // Fallback to standard DATABASE_URL for local dev
  const url = process.env.DATABASE_URL;
  if (url) {
    logger.warn("[Database] Using DATABASE_URL fallback - ensure DWS_DATABASE_URL is set in production");
    return url;
  }
  
  throw new Error(
    "Database URL not configured. " +
    "Set DWS_DATABASE_URL for production or DATABASE_URL for local development."
  );
}

// ============================================================================
// Database Connection Factory
// ============================================================================

/**
 * Create a database connection from a URL
 */
function createConnection(url: string): Database {
  const pool = new PgPool({ connectionString: url });
  return drizzleNode(pool, { schema }) as Database;
}

// ============================================================================
// Query Instrumentation
// ============================================================================

let _instrumentationEnabled: boolean | null = null;
const SLOW_QUERY_THRESHOLD_MS = parseInt(
  process.env.SLOW_QUERY_THRESHOLD_MS || "50",
  10,
);

export function isInstrumentationEnabled(): boolean {
  if (_instrumentationEnabled !== null) return _instrumentationEnabled;

  if (process.env.DB_INSTRUMENTATION_DISABLED === "true") {
    _instrumentationEnabled = false;
    return false;
  }

  const env = process.env.NODE_ENV;
  const dwsEnv = process.env.DWS_ENV;

  if (env === "production" && dwsEnv === "production") {
    _instrumentationEnabled = false;
    return false;
  }

  _instrumentationEnabled =
    env === "development" ||
    dwsEnv === "preview" ||
    dwsEnv === "development" ||
    process.env.DB_INSTRUMENTATION_ENABLED === "true";

  return _instrumentationEnabled;
}

function handleSlowQuery(sqlText: string, durationMs: number): void {
  if (process.env.SLOW_QUERY_LOGGING_DISABLED === "true") return;

  const preview = sqlText.substring(0, 120).replace(/\s+/g, " ");
  console.warn(
    `[SlowQuery] ${durationMs}ms | ${preview}${sqlText.length > 120 ? "..." : ""}`,
  );

  import("@/lib/db/slow-query-store")
    .then(({ recordSlowQuery }) => recordSlowQuery(sqlText, durationMs))
    .catch((e) => console.warn("[DB] slow-query-store import failed:", e));

  if (durationMs >= 200) {
    import("@/lib/db/query-alerting")
      .then(({ sendSlowQueryAlert, getAlertSeverity }) => {
        const severity = getAlertSeverity(durationMs);
        if (severity) {
          sendSlowQueryAlert({
            query: sqlText,
            durationMs,
            timestamp: new Date(),
            severity,
          });
        }
      })
      .catch((e) => console.warn("[DB] query-alerting import failed:", e));
  }
}

function wrapWithTiming<T>(
  fn: () => Promise<T>,
  getSql: () => string,
): Promise<T> {
  if (!isInstrumentationEnabled()) return fn();

  const start = performance.now();
  return fn().finally(() => {
    const duration = Math.round(performance.now() - start);
    if (duration >= SLOW_QUERY_THRESHOLD_MS) {
      handleSlowQuery(getSql(), duration);
    }
  });
}

function extractSql(sqlArg: unknown, fallback = "[unknown]"): string {
  if (typeof sqlArg !== "object" || sqlArg === null) return fallback;

  const obj = sqlArg as Record<string, unknown>;

  if (typeof obj.sql === "string") return obj.sql;

  if (typeof obj.toSQL === "function") {
    try {
      const result = (obj.toSQL as () => { sql?: string })();
      if (result?.sql) return result.sql;
    } catch { /* ignore */ }
  }

  if (typeof obj.getSQL === "function") {
    try {
      const sqlObj = (obj.getSQL as () => Record<string, unknown>)();
      if (sqlObj) return extractSql(sqlObj, fallback);
    } catch { /* ignore */ }
  }

  if (Array.isArray(obj.queryChunks)) {
    const parts: string[] = [];
    for (const c of obj.queryChunks) {
      if (c == null) {
        parts.push("?");
      } else if (
        typeof c === "string" ||
        typeof c === "number" ||
        typeof c === "boolean"
      ) {
        parts.push("?");
      } else if (typeof c === "object") {
        const chunk = c as Record<string, unknown>;
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

function instrumentQueryBuilder<T extends object>(
  target: T,
  methodName: string,
): T {
  if (!isInstrumentationEnabled()) return target;

  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop);
      if (typeof value !== "function") return value;

      return function (...args: unknown[]) {
        const result = Reflect.apply(value, obj, args);

        if (result instanceof Promise) {
          const sqlText = extractSql(obj, `[${methodName}]`);
          return wrapWithTiming(
            () => result,
            () => sqlText,
          );
        }

        if (result && typeof result === "object") {
          return instrumentQueryBuilder(result as object, methodName);
        }

        return result;
      };
    },
  });
}

// ============================================================================
// Connection Manager
// ============================================================================

/**
 * Singleton connection manager for all database connections
 */
class DatabaseConnectionManager {
  private connections: Map<string, Database> = new Map();

  /**
   * Get or create a database connection
   */
  getConnection(url: string): Database {
    if (!this.connections.has(url)) {
      this.connections.set(url, createConnection(url));
    }
    return this.connections.get(url)!;
  }

  /**
   * Get write connection - ALWAYS routes to NA primary.
   */
  getWriteConnection(): Database {
    const url = getPrimaryDatabaseUrl();
    return this.getConnection(url);
  }

  /**
   * Get read connection for current region
   */
  getReadConnection(): Database {
    const region = getCurrentRegion();
    const url = getDatabaseUrl(region, "read") || getPrimaryDatabaseUrl();
    return this.getConnection(url);
  }

  /**
   * Get connection for specific region and role.
   */
  getRegionalConnection(region: DatabaseRegion, role: DatabaseRole): Database {
    if (role === "write") {
      return this.getConnection(getPrimaryDatabaseUrl());
    }

    const url = getDatabaseUrl(region, role);
    return this.getConnection(url!);
  }

  /**
   * Get connection info for debugging
   */
  getConnectionInfo(): {
    currentRegion: DatabaseRegion;
    dwsRegion: string | undefined;
    hasEuReadReplica: boolean;
    writesRouteTo: "na_primary";
    readsRouteToEu: boolean;
  } {
    const currentRegion = getCurrentRegion();
    const hasEuReadReplica = !!(process.env.DWS_DATABASE_URL_EU || process.env.DATABASE_URL_EU_READ);
    return {
      currentRegion,
      dwsRegion: process.env.DWS_REGION,
      hasEuReadReplica,
      writesRouteTo: "na_primary",
      readsRouteToEu: currentRegion === "eu" && hasEuReadReplica,
    };
  }
}

const connectionManager = new DatabaseConnectionManager();

// ============================================================================
// Exported Database Instances
// ============================================================================

/**
 * Primary database with instrumentation - Auto-routes to write connection
 */
export const db = new Proxy({} as Database, {
  get: (_, prop) => {
    const database = connectionManager.getWriteConnection();
    const value = database[prop as keyof typeof database];

    if (typeof value !== "function") return value;

    return function (...args: unknown[]) {
      if (prop === "execute" && args[0]) {
        const sqlText = extractSql(args[0]);
        return wrapWithTiming(
          () =>
            (value as (...a: unknown[]) => Promise<unknown>).apply(
              database,
              args,
            ),
          () => sqlText,
        );
      }

      const result = (value as (...a: unknown[]) => unknown).apply(
        database,
        args,
      );

      if (
        result &&
        typeof result === "object" &&
        !(result instanceof Promise)
      ) {
        return instrumentQueryBuilder(result as object, String(prop));
      }

      if (result instanceof Promise) {
        return wrapWithTiming(
          () => result,
          () => `[${String(prop)}]`,
        );
      }

      return result;
    };
  },
});

/**
 * Read database - Routes to read replica in current region
 */
export const dbRead = new Proxy({} as Database, {
  get: (_, prop) => {
    const database = connectionManager.getReadConnection();
    const value = database[prop as keyof typeof database];
    return typeof value === "function" ? value.bind(database) : value;
  },
});

/**
 * Write database - Routes to primary
 */
export const dbWrite = new Proxy({} as Database, {
  get: (_, prop) => {
    const database = connectionManager.getWriteConnection();
    const value = database[prop as keyof typeof database];
    return typeof value === "function" ? value.bind(database) : value;
  },
});

// ============================================================================
// Regional Database Accessors
// ============================================================================

/**
 * EU region database connections.
 */
export const dbEU = {
  read: new Proxy({} as Database, {
    get: (_, prop) => {
      const database = connectionManager.getRegionalConnection("eu", "read");
      const value = database[prop as keyof typeof database];
      return typeof value === "function" ? value.bind(database) : value;
    },
  }),
  write: new Proxy({} as Database, {
    get: (_, prop) => {
      const database = connectionManager.getWriteConnection();
      const value = database[prop as keyof typeof database];
      return typeof value === "function" ? value.bind(database) : value;
    },
  }),
};

/**
 * NA region database connections
 */
export const dbNA = {
  read: new Proxy({} as Database, {
    get: (_, prop) => {
      const database = connectionManager.getRegionalConnection("na", "read");
      const value = database[prop as keyof typeof database];
      return typeof value === "function" ? value.bind(database) : value;
    },
  }),
  write: new Proxy({} as Database, {
    get: (_, prop) => {
      const database = connectionManager.getRegionalConnection("na", "write");
      const value = database[prop as keyof typeof database];
      return typeof value === "function" ? value.bind(database) : value;
    },
  }),
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get connection info for debugging/monitoring
 */
export function getDbConnectionInfo() {
  return connectionManager.getConnectionInfo();
}

/**
 * Execute a read query (uses read replica)
 */
export async function withReadDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  return fn(connectionManager.getReadConnection());
}

/**
 * Execute a write query (uses primary)
 */
export async function withWriteDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  return fn(connectionManager.getWriteConnection());
}

/**
 * Execute with explicit region selection
 */
export async function withRegionalDb<T>(
  region: DatabaseRegion,
  role: DatabaseRole,
  fn: (db: Database) => Promise<T>
): Promise<T> {
  return fn(connectionManager.getRegionalConnection(region, role));
}

// ============================================================================
// Type Exports
// ============================================================================

export type { Database, DatabaseRegion, DatabaseRole };
