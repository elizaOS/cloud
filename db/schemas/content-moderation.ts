/**
 * Content Moderation Schema
 * Unified moderation tracking for all content types: images, text, agents, domains
 */

import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  integer,
  real,
  boolean,
  bigint,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

export const contentTypeEnum = pgEnum("content_mod_type", [
  "image",
  "text", 
  "agent",
  "domain",
  "file",
]);

export const moderationStatusEnum = pgEnum("content_mod_status", [
  "pending",
  "scanning",
  "clean",
  "flagged",
  "suspended",
  "deleted",
  "reviewed",
]);

export const flagSeverityEnum = pgEnum("flag_severity", [
  "low",
  "medium", 
  "high",
  "critical",
]);

export interface ModerationFlag {
  type: "csam" | "illegal" | "self_harm" | "violence" | "scam" | "harassment" | "other";
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  source: "heuristic" | "openai" | "gpt" | "manual";
  description?: string;
}

export interface ModerationScores {
  "sexual/minors"?: number;
  "self-harm"?: number;
  "self-harm/intent"?: number;
  "self-harm/instructions"?: number;
  "violence"?: number;
  "violence/graphic"?: number;
  [key: string]: number | undefined;
}

/**
 * Content moderation items - tracks all scanned content
 */
export const contentModerationItems = pgTable(
  "content_moderation_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Content identification
    contentType: contentTypeEnum("content_type").notNull(),
    sourceTable: text("source_table").notNull(), // e.g. "media_uploads", "generations"
    sourceId: uuid("source_id").notNull(),

    // Ownership
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    // Content reference
    contentUrl: text("content_url"),
    contentHash: text("content_hash"),
    contentSizeBytes: bigint("content_size_bytes", { mode: "bigint" }),
    isPublic: boolean("is_public").notNull().default(false),

    // Moderation state
    status: moderationStatusEnum("status").notNull().default("pending"),
    confidence: real("confidence").default(0),
    flags: jsonb("flags").$type<ModerationFlag[]>().notNull().default([]),

    // AI results
    aiModel: text("ai_model"),
    aiScores: jsonb("ai_scores").$type<ModerationScores>(),
    aiReasoning: text("ai_reasoning"),

    // Review
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    reviewDecision: text("review_decision").$type<"confirm" | "dismiss" | "escalate">(),
    reviewNotes: text("review_notes"),

    // Timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastScannedAt: timestamp("last_scanned_at"),

    // Backoff tracking for private content
    scanAttempts: integer("scan_attempts").notNull().default(0),
    nextScanAt: timestamp("next_scan_at"),
  },
  (table) => ({
    sourceIdx: index("content_mod_source_idx").on(table.sourceTable, table.sourceId),
    statusIdx: index("content_mod_status_idx").on(table.status),
    orgIdx: index("content_mod_org_idx").on(table.organizationId),
    userIdx: index("content_mod_user_idx").on(table.userId),
    typeStatusIdx: index("content_mod_type_status_idx").on(table.contentType, table.status),
    nextScanIdx: index("content_mod_next_scan_idx").on(table.nextScanAt),
    createdAtIdx: index("content_mod_created_at_idx").on(table.createdAt),
  })
);

/**
 * User moderation strikes - escalating punishment system
 */
export const userModerationStrikes = pgTable(
  "user_moderation_strikes",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Strike details
    contentItemId: uuid("content_item_id").references(() => contentModerationItems.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    severity: flagSeverityEnum("severity").notNull(),
    
    // What was flagged
    contentType: contentTypeEnum("content_type").notNull(),
    contentPreview: text("content_preview"), // First 200 chars or thumbnail URL
    flags: jsonb("flags").$type<ModerationFlag[]>().notNull().default([]),

    // Action taken
    actionTaken: text("action_taken").notNull(), // "warning", "content_deleted", "suspended", "banned"
    
    // Admin who reviewed (null = auto)
    reviewedBy: uuid("reviewed_by").references(() => users.id),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("user_mod_strikes_user_id_idx").on(table.userId),
    severityIdx: index("user_mod_strikes_severity_idx").on(table.severity),
    createdAtIdx: index("user_mod_strikes_created_at_idx").on(table.createdAt),
    contentTypeIdx: index("user_mod_strikes_content_type_idx").on(table.contentType),
  })
);

export type ContentModerationItem = InferSelectModel<typeof contentModerationItems>;
export type NewContentModerationItem = InferInsertModel<typeof contentModerationItems>;
export type UserModerationStrike = InferSelectModel<typeof userModerationStrikes>;
export type NewUserModerationStrike = InferInsertModel<typeof userModerationStrikes>;

