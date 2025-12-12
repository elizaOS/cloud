/**
 * Organization Agent Instances Schema
 *
 * Manages the lifecycle of org agents per organization.
 * Each organization can have configured instances of:
 * - Jimmy (Project Manager)
 * - Eli5 (Community Manager)
 * - Eddy (DevRel)
 * - Ruby (Liaison)
 * - Laura (Social Media Manager)
 */

import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

// =============================================================================
// ENUMS
// =============================================================================

export const orgAgentInstanceStatusEnum = pgEnum("org_agent_instance_status", [
  "active",
  "inactive",
  "configuring",
  "error",
]);

// =============================================================================
// COMMUNITY MODERATION SETTINGS TYPE
// =============================================================================

/**
 * Comprehensive moderation settings for the community manager agent.
 * Stored in org_agent_configs.community_settings JSONB column.
 */
export interface CommunityModerationSettings {
  // Welcome & Greeting
  greetNewMembers?: boolean;
  greetingMessage?: string;
  greetingChannelId?: string;
  welcomeRoleId?: string;

  // Anti-spam
  antiSpamEnabled?: boolean;
  maxMessagesPerMinute?: number;
  duplicateMessageThreshold?: number;
  spamAction?: "warn" | "delete" | "timeout";
  spamTimeoutMinutes?: number;

  // Anti-scam
  antiScamEnabled?: boolean;
  blockKnownScamLinks?: boolean;
  blockSuspiciousDomains?: boolean;
  scamAction?: "warn" | "delete" | "timeout" | "ban";

  // Link checking
  linkCheckingEnabled?: boolean;
  allowedDomains?: string[];
  blockedDomains?: string[];
  checkLinksWithSafeBrowsing?: boolean;
  linkAction?: "warn" | "delete";

  // Word filtering
  badWordFilterEnabled?: boolean;
  banWords?: string[];
  filterAction?: "delete" | "warn" | "timeout";

  // Raid protection
  raidProtectionEnabled?: boolean;
  joinRateLimitPerMinute?: number;
  autoLockdownThreshold?: number;
  lockdownDurationMinutes?: number;

  // Content moderation
  contentModerationEnabled?: boolean;
  moderateNsfw?: boolean;
  moderateHarassment?: boolean;

  // Moderation escalation
  escalationEnabled?: boolean;
  warnAfterViolations?: number;
  timeoutAfterViolations?: number;
  banAfterViolations?: number;
  defaultTimeoutMinutes?: number;

  // Token gating
  tokenGatingEnabled?: boolean;
  verificationChannelId?: string;
  verifiedRoleId?: string;
  unverifiedRoleId?: string;
  verificationMessage?: string;

  // Logging
  logChannelId?: string;
  logModerationActions?: boolean;
  logMemberJoins?: boolean;
  logMemberLeaves?: boolean;
}

// =============================================================================
// ORG AGENT INSTANCES TABLE
// =============================================================================

/**
 * Org agent instances - one per agent type per organization.
 * Tracks which org agents are enabled and their status.
 */
export const orgAgentInstances = pgTable(
  "org_agent_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Agent type (org-project-manager, org-community-manager, etc.)
    agent_type: text("agent_type").notNull(),

    // Display name (can be customized per org)
    display_name: text("display_name").notNull(),

    // Enable/disable without deleting
    enabled: boolean("enabled").notNull().default(false),

    // Status tracking
    status: orgAgentInstanceStatusEnum("status").notNull().default("configuring"),
    error_message: text("error_message"),
    last_active_at: timestamp("last_active_at"),

    // Audit
    created_by: uuid("created_by").references(() => users.id),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Each org can only have one instance of each agent type
    uniqueIndex("org_agent_instances_org_type_idx").on(
      table.organization_id,
      table.agent_type
    ),
    index("org_agent_instances_org_idx").on(table.organization_id),
    index("org_agent_instances_status_idx").on(table.status),
    index("org_agent_instances_enabled_idx").on(table.enabled),
  ]
);

// =============================================================================
// ORG AGENT CONFIGS TABLE
// =============================================================================

/**
 * Configuration for org agent instances.
 * Stores platform-specific configs and custom settings.
 * Secrets are stored separately in the secrets service.
 */
