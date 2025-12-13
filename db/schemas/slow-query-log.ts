/**
 * Slow Query Log Schema
 * 
 * Tracks database queries that exceed the performance threshold (50ms).
 * Used for identifying optimization opportunities.
 */

import { pgTable, text, integer, bigint, numeric, timestamp, uuid } from "drizzle-orm/pg-core";
import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";

/**
 * Slow query log table for tracking database performance issues.
 */
export const slowQueryLog = pgTable("slow_query_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  /** MD5 hash of normalized SQL for deduplication */
  queryHash: text("query_hash").notNull().unique(),
  
  /** The SQL query text */
  sqlText: text("sql_text").notNull(),
  
  /** Most recent execution duration in milliseconds */
  durationMs: integer("duration_ms").notNull(),
  
  // Aggregation fields
  /** Number of times this query was logged as slow */
  callCount: integer("call_count").notNull().default(1),
  
  /** Total execution time across all calls */
  totalDurationMs: bigint("total_duration_ms", { mode: "number" }).notNull().default(0),
  
  /** Running average execution time */
  avgDurationMs: numeric("avg_duration_ms", { precision: 10, scale: 2 }).notNull().default("0"),
  
  /** Minimum execution time recorded */
  minDurationMs: integer("min_duration_ms").notNull().default(0),
  
  /** Maximum execution time recorded */
  maxDurationMs: integer("max_duration_ms").notNull().default(0),
  
  // Context
  /** Source file where query originated */
  sourceFile: text("source_file"),
  
  /** Source function where query originated */
  sourceFunction: text("source_function"),
  
  // Timestamps
  /** When this query was first logged */
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  
  /** When this query was last logged */
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  
  /** Record creation timestamp */
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SlowQueryLog = InferSelectModel<typeof slowQueryLog>;
export type NewSlowQueryLog = InferInsertModel<typeof slowQueryLog>;

