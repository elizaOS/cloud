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
 * Gets or creates the database connection instance.
 * 
 * Automatically selects the appropriate driver based on DATABASE_URL:
 * - Neon serverless driver for production (neon.tech domains)
 * - Node PostgreSQL driver for local development
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