export const orgAgentConfigs = pgTable(
  "org_agent_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Reference to instance
    instance_id: uuid("instance_id")
      .notNull()
      .unique()
      .references(() => orgAgentInstances.id, { onDelete: "cascade" }),

    // Discord configuration (non-secret parts)
    discord_config: jsonb("discord_config").$type<{
      applicationId?: string;
      enabledGuilds?: string[];
      commandPrefix?: string;
      autoJoin?: boolean;
      respondToMentionsOnly?: boolean;
    }>(),

    // Telegram configuration (non-secret parts)
    telegram_config: jsonb("telegram_config").$type<{
      enabledChats?: string[];
      commandPrefix?: string;
      parseMode?: "HTML" | "Markdown" | "MarkdownV2";
    }>(),

    // Twitter configuration (non-secret parts)
    twitter_config: jsonb("twitter_config").$type<{
      username?: string;
      enableAutoPost?: boolean;
      postFrequencyMinutes?: number;
      enableReplies?: boolean;
      enableQuotes?: boolean;
    }>(),

    // Custom agent settings
    custom_settings: jsonb("custom_settings").$type<Record<string, unknown>>(),

    // Check-in specific settings (for project manager)
    checkin_settings: jsonb("checkin_settings").$type<{
      defaultFrequency?: "daily" | "weekdays" | "weekly";
      defaultTimeUtc?: string;
      defaultQuestions?: string[];
      reminderOffsetMinutes?: number;
    }>(),

    // Community settings (for community manager)
    community_settings: jsonb("community_settings").$type<CommunityModerationSettings>(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("org_agent_configs_instance_idx").on(table.instance_id)]
);

// =============================================================================
// ORG AGENT ACTIVITY LOG
// =============================================================================

/**
 * Activity log for org agents - tracks actions taken by agents.
 */
export const orgAgentActivityLog = pgTable(
  "org_agent_activity_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // References
    instance_id: uuid("instance_id")
      .notNull()
      .references(() => orgAgentInstances.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Activity details
    action_type: text("action_type").notNull(), // e.g., "message_sent", "checkin_created", "todo_completed"
    action_description: text("action_description"),

    // Platform where action occurred
    platform: text("platform"), // "discord", "telegram", "web"
    platform_channel_id: text("platform_channel_id"),
    platform_user_id: text("platform_user_id"),

    // Related entities
    related_todo_id: uuid("related_todo_id"),
    related_checkin_id: uuid("related_checkin_id"),
    related_message_id: text("related_message_id"),

    // Result
    success: boolean("success").notNull().default(true),
    error_message: text("error_message"),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    // Timestamp
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("org_agent_activity_instance_idx").on(table.instance_id),
    index("org_agent_activity_org_idx").on(table.organization_id),
    index("org_agent_activity_type_idx").on(table.action_type),
    index("org_agent_activity_created_idx").on(table.created_at),
  ]
);

// =============================================================================
// RELATIONS
// =============================================================================

export const orgAgentInstancesRelations = relations(
  orgAgentInstances,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [orgAgentInstances.organization_id],
      references: [organizations.id],
    }),
    createdBy: one(users, {
      fields: [orgAgentInstances.created_by],
      references: [users.id],
    }),
    config: one(orgAgentConfigs, {
      fields: [orgAgentInstances.id],
      references: [orgAgentConfigs.instance_id],
    }),
    activityLog: many(orgAgentActivityLog),
  })
);

export const orgAgentConfigsRelations = relations(orgAgentConfigs, ({ one }) => ({
  instance: one(orgAgentInstances, {
    fields: [orgAgentConfigs.instance_id],
    references: [orgAgentInstances.id],
  }),
}));

export const orgAgentActivityLogRelations = relations(
  orgAgentActivityLog,
  ({ one }) => ({
    instance: one(orgAgentInstances, {
      fields: [orgAgentActivityLog.instance_id],
      references: [orgAgentInstances.id],
    }),
    organization: one(organizations, {
      fields: [orgAgentActivityLog.organization_id],
      references: [organizations.id],
    }),
  })
);

// =============================================================================
// TYPES
// =============================================================================

export type OrgAgentInstance = typeof orgAgentInstances.$inferSelect;
export type NewOrgAgentInstance = typeof orgAgentInstances.$inferInsert;

export type OrgAgentConfig = typeof orgAgentConfigs.$inferSelect;
export type NewOrgAgentConfig = typeof orgAgentConfigs.$inferInsert;

export type OrgAgentActivityLogEntry = typeof orgAgentActivityLog.$inferSelect;
export type NewOrgAgentActivityLogEntry = typeof orgAgentActivityLog.$inferInsert;

