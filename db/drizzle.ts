import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./sass/schema";

type DatabaseType = NeonDatabase<typeof schema> | NodePgDatabase<typeof schema>;

let _db: DatabaseType | null = null;

function getDb(): DatabaseType {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL environment variable is not set. Make sure you have a .env.local file with DATABASE_URL defined."
      );
    }

    const isLocalDatabase =
      databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

    if (isLocalDatabase) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg");
      const pool = new Pool({ connectionString: databaseUrl });
      _db = drizzlePg(pool, { schema });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("@neondatabase/serverless");
      const pool = new Pool({ connectionString: databaseUrl });
      _db = drizzleNeon(pool, { schema });
    }
  }

  return _db;
}

export const db = new Proxy({} as DatabaseType, {
  get: (_, prop) => {
    const database = getDb();
    const value = database[prop as keyof typeof database];
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export * from "./sass/schema";
