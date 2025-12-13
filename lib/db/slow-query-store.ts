/**
 * Slow Query Store
 * 
 * Multi-tier storage for slow query tracking:
 * 1. In-memory store for immediate access (current session)
 * 2. Redis cache for distributed access (across instances)
 * 3. PostgreSQL for persistent historical data
 * 
 * Only active in development/staging environments.
 */

import { Redis } from "@upstash/redis";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db/client";
import { slowQueryLog } from "@/db/schemas/slow-query-log";
import { sql } from "drizzle-orm";

/** Slow query entry structure */
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

/** Redis key prefix for slow queries */
const REDIS_KEY_PREFIX = "slow_query:";
const REDIS_TTL_SECONDS = 86400; // 24 hours

/** In-memory store for current session */
const memoryStore = new Map<string, SlowQueryEntry>();

/** Redis client singleton */
let redis: Redis | null = null;
let redisInitialized = false;

/**
 * Gets or initializes Redis client.
 */
function getRedis(): Redis | null {
  if (redisInitialized) return redis;
  redisInitialized = true;

  const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
  const restUrl = process.env.KV_REST_API_URL;
  const restToken = process.env.KV_REST_API_TOKEN;

  if (redisUrl) {
    redis = Redis.fromEnv();
    logger.debug("[SlowQueryStore] Redis initialized (native protocol)");
  } else if (restUrl && restToken) {
    redis = new Redis({ url: restUrl, token: restToken });
    logger.debug("[SlowQueryStore] Redis initialized (REST API)");
  } else {
    logger.debug("[SlowQueryStore] Redis not available, using memory-only");
    redis = null;
  }

  return redis;
}

/**
 * Creates a hash of the SQL query for grouping.
 * Normalizes the query by removing variable values.
 */
export function hashQuery(sql: string): string {
  // Normalize: remove extra whitespace, lowercase
  let normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
  
  // Replace literal values with placeholders for grouping
  // Numbers
  normalized = normalized.replace(/\b\d+\b/g, "?");
  // Quoted strings
  normalized = normalized.replace(/'[^']*'/g, "'?'");
  // UUIDs
  normalized = normalized.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "?"
  );

  // Create hash
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Records a slow query to all storage tiers.
 */
export async function recordSlowQuery(
  sqlText: string,
  durationMs: number,
  sourceFile?: string,
  sourceFunction?: string
): Promise<void> {
  const queryHash = hashQuery(sqlText);
  const now = new Date();

  // 1. Update in-memory store
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
      sqlText: sqlText.substring(0, 10000), // Limit SQL size
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
  }

  // 2. Update Redis (async, don't block)
  const redisClient = getRedis();
  if (redisClient) {
    const entry = memoryStore.get(queryHash);
    if (entry) {
      redisClient.setex(
        `${REDIS_KEY_PREFIX}${queryHash}`,
        REDIS_TTL_SECONDS,
        JSON.stringify(entry)
      ).catch(err => {
        logger.debug("[SlowQueryStore] Redis write failed:", err);
      });
    }
  }

  // 3. Update PostgreSQL (async, batch if possible)
  // Using upsert to aggregate
  updatePostgres(queryHash, sqlText, durationMs, sourceFile, sourceFunction, now);
}

/** Debounced PostgreSQL writes */
const postgresQueue = new Map<string, {
  queryHash: string;
  sqlText: string;
  durationMs: number;
  sourceFile?: string;
  sourceFunction?: string;
  timestamp: Date;
}>();
let postgresFlushTimeout: ReturnType<typeof setTimeout> | null = null;
const POSTGRES_FLUSH_INTERVAL = 5000; // 5 seconds

/**
 * Queues a slow query for PostgreSQL write.
 */
function updatePostgres(
  queryHash: string,
  sqlText: string,
  durationMs: number,
  sourceFile?: string,
  sourceFunction?: string,
  timestamp: Date = new Date()
): void {
  postgresQueue.set(queryHash, {
    queryHash,
    sqlText: sqlText.substring(0, 10000),
    durationMs,
    sourceFile,
    sourceFunction,
    timestamp,
  });

  if (!postgresFlushTimeout) {
    postgresFlushTimeout = setTimeout(flushToPostgres, POSTGRES_FLUSH_INTERVAL);
  }
}

