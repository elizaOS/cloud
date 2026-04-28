/**
 * Drizzle Neon HTTP client factory for Workers.
 *
 * Each request gets its own client. The Neon HTTP driver is fetch-based and
 * stateless, so there is no connection pool to manage. Schema is imported
 * from the shared `@/db` package — read-only from API code.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "../../../packages/db/schemas";
import type { AppContext, Bindings } from "./context";

export type Db = NeonHttpDatabase<typeof schema>;

const cache = new WeakMap<Bindings, Db>();

/**
 * Get the Drizzle DB client for the current request.
 *
 * Cached per `c.env` instance because Workers reuses the same `env` object
 * across handler invocations within a single request, and Neon's `neon()`
 * factory is cheap-but-not-free (it parses the URL on each call).
 */
export function getDb(c: AppContext): Db {
  const env = c.env;
  const cached = cache.get(env);
  if (cached) return cached;
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  const sql = neon(url);
  const db = drizzle(sql, { schema });
  cache.set(env, db);
  return db;
}

export { schema };
