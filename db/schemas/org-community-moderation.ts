/**
 * Organization Community Moderation Schema
 *
 * Comprehensive moderation system for the community manager agent.
 * Includes token gating, spam tracking, and moderation event logging.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { orgPlatformServers } from "./org-platforms";

// =============================================================================
// ENUMS
// =============================================================================

export const orgModerationActionEnum = pgEnum("org_moderation_action", [
  "warn",
  "delete",
  "timeout",
  "kick",
  "ban",
]);

export const moderationEventTypeEnum = pgEnum("moderation_event_type", [
  "spam",
  "scam",
  "banned_word",
  "malicious_link",
  "phishing",
  "raid",
  "harassment",
  "nsfw",
  "manual",
  "token_gate_fail",
]);

export const moderationSeverityEnum = pgEnum("moderation_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const tokenGateChainEnum = pgEnum("token_gate_chain", [
  "solana",
  "ethereum",
  "base",
  "polygon",
  "arbitrum",
  "optimism",
]);

export const tokenGateTypeEnum = pgEnum("token_gate_type", [
  "token",
  "nft",
  "nft_collection",
]);

export const verificationMethodEnum = pgEnum("verification_method", [
  "signature",
  "oauth",
  "privy",
]);

// =============================================================================
// TOKEN GATES TABLE
// =============================================================================

/**
 * Token-gated role requirements.
 * Defines rules for assigning roles based on token/NFT holdings.
 */
export const orgTokenGates = pgTable(
  "org_token_gates",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    server_id: uuid("server_id")
      .notNull()
      .references(() => orgPlatformServers.id, { onDelete: "cascade" }),

    // Rule definition
    name: text("name").notNull(),
    description: text("description"),

    // Token requirements
    chain: tokenGateChainEnum("chain").notNull(),
    token_type: tokenGateTypeEnum("token_type").notNull(),
    token_address: text("token_address").notNull(),
    min_balance: text("min_balance").notNull().default("1"), // String for BigInt support

    // Optional NFT-specific
    nft_collection_id: text("nft_collection_id"),
    required_traits: jsonb("required_traits").$type<Record<string, string[]>>(),

    // Role to assign
    discord_role_id: text("discord_role_id"),
    telegram_group_id: text("telegram_group_id"),

    // Behavior
    remove_on_fail: boolean("remove_on_fail").notNull().default(true),
    check_interval_hours: integer("check_interval_hours").notNull().default(24),

    // Status
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(0),

    // Audit
    created_by: uuid("created_by").references(() => users.id),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("org_token_gates_org_idx").on(table.organization_id),
    index("org_token_gates_server_idx").on(table.server_id),
    index("org_token_gates_enabled_idx").on(table.enabled),
  ],
);

// =============================================================================
// MEMBER WALLETS TABLE
// =============================================================================

/**
 * Verified wallets for community members.
 * Links platform users to their blockchain wallets.
 */
export const orgMemberWallets = pgTable(
  "org_member_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    server_id: uuid("server_id")
      .notNull()
      .references(() => orgPlatformServers.id, { onDelete: "cascade" }),

    // Platform user identity
    platform_user_id: text("platform_user_id").notNull(),
    platform: text("platform").notNull(), // discord, telegram, slack

    // Wallet info
    wallet_address: text("wallet_address").notNull(),
    chain: tokenGateChainEnum("chain").notNull(),

    // Verification
    verified_at: timestamp("verified_at"),
    verification_method: verificationMethodEnum("verification_method"),
    verification_signature: text("verification_signature"),

    // Cached balance info
    last_checked_at: timestamp("last_checked_at"),
    last_balance: jsonb("last_balance").$type<{
      tokens: Record<string, string>;
      nfts: Array<{ collection: string; tokenId: string }>;
    }>(),

    // Assigned roles based on this wallet
    assigned_roles: jsonb("assigned_roles").$type<string[]>().default([]),

    // Status
    is_primary: boolean("is_primary").notNull().default(false),

    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("org_member_wallets_org_idx").on(table.organization_id),
    index("org_member_wallets_server_idx").on(table.server_id),
    index("org_member_wallets_platform_user_idx").on(
      table.platform_user_id,
      table.platform,
    ),
    index("org_member_wallets_wallet_idx").on(
      table.wallet_address,
      table.chain,
    ),
    uniqueIndex("org_member_wallets_unique_wallet").on(
      table.server_id,
      table.wallet_address,
      table.chain,
    ),
  ],
);

