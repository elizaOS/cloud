/**
 * Miniapp auth sessions schema.
 * 
 * Manages authentication sessions for the miniapp pass-through auth flow.
 * Similar to CLI auth sessions but for web-based miniapps that can't use Privy directly.
 */

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users, organizations } from "./index";

export const miniappAuthSessions = pgTable("miniapp_auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  
  // Session identifier (passed in URL during auth flow)
  session_id: text("session_id").notNull().unique(),
  
  // Status: pending → authenticated → used
  status: text("status").notNull().default("pending"),
  
  // Where to redirect after auth (miniapp URL)
  callback_url: text("callback_url").notNull(),
  
  // App identifier (for multi-app support in the future)
  app_id: text("app_id"),
  
  // User info (populated after authentication)
  user_id: uuid("user_id").references(() => users.id),
  organization_id: uuid("organization_id").references(() => organizations.id),
  
  // Auth token (generated after successful Privy login, used for API calls)
  auth_token: text("auth_token"),
  auth_token_hash: text("auth_token_hash"),
  
  // Timestamps
  created_at: timestamp("created_at").defaultNow().notNull(),
  authenticated_at: timestamp("authenticated_at"),
  expires_at: timestamp("expires_at").notNull(),
  used_at: timestamp("used_at"),
});

export type MiniappAuthSession = typeof miniappAuthSessions.$inferSelect;
export type NewMiniappAuthSession = typeof miniappAuthSessions.$inferInsert;

