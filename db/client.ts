import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNeonWs } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import {
  Pool as NeonPool,
  neon,
  neonConfig,
  type NeonQueryFunction,
} from "@neondatabase/serverless";
import * as schema from "./schemas";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

/**
 * Union type for supported database drivers.
 *
 * - NodePgDatabase: Local PostgreSQL (fastest for local dev)
 * - NeonHttpDatabase: Neon HTTP driver (sub-10ms for serverless queries)
 * - NeonDatabase: Neon WebSocket driver (for transactions)
 */
type Database =
  | NodePgDatabase<typeof schema>
  | NeonHttpDatabase<typeof schema>
  | NeonDatabase<typeof schema>;

let _httpDb: NeonHttpDatabase<typeof schema> | null = null;
let _wsDb: NeonDatabase<typeof schema> | null = null;
let _localDb: NodePgDatabase<typeof schema> | null = null;
let _neonSql: NeonQueryFunction<false, false> | null = null;
let _pooledEndpointWarningLogged = false;
let _driverInitLogged = false;

/**
 * Checks if a database URL is for Neon serverless.
 */
function isNeonDatabase(url: string): boolean {
  return url.includes("neon.tech") || url.includes("neon.database");
}

/**
 * Checks if a database URL uses a pooled endpoint.
 * Pooled endpoints contain "-pooler." in the hostname.
 */
function isPooledEndpoint(url: string): boolean {
  return url.includes("-pooler.");
}

/**
 * Logs a warning if not using a pooled endpoint (only once).
 */
function warnIfNotPooled(url: string): void {
  if (_pooledEndpointWarningLogged) return;
  if (isNeonDatabase(url) && !isPooledEndpoint(url)) {
    console.warn(
      "⚠️ [Database] Not using Neon pooled endpoint. " +
        "For better serverless performance, use a pooled connection string " +
        "(hostname should contain '-pooler.'). " +
        "Get your pooled connection string from the Neon Console.",
    );
    _pooledEndpointWarningLogged = true;
  }
}

/**
 * Gets the database URL with validation.
 */
function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is not set. Make sure you have a .env.local file with DATABASE_URL defined.",
    );
  }

  return databaseUrl;
}

/**
 * Gets or creates the HTTP-based database connection (for queries).
 * Returns null if using local PostgreSQL.
 */
function getHttpDb(): NeonHttpDatabase<typeof schema> | null {
  const databaseUrl = getDatabaseUrl();

  if (!isNeonDatabase(databaseUrl)) {
    return null;
  }

  if (!_httpDb) {
    warnIfNotPooled(databaseUrl);
    _neonSql = neon(databaseUrl);
    _httpDb = drizzleNeonHttp(_neonSql, { schema });

    if (!_driverInitLogged) {
      console.info(
        "✓ [Database] Initialized Neon HTTP driver (sub-10ms queries)",
      );
      _driverInitLogged = true;
    }
  }

  return _httpDb;
}

/**
 * Gets or creates the WebSocket-based database connection (for transactions).
 * Returns null if using local PostgreSQL.
 */
function getWsDb(): NeonDatabase<typeof schema> | null {
  const databaseUrl = getDatabaseUrl();

  if (!isNeonDatabase(databaseUrl)) {
    return null;
  }

  if (!_wsDb) {
    warnIfNotPooled(databaseUrl);

    // Configure WebSocket for Node.js environment
    if (typeof WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }

    // Optimized pool settings for serverless
    const pool = new NeonPool({
      connectionString: databaseUrl,
      max: 5, // Limit connections in serverless
      idleTimeoutMillis: 10000, // Close idle connections quickly
      connectionTimeoutMillis: 10000, // Fail fast on connection issues
    });

    _wsDb = drizzleNeonWs(pool, { schema });
    console.info("✓ [Database] Initialized Neon WebSocket pool for transactions");
  }

  return _wsDb;
}

/**
 * Gets or creates the local PostgreSQL database connection.
 */
function getLocalDb(): NodePgDatabase<typeof schema> {
  if (!_localDb) {
    const databaseUrl = getDatabaseUrl();
    const pool = new PgPool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    _localDb = drizzleNode(pool, { schema });

    if (!_driverInitLogged) {
      console.info("✓ [Database] Initialized local PostgreSQL driver");
      _driverInitLogged = true;
    }
  }

  return _localDb;
}

/**
 * Gets the appropriate database instance based on the operation type.
 *
 * - For regular queries: Uses HTTP driver (Neon) or local PostgreSQL
 * - For transactions: Uses WebSocket driver (Neon) or local PostgreSQL
 */
function getDb(forTransaction = false): Database {
  const databaseUrl = getDatabaseUrl();

  if (!isNeonDatabase(databaseUrl)) {
    return getLocalDb();
  }

  if (forTransaction) {
    const wsDb = getWsDb();
    if (!wsDb) throw new Error("Failed to initialize WebSocket database");
    return wsDb;
  }

  const httpDb = getHttpDb();
  if (!httpDb) throw new Error("Failed to initialize HTTP database");
  return httpDb;
}

/**
 * Database proxy that lazily initializes the connection on first access.
 *
 * Smart routing:
 * - Regular queries use HTTP driver (sub-10ms latency)
 * - Transactions automatically use WebSocket driver (required for db.transaction)
 *
 * This ensures optimal performance for most queries while maintaining
 * full transaction support without requiring code changes.
 */
export const db = new Proxy({} as Database, {
  get: (_, prop) => {
    // Route transactions to WebSocket driver (HTTP driver doesn't support transactions)
    if (prop === "transaction") {
      const database = getDb(true);
      const transactionFn = database[prop as keyof typeof database];
      return typeof transactionFn === "function"
        ? transactionFn.bind(database)
        : transactionFn;
    }

    // All other operations use HTTP driver for speed
    const database = getDb(false);
    const value = database[prop as keyof typeof database];
    return typeof value === "function" ? value.bind(database) : value;
  },
});

/**
 * Explicit WebSocket database for transaction-heavy code paths.
 *
 * Use this when you need to run multiple queries in sequence that
 * share state or when you need interactive transactions.
 *
 * For single queries, prefer using `db` which uses the faster HTTP driver.
 */
export const dbTransaction = new Proxy({} as Database, {
  get: (_, prop) => {
    const database = getDb(true);
    const value = database[prop as keyof typeof database];
    return typeof value === "function" ? value.bind(database) : value;
  },
});

/**
 * Checks if the database is configured for optimal serverless performance.
 * Useful for health checks and diagnostics.
 */
export function getDatabaseConfig(): {
  isNeon: boolean;
  isPooled: boolean;
  driver: "http" | "websocket" | "node-postgres";
  recommendation?: string;
} {
  const databaseUrl = process.env.DATABASE_URL || "";
  const isNeon = isNeonDatabase(databaseUrl);
  const isPooled = isNeon ? isPooledEndpoint(databaseUrl) : true;

  const config = {
    isNeon,
    isPooled,
    driver: (isNeon ? "http" : "node-postgres") as
      | "http"
      | "websocket"
      | "node-postgres",
    recommendation: undefined as string | undefined,
  };

  if (isNeon && !isPooled) {
    config.recommendation =
      "Switch to a pooled connection string for better serverless performance. " +
      "Update DATABASE_URL to use the '-pooler.' hostname from Neon Console.";
  }

  return config;
}

export type { Database };