// =============================================================================
// MODERATION EVENTS TABLE
// =============================================================================

/**
 * Moderation events log.
 * Tracks all moderation actions for audit and escalation.
 */
export const orgModerationEvents = pgTable(
  "org_moderation_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    server_id: uuid("server_id")
      .notNull()
      .references(() => orgPlatformServers.id, { onDelete: "cascade" }),

    // User info
    platform_user_id: text("platform_user_id").notNull(),
    platform: text("platform").notNull(),
    platform_username: text("platform_username"),

    // Event details
    event_type: moderationEventTypeEnum("event_type").notNull(),
    severity: moderationSeverityEnum("severity").notNull(),

    // Content info
    message_id: text("message_id"),
    channel_id: text("channel_id"),
    content_sample: text("content_sample"), // First 500 chars
    matched_pattern: text("matched_pattern"), // What triggered detection

    // Action taken
    action_taken: orgModerationActionEnum("action_taken"),
    action_duration_minutes: integer("action_duration_minutes"), // For timeouts
    action_expires_at: timestamp("action_expires_at"),

    // Detection info
    detected_by: text("detected_by").notNull(), // 'auto', 'manual', or user id
    confidence_score: integer("confidence_score"), // 0-100 for auto detection

    // Resolution
    resolved_at: timestamp("resolved_at"),
    resolved_by: uuid("resolved_by").references(() => users.id),
    resolution_notes: text("resolution_notes"),
    false_positive: boolean("false_positive").default(false),

    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("org_mod_events_org_idx").on(table.organization_id),
    index("org_mod_events_server_idx").on(table.server_id),
    index("org_mod_events_user_idx").on(table.platform_user_id, table.platform),
    index("org_mod_events_type_idx").on(table.event_type),
    index("org_mod_events_created_idx").on(table.created_at),
    index("org_mod_events_unresolved_idx").on(table.resolved_at),
  ],
);

// =============================================================================
// SPAM TRACKING TABLE
// =============================================================================

/**
 * Anti-spam tracking per user.
 * Tracks message rates and patterns for spam detection.
 */
export const orgSpamTracking = pgTable(
  "org_spam_tracking",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    server_id: uuid("server_id")
      .notNull()
      .references(() => orgPlatformServers.id, { onDelete: "cascade" }),

    // User identity
    platform_user_id: text("platform_user_id").notNull(),
    platform: text("platform").notNull(),

    // Message tracking (rolling window)
    recent_message_hashes: jsonb("recent_message_hashes")
      .$type<string[]>()
      .default([]),
    message_timestamps: jsonb("message_timestamps")
      .$type<string[]>()
      .default([]), // ISO timestamps of recent messages

    // Violation counts
    spam_violations_1h: integer("spam_violations_1h").notNull().default(0),
    spam_violations_24h: integer("spam_violations_24h").notNull().default(0),
    total_violations: integer("total_violations").notNull().default(0),

    // Rate limiting
    is_rate_limited: boolean("is_rate_limited").notNull().default(false),
    rate_limit_expires_at: timestamp("rate_limit_expires_at"),
    rate_limit_count: integer("rate_limit_count").notNull().default(0),

    // Escalation tracking
    warning_count: integer("warning_count").notNull().default(0),
    timeout_count: integer("timeout_count").notNull().default(0),
    last_warning_at: timestamp("last_warning_at"),
    last_timeout_at: timestamp("last_timeout_at"),

    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("org_spam_tracking_org_idx").on(table.organization_id),
    index("org_spam_tracking_server_idx").on(table.server_id),
    uniqueIndex("org_spam_tracking_unique_user").on(
      table.server_id,
      table.platform_user_id,
      table.platform,
    ),
    index("org_spam_tracking_rate_limited_idx").on(table.is_rate_limited),
  ],
);

// =============================================================================
// BLOCKED PATTERNS TABLE
// =============================================================================

/**
 * Configurable blocked patterns for scam/spam detection.
 * Allows orgs to add custom patterns beyond defaults.
 */