/**
 * Flushes queued slow queries to PostgreSQL.
 */
async function flushToPostgres(): Promise<void> {
  postgresFlushTimeout = null;
  
  if (postgresQueue.size === 0) return;

  const entries = Array.from(postgresQueue.values());
  postgresQueue.clear();

  for (const entry of entries) {
    const memEntry = memoryStore.get(entry.queryHash);
    if (!memEntry) continue;

    // Upsert with aggregation
    await db.execute(sql`
      INSERT INTO slow_query_log (
        query_hash,
        sql_text,
        duration_ms,
        call_count,
        total_duration_ms,
        avg_duration_ms,
        min_duration_ms,
        max_duration_ms,
        source_file,
        source_function,
        first_seen_at,
        last_seen_at
      ) VALUES (
        ${memEntry.queryHash},
        ${memEntry.sqlText},
        ${memEntry.durationMs},
        ${memEntry.callCount},
        ${memEntry.totalDurationMs},
        ${memEntry.avgDurationMs.toFixed(2)},
        ${memEntry.minDurationMs},
        ${memEntry.maxDurationMs},
        ${memEntry.sourceFile ?? null},
        ${memEntry.sourceFunction ?? null},
        ${memEntry.firstSeenAt},
        ${memEntry.lastSeenAt}
      )
      ON CONFLICT (query_hash) DO UPDATE SET
        duration_ms = EXCLUDED.duration_ms,
        call_count = slow_query_log.call_count + 1,
        total_duration_ms = slow_query_log.total_duration_ms + EXCLUDED.duration_ms,
        avg_duration_ms = (slow_query_log.total_duration_ms + EXCLUDED.duration_ms) / (slow_query_log.call_count + 1),
        min_duration_ms = LEAST(slow_query_log.min_duration_ms, EXCLUDED.duration_ms),
        max_duration_ms = GREATEST(slow_query_log.max_duration_ms, EXCLUDED.duration_ms),
        last_seen_at = EXCLUDED.last_seen_at
    `).catch(err => {
      logger.debug("[SlowQueryStore] PostgreSQL write failed:", err);
    });
  }
}

/**
 * Gets all slow queries from memory store.
 */
export function getSlowQueriesFromMemory(): SlowQueryEntry[] {
  return Array.from(memoryStore.values());
}

/**
 * Gets top slow queries sorted by average duration.
 */
export function getTopSlowQueries(limit = 20): SlowQueryEntry[] {
  return getSlowQueriesFromMemory()
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, limit);
}

/**
 * Gets most frequent slow queries.
 */
export function getMostFrequentSlowQueries(limit = 20): SlowQueryEntry[] {
  return getSlowQueriesFromMemory()
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, limit);
}

/**
 * Gets slow query stats summary.
 */
export function getSlowQueryStats(): {
  totalQueries: number;
  totalCalls: number;
  avgDuration: number;
  maxDuration: number;
} {
  const queries = getSlowQueriesFromMemory();
  const totalCalls = queries.reduce((sum, q) => sum + q.callCount, 0);
  const totalDuration = queries.reduce((sum, q) => sum + q.totalDurationMs, 0);
  const maxDuration = Math.max(...queries.map(q => q.maxDurationMs), 0);

  return {
    totalQueries: queries.length,
    totalCalls,
    avgDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
    maxDuration,
  };
}

/**
 * Clears the in-memory store.
 */
export function clearMemoryStore(): void {
  memoryStore.clear();
}

/**
 * Forces flush of pending PostgreSQL writes.
 */
export async function forceFlush(): Promise<void> {
  if (postgresFlushTimeout) {
    clearTimeout(postgresFlushTimeout);
    postgresFlushTimeout = null;
  }
  await flushToPostgres();
}

