import { Redis } from "@upstash/redis";
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

const REDIS_KEY_PREFIX = "slow_query:";
const REDIS_TTL_SECONDS = parseInt(
  process.env.SLOW_QUERY_REDIS_TTL || "86400",
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

function evictOldestEntries(): void {
  if (memoryStore.size <= MAX_MEMORY_ENTRIES) return;

  const entries = Array.from(memoryStore.entries()).sort(
    (a, b) => a[1].lastSeenAt.getTime() - b[1].lastSeenAt.getTime(),
  );

  const toEvict = entries.slice(0, memoryStore.size - MAX_MEMORY_ENTRIES);
  for (const [hash] of toEvict) {
    memoryStore.delete(hash);
  }
}

let redis: Redis | null = null;
let redisInitialized = false;
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

function getRedis(): Redis | null {
  if (redisInitialized) return redis;
  redisInitialized = true;

  const nativeUrl = process.env.REDIS_URL || process.env.KV_URL;
  const restUrl = process.env.KV_REST_API_URL;
  const restToken = process.env.KV_REST_API_TOKEN;

  if (nativeUrl) {
    redis = Redis.fromEnv();
    console.info("[SlowQueryStore] Redis initialized (native protocol)");
  } else if (restUrl && restToken) {
    redis = new Redis({ url: restUrl, token: restToken });
    console.info("[SlowQueryStore] Redis initialized (REST API)");
  }

  return redis;
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

  const redisClient = getRedis();
  const entry = memoryStore.get(queryHash);
  if (redisClient && entry) {
    redisClient
      .setex(
        `${REDIS_KEY_PREFIX}${queryHash}`,
        REDIS_TTL_SECONDS,
        JSON.stringify(entry),
      )
      .catch((e: Error) =>
        console.warn("[SlowQueryStore] Redis write failed:", e.message),
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

export function isRedisAvailable(): boolean {
  return getRedis() !== null;
}

export async function getSlowQueryKeysFromRedis(): Promise<string[]> {
  const redisClient = getRedis();
  if (!redisClient) return [];

  try {
    // Use SCAN instead of KEYS to handle large datasets
    const keys: string[] = [];
    let cursor: string | number = 0;
    do {
      const [nextCursor, batch] = await redisClient.scan(cursor, {
        match: `${REDIS_KEY_PREFIX}*`,
        count: 100,
      });
      cursor =
        typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor;
      keys.push(...batch);
    } while (cursor !== 0);
    return keys.map((k) => k.replace(REDIS_KEY_PREFIX, ""));
  } catch (e) {
    console.debug("[SlowQueryStore] Redis scan failed:", (e as Error).message);
    return [];
  }
}

export async function getSlowQueryFromRedis(
  queryHash: string,
): Promise<SlowQueryEntry | null> {
  const redisClient = getRedis();
  if (!redisClient) return null;

  try {
    const data = await redisClient.get<string>(
      `${REDIS_KEY_PREFIX}${queryHash}`,
    );
    if (!data) return null;

    const entry = typeof data === "string" ? JSON.parse(data) : data;
    entry.firstSeenAt = new Date(entry.firstSeenAt);
    entry.lastSeenAt = new Date(entry.lastSeenAt);
    return entry;
  } catch (e) {
    console.debug("[SlowQueryStore] Redis get failed:", (e as Error).message);
    return null;
  }
}

export async function getSlowQueriesFromRedis(): Promise<SlowQueryEntry[]> {
  const redisClient = getRedis();
  if (!redisClient) return [];

  try {
    const keys = await redisClient.keys(`${REDIS_KEY_PREFIX}*`);
    if (keys.length === 0) return [];

    const entries: SlowQueryEntry[] = [];
    for (const key of keys) {
      const data = await redisClient.get<string>(key);
      if (data) {
        const entry = typeof data === "string" ? JSON.parse(data) : data;
        entry.firstSeenAt = new Date(entry.firstSeenAt);
        entry.lastSeenAt = new Date(entry.lastSeenAt);
        entries.push(entry);
      }
    }
    return entries;
  } catch (e) {
    console.debug("[SlowQueryStore] Redis read failed:", (e as Error).message);
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

export function resetRedisState(): void {
  redis = null;
  redisInitialized = false;
}
