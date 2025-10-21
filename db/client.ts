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

function isNeonDatabase(url: string): boolean {
  // Check if the URL is a Neon database (contains neon.tech domain)
  return url.includes("neon.tech") || url.includes("neon.database");
}

function getDb() {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL environment variable is not set. Make sure you have a .env.local file with DATABASE_URL defined.",
      );
    }

    if (isNeonDatabase(databaseUrl)) {
      // Production: Use Neon serverless driver with WebSocket support
      console.log("[Database] Using Neon serverless driver for production");

      // Configure WebSocket for Node.js environment
      if (typeof WebSocket === "undefined") {
        neonConfig.webSocketConstructor = ws;
      }

      const pool = new NeonPool({ connectionString: databaseUrl });
      _db = drizzleNeon(pool, { schema }) as Database;
    } else {
      // Local development: Use regular PostgreSQL driver
      console.log(
        "[Database] Using node-postgres driver for local development",
      );

      const pool = new PgPool({ connectionString: databaseUrl });
      _db = drizzleNode(pool, { schema }) as Database;
    }
  }

  return _db;
}

export const db = new Proxy({} as Database, {
  get: (_, prop) => {
    const database = getDb();
    const value = database[prop as keyof typeof database];
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export type { Database };
