/**
 * Slow Query Store - Multi-tier storage for slow query tracking
 * 
 * Architecture: Memory → DWS Cache → PostgreSQL
 * - Memory: Immediate access, bounded to MAX_MEMORY_ENTRIES (default 1000)
 * - DWS Cache: Persistent cache with TTL (default 24h), fire-and-forget writes
 * - PostgreSQL: Permanent storage, batched writes every FLUSH_INTERVAL (default 5s)
 * 
 * Limitations:
 * - Memory store is per-process (serverless: each instance has its own)
 * - Cache writes are async/fire-and-forget (may be lost on crash)
 * - PostgreSQL flush interval means up to 5s of data loss on crash
 * - LRU eviction discards oldest entries when over limit
 * 
 * Configuration (env vars):
 * - SLOW_QUERY_THRESHOLD_MS: Min duration to track (default 50)
 * - SLOW_QUERY_CACHE_TTL: Cache TTL in seconds (default 86400)
 * - SLOW_QUERY_FLUSH_INTERVAL: PG flush interval ms (default 5000)
 * - SLOW_QUERY_MAX_MEMORY: Max in-memory entries (default 1000)
 */

import { DWSCache } from "@/lib/services/dws/cache";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export interface SlowQueryEntry {
  queryHash: string;
  sqlText: string;
  durationMs: number;
  callCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  sourceFile?: string;
  sourceFunction?: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

const CACHE_KEY_PREFIX = "slow_query:";
const CACHE_TTL_SECONDS = parseInt(
  process.env.SLOW_QUERY_CACHE_TTL || "86400",
  10,
);
const POSTGRES_FLUSH_INTERVAL = parseInt(
  process.env.SLOW_QUERY_FLUSH_INTERVAL || "5000",
  10,
);
const MAX_MEMORY_ENTRIES = parseInt(
  process.env.SLOW_QUERY_MAX_MEMORY || "1000",
  10,
);

const memoryStore = new Map<string, SlowQueryEntry>();
const postgresQueue = new Map<string, SlowQueryEntry>();
let memoryWarningLogged = false;

function evictOldestEntries(): void {
  if (!memoryWarningLogged && memoryStore.size > MAX_MEMORY_ENTRIES * 0.8) {
    console.warn(`[SlowQueryStore] Memory store at ${memoryStore.size}/${MAX_MEMORY_ENTRIES} entries`);
    memoryWarningLogged = true;
  }

  if (memoryStore.size <= MAX_MEMORY_ENTRIES) return;

  const entries = Array.from(memoryStore.entries()).sort(
    (a, b) => a[1].lastSeenAt.getTime() - b[1].lastSeenAt.getTime(),
  );

  const toEvict = entries.slice(0, memoryStore.size - MAX_MEMORY_ENTRIES);
  for (const [hash] of toEvict) {
    memoryStore.delete(hash);
  }
}

let dwsCache: DWSCache | null = null;
let cacheInitialized = false;
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

function getCache(): DWSCache | null {
  if (cacheInitialized) return dwsCache;
  cacheInitialized = true;

  if (process.env.CACHE_ENABLED === "false") {
    return null;
  }

  try {
    dwsCache = new DWSCache({
      namespace: "slow-queries",
      defaultTTL: CACHE_TTL_SECONDS,
    });
    console.info("[SlowQueryStore] DWS cache initialized");
    return dwsCache;
  } catch {
    return null;
  }
}

export function hashQuery(sqlText: string): string {
  let normalized = sqlText.replace(/\s+/g, " ").trim().toLowerCase();
  normalized = normalized.replace(/\b\d+\b/g, "?");
  normalized = normalized.replace(/'[^']*'/g, "'?'");
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "?",
  );

  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export async function recordSlowQuery(
  sqlText: string,
  durationMs: number,
  sourceFile?: string,
  sourceFunction?: string,
): Promise<void> {
  const queryHash = hashQuery(sqlText);
  const now = new Date();
  const truncatedSql = sqlText.substring(0, 10000);

  const existing = memoryStore.get(queryHash);
  if (existing) {
    existing.callCount++;
    existing.totalDurationMs += durationMs;
    existing.avgDurationMs = existing.totalDurationMs / existing.callCount;
    existing.minDurationMs = Math.min(existing.minDurationMs, durationMs);
    existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
    existing.lastSeenAt = now;
    existing.durationMs = durationMs;
  } else {
    memoryStore.set(queryHash, {
      queryHash,
      sqlText: truncatedSql,
      durationMs,
      callCount: 1,
      totalDurationMs: durationMs,
      avgDurationMs: durationMs,
      minDurationMs: durationMs,
      maxDurationMs: durationMs,
      sourceFile,
      sourceFunction,
      firstSeenAt: now,
      lastSeenAt: now,
    });
    evictOldestEntries();
  }

  const cache = getCache();
  const entry = memoryStore.get(queryHash);
  if (cache && entry) {
    cache
      .setex(
        `${CACHE_KEY_PREFIX}${queryHash}`,
        CACHE_TTL_SECONDS,
        JSON.stringify(entry),
      )
      .catch((e: Error) =>
        console.warn("[SlowQueryStore] Cache write failed:", e.message),
      );
  }

  if (entry) {
    postgresQueue.set(queryHash, entry);
    if (!flushTimeout) {
      flushTimeout = setTimeout(flushToPostgres, POSTGRES_FLUSH_INTERVAL);
    }
  }
}

async function flushToPostgres(): Promise<void> {
  flushTimeout = null;
  if (postgresQueue.size === 0) return;

  const entries = Array.from(postgresQueue.values());
  postgresQueue.clear();

  for (const entry of entries) {
    await db
      .execute(
        sql`
      INSERT INTO slow_query_log (
        query_hash, sql_text, duration_ms, call_count, total_duration_ms,
        avg_duration_ms, min_duration_ms, max_duration_ms,
        source_file, source_function, first_seen_at, last_seen_at
      ) VALUES (
        ${entry.queryHash}, ${entry.sqlText}, ${entry.durationMs},
        ${entry.callCount}, ${entry.totalDurationMs}, ${entry.avgDurationMs.toFixed(2)},
        ${entry.minDurationMs}, ${entry.maxDurationMs},
        ${entry.sourceFile ?? null}, ${entry.sourceFunction ?? null},
        ${entry.firstSeenAt}, ${entry.lastSeenAt}
      )
      ON CONFLICT (query_hash) DO UPDATE SET
        duration_ms = EXCLUDED.duration_ms,
        call_count = slow_query_log.call_count + 1,
        total_duration_ms = slow_query_log.total_duration_ms + EXCLUDED.duration_ms,
        avg_duration_ms = (slow_query_log.total_duration_ms + EXCLUDED.duration_ms) / (slow_query_log.call_count + 1),
        min_duration_ms = LEAST(slow_query_log.min_duration_ms, EXCLUDED.duration_ms),
        max_duration_ms = GREATEST(slow_query_log.max_duration_ms, EXCLUDED.duration_ms),
        last_seen_at = EXCLUDED.last_seen_at
    `,
      )
      .catch((e: Error) =>
        console.warn("[SlowQueryStore] PostgreSQL write failed:", e.message),
      );
  }
}

export function getSlowQueriesFromMemory(): SlowQueryEntry[] {
  return Array.from(memoryStore.values());
}

export function isCacheAvailable(): boolean {
  return getCache() !== null;
}

export async function getSlowQueryKeysFromCache(): Promise<string[]> {
  const cache = getCache();
  if (!cache) return [];

  try {
    const keys: string[] = [];
    let cursor: string | number = 0;
    do {
      const [nextCursor, batch] = await cache.scan(
        typeof cursor === "string" ? parseInt(cursor, 10) : cursor,
        { match: `${CACHE_KEY_PREFIX}*`, count: 100 }
      );
      cursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : parseInt(nextCursor, 10);
      keys.push(...batch);
    } while (cursor !== 0);
    return keys.map((k) => k.replace(CACHE_KEY_PREFIX, ""));
  } catch (e) {
    console.debug("[SlowQueryStore] Cache scan failed:", (e as Error).message);
    return [];
  }
}

export async function getSlowQueryFromCache(
  queryHash: string,
): Promise<SlowQueryEntry | null> {
  const cache = getCache();
  if (!cache) return null;

  try {
    const data = await cache.get<string>(
      `${CACHE_KEY_PREFIX}${queryHash}`,
    );
    if (!data) return null;

    const entry = typeof data === "string" ? JSON.parse(data) : data;
    entry.firstSeenAt = new Date(entry.firstSeenAt);
    entry.lastSeenAt = new Date(entry.lastSeenAt);
    return entry;
  } catch (e) {
    console.debug("[SlowQueryStore] Cache get failed:", (e as Error).message);
    return null;
  }
}

export async function getSlowQueriesFromCache(): Promise<SlowQueryEntry[]> {
  const cache = getCache();
  if (!cache) return [];

  try {
    const keys = await cache.keys(`${CACHE_KEY_PREFIX}*`);
    if (keys.length === 0) return [];

    const entries: SlowQueryEntry[] = [];
    for (const key of keys) {
      const data = await cache.get<string>(key);
      if (data) {
        const entry = typeof data === "string" ? JSON.parse(data) : data;
        entry.firstSeenAt = new Date(entry.firstSeenAt);
        entry.lastSeenAt = new Date(entry.lastSeenAt);
        entries.push(entry);
      }
    }
    return entries;
  } catch (e) {
    console.debug("[SlowQueryStore] Cache read failed:", (e as Error).message);
    return [];
  }
}

export function getTopSlowQueries(limit = 20): SlowQueryEntry[] {
  return getSlowQueriesFromMemory()
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, limit);
}

export function getMostFrequentSlowQueries(limit = 20): SlowQueryEntry[] {
  return getSlowQueriesFromMemory()
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, limit);
}

export function getSlowQueryStats(): {
  totalQueries: number;
  totalCalls: number;
  avgDuration: number;
  maxDuration: number;
} {
  const queries = getSlowQueriesFromMemory();
  const totalCalls = queries.reduce((sum, q) => sum + q.callCount, 0);
  const totalDuration = queries.reduce((sum, q) => sum + q.totalDurationMs, 0);
  const maxDuration = Math.max(0, ...queries.map((q) => q.maxDurationMs));

  return {
    totalQueries: queries.length,
    totalCalls,
    avgDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
    maxDuration,
  };
}

export function clearMemoryStore(): void {
  memoryStore.clear();
}

export async function forceFlush(): Promise<void> {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  await flushToPostgres();
}

export function resetCacheState(): void {
  dwsCache = null;
  cacheInitialized = false;
}
