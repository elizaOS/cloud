import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import * as sassSchema from "./schemas";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

const schema = { ...sassSchema };

let _db: NeonDatabase<typeof schema> | null = null;

function getDb() {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL environment variable is not set. Make sure you have a .env.local file with DATABASE_URL defined.",
      );
    }

    const pool = new Pool({ connectionString: databaseUrl });
    _db = drizzle(pool, { schema });
  }

  return _db;
}

export const db = new Proxy({} as NeonDatabase<typeof schema>, {
  get: (_, prop) => {
    const database = getDb();
    const value = database[prop as keyof typeof database];
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export type Database = typeof db;
