import { pgTable, text, integer, bigint, numeric, timestamp, uuid } from "drizzle-orm/pg-core";
import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";

export const slowQueryLog = pgTable("slow_query_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  queryHash: text("query_hash").notNull().unique(),
  sqlText: text("sql_text").notNull(),
  durationMs: integer("duration_ms").notNull(),
  callCount: integer("call_count").notNull().default(1),
  totalDurationMs: bigint("total_duration_ms", { mode: "number" }).notNull().default(0),
  avgDurationMs: numeric("avg_duration_ms", { precision: 10, scale: 2 }).notNull().default("0"),
  minDurationMs: integer("min_duration_ms").notNull().default(0),
  maxDurationMs: integer("max_duration_ms").notNull().default(0),
  sourceFile: text("source_file"),
  sourceFunction: text("source_function"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SlowQueryLog = InferSelectModel<typeof slowQueryLog>;
export type NewSlowQueryLog = InferInsertModel<typeof slowQueryLog>;