export const orgBlockedPatterns = pgTable(
  "org_blocked_patterns",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    server_id: uuid("server_id").references(() => orgPlatformServers.id, {
      onDelete: "cascade",
    }), // null = org-wide

    // Pattern definition
    pattern_type: text("pattern_type").notNull(), // 'regex', 'exact', 'contains', 'domain'
    pattern: text("pattern").notNull(),
    category: text("category").notNull(), // 'scam', 'spam', 'phishing', 'banned_word'

    // Action
    action: orgModerationActionEnum("action").notNull().default("delete"),
    severity: moderationSeverityEnum("severity").notNull().default("medium"),

    // Metadata
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    match_count: integer("match_count").notNull().default(0),

    created_by: uuid("created_by").references(() => users.id),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("org_blocked_patterns_org_idx").on(table.organization_id),
    index("org_blocked_patterns_server_idx").on(table.server_id),
    index("org_blocked_patterns_category_idx").on(table.category),
    index("org_blocked_patterns_enabled_idx").on(table.enabled),
  ],
);

// =============================================================================
// RELATIONS
// =============================================================================

export const orgTokenGatesRelations = relations(orgTokenGates, ({ one }) => ({
  organization: one(organizations, {
    fields: [orgTokenGates.organization_id],
    references: [organizations.id],
  }),
  server: one(orgPlatformServers, {
    fields: [orgTokenGates.server_id],
    references: [orgPlatformServers.id],
  }),
  createdBy: one(users, {
    fields: [orgTokenGates.created_by],
    references: [users.id],
  }),
}));

export const orgMemberWalletsRelations = relations(
  orgMemberWallets,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [orgMemberWallets.organization_id],
      references: [organizations.id],
    }),
    server: one(orgPlatformServers, {
      fields: [orgMemberWallets.server_id],
      references: [orgPlatformServers.id],
    }),
  }),
);

export const orgModerationEventsRelations = relations(
  orgModerationEvents,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [orgModerationEvents.organization_id],
      references: [organizations.id],
    }),
    server: one(orgPlatformServers, {
      fields: [orgModerationEvents.server_id],
      references: [orgPlatformServers.id],
    }),
    resolvedBy: one(users, {
      fields: [orgModerationEvents.resolved_by],
      references: [users.id],
    }),
  }),
);

export const orgSpamTrackingRelations = relations(
  orgSpamTracking,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [orgSpamTracking.organization_id],
      references: [organizations.id],
    }),
    server: one(orgPlatformServers, {
      fields: [orgSpamTracking.server_id],
      references: [orgPlatformServers.id],
    }),
  }),
);

export const orgBlockedPatternsRelations = relations(
  orgBlockedPatterns,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [orgBlockedPatterns.organization_id],
      references: [organizations.id],
    }),
    server: one(orgPlatformServers, {
      fields: [orgBlockedPatterns.server_id],
      references: [orgPlatformServers.id],
    }),
    createdBy: one(users, {
      fields: [orgBlockedPatterns.created_by],
      references: [users.id],
    }),
  }),
);

// =============================================================================
// TYPES
// =============================================================================

export type OrgTokenGate = InferSelectModel<typeof orgTokenGates>;
export type NewOrgTokenGate = InferInsertModel<typeof orgTokenGates>;

export type OrgMemberWallet = InferSelectModel<typeof orgMemberWallets>;
export type NewOrgMemberWallet = InferInsertModel<typeof orgMemberWallets>;

export type OrgModerationEvent = InferSelectModel<typeof orgModerationEvents>;
export type NewOrgModerationEvent = InferInsertModel<
  typeof orgModerationEvents
>;

export type OrgSpamTracking = InferSelectModel<typeof orgSpamTracking>;
export type NewOrgSpamTracking = InferInsertModel<typeof orgSpamTracking>;

export type OrgBlockedPattern = InferSelectModel<typeof orgBlockedPatterns>;
export type NewOrgBlockedPattern = InferInsertModel<typeof orgBlockedPatterns>;

// Enum value types
export type OrgModerationAction =
  (typeof orgModerationActionEnum.enumValues)[number];
export type ModerationEventType =
  (typeof moderationEventTypeEnum.enumValues)[number];
export type ModerationSeverity =
  (typeof moderationSeverityEnum.enumValues)[number];
export type TokenGateChain = (typeof tokenGateChainEnum.enumValues)[number];
export type TokenGateType = (typeof tokenGateTypeEnum.enumValues)[number];
export type VerificationMethod =
  (typeof verificationMethodEnum.enumValues)[number];
