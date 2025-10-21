/**
 * ALB Priority Management Schema
 *
 * Tracks ALB listener rule priorities to ensure uniqueness across all user deployments.
 * ALB priorities must be unique integers between 1 and 50,000.
 */

import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";

export const albPriorities = pgTable("alb_priorities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  priority: integer("priority").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export type AlbPriority = typeof albPriorities.$inferSelect;
export type NewAlbPriority = typeof albPriorities.$inferInsert;
