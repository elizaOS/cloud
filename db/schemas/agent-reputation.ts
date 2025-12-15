import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

/**
 * Agent Reputation System for ERC-8004/A2A
 *
 * Tracks reputation for external agents connecting to Eliza Cloud.
 * Reputation is built through:
 * - Payment deposits (x402, credit purchases)
 * - Service usage (API calls, successful generations)
 * - Positive moderation history
 *
 * Reputation is damaged by:
 * - Moderation violations (CSAM, self-harm, etc.)
 * - Admin flags (spam, scam, abuse)
 * - Failed payments / chargebacks
 */

// Agent reputation status enum
export const agentReputationStatusEnum = pgEnum("agent_reputation_status", [
  "new", // Just registered, no activity
  "trusted", // Good standing
  "warned", // Has violations but not banned
  "restricted", // Limited access due to violations
  "banned", // Permanently banned
]);

// Agent flag type enum
export const agentFlagTypeEnum = pgEnum("agent_flag_type", [
  "csam", // Child sexual abuse material
  "self_harm", // Self-harm content
  "spam", // Spam/abuse
  "scam", // Scam/fraud
  "harassment", // Harassment/threats
  "copyright", // Copyright infringement
  "malware", // Malware/security threat
  "other", // Other violation
]);

/**
 * External agent reputation tracking
 *
 * Tracks reputation for agents connecting via ERC-8004/A2A protocol
 */
export const agentReputation = pgTable(
  "agent_reputation",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Agent identity - can be ERC-8004 on-chain or off-chain API key holder
    // For on-chain: chainId:tokenId (e.g., "84532:1583")
    // For API key: organization_id or user_id
    agentIdentifier: text("agent_identifier").notNull().unique(),

    // ERC-8004 specific fields (null for API key users)
    chainId: integer("chain_id"),
    tokenId: integer("token_id"),
    walletAddress: text("wallet_address"),

    // Link to organization if they have an account
    organizationId: uuid("organization_id"),

    // Status
    status: agentReputationStatusEnum("status").notNull().default("new"),

    // ===== POSITIVE REPUTATION FACTORS =====

    // Financial reputation (money deposited = trust)
    totalDeposited: real("total_deposited").notNull().default(0), // USD value
    totalSpent: real("total_spent").notNull().default(0), // USD value
    paymentCount: integer("payment_count").notNull().default(0),
    lastPaymentAt: timestamp("last_payment_at"),

    // Usage reputation (active use = trust)
    totalRequests: integer("total_requests").notNull().default(0),
    successfulRequests: integer("successful_requests").notNull().default(0),
    failedRequests: integer("failed_requests").notNull().default(0),
    lastRequestAt: timestamp("last_request_at"),

    // ===== NEGATIVE REPUTATION FACTORS =====

    // Moderation violations
    totalViolations: integer("total_violations").notNull().default(0),
    csamViolations: integer("csam_violations").notNull().default(0), // Most severe
    selfHarmViolations: integer("self_harm_violations").notNull().default(0),
    otherViolations: integer("other_violations").notNull().default(0),
    lastViolationAt: timestamp("last_violation_at"),

    // Admin flags
    flagCount: integer("flag_count").notNull().default(0),
    isFlaggedByAdmin: boolean("is_flagged_by_admin").notNull().default(false),
    flagReason: text("flag_reason"),
    flaggedAt: timestamp("flagged_at"),
    flaggedBy: uuid("flagged_by"),

    // ===== COMPUTED SCORES =====

    // Reputation score: 0-100 (computed from above factors)
    reputationScore: real("reputation_score").notNull().default(50),

    // Trust level based on score
    trustLevel: text("trust_level").notNull().default("neutral"), // untrusted, low, neutral, trusted, verified

    // Confidence in the score (more data = higher confidence)
    confidenceScore: real("confidence_score").notNull().default(0),

    // ===== BAN MANAGEMENT =====

    bannedAt: timestamp("banned_at"),
    bannedBy: uuid("banned_by"),
    banReason: text("ban_reason"),
    banExpiresAt: timestamp("ban_expires_at"), // null = permanent

    // ===== LIFECYCLE =====

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  },
  (table) => ({
    agentIdentifierIdx: uniqueIndex("agent_reputation_identifier_idx").on(
      table.agentIdentifier,
    ),
    chainTokenIdx: index("agent_reputation_chain_token_idx").on(
      table.chainId,
      table.tokenId,
    ),
    walletAddressIdx: index("agent_reputation_wallet_address_idx").on(
      table.walletAddress,
    ),
    organizationIdIdx: index("agent_reputation_organization_id_idx").on(
      table.organizationId,
    ),
    statusIdx: index("agent_reputation_status_idx").on(table.status),
    reputationScoreIdx: index("agent_reputation_score_idx").on(
      table.reputationScore,
    ),
    bannedAtIdx: index("agent_reputation_banned_at_idx").on(table.bannedAt),
  }),
);

/**
 * Agent moderation events
 *
 * Tracks all moderation-related events for agents
 */
export const agentModerationEvents = pgTable(
  "agent_moderation_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Link to agent reputation
    agentReputationId: uuid("agent_reputation_id")
      .notNull()
      .references(() => agentReputation.id, { onDelete: "cascade" }),

    // Event type
    eventType: text("event_type").notNull(), // violation, flag, unban, warning, etc.

    // Flag type (for violations/flags)
    flagType: agentFlagTypeEnum("flag_type"),

    // Details
    severity: text("severity").notNull().default("medium"), // low, medium, high, critical
    description: text("description"),
    evidence: text("evidence"), // Message text or content reference

    // Detection method
    detectedBy: text("detected_by").notNull().default("auto"), // auto, admin, report

    // Scores at time of event
    moderationScores:
      jsonb("moderation_scores").$type<Record<string, number>>(),

    // Admin action
    adminUserId: uuid("admin_user_id"),
    adminNotes: text("admin_notes"),
    actionTaken: text("action_taken"),

    // Impact on reputation
    reputationChange: real("reputation_change").notNull().default(0),
    previousScore: real("previous_score"),
    newScore: real("new_score"),

    // Lifecycle
    createdAt: timestamp("created_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: uuid("resolved_by"),
    resolutionNotes: text("resolution_notes"),
  },
  (table) => ({
    agentReputationIdIdx: index("agent_mod_events_reputation_id_idx").on(
      table.agentReputationId,
    ),
    eventTypeIdx: index("agent_mod_events_event_type_idx").on(table.eventType),
    flagTypeIdx: index("agent_mod_events_flag_type_idx").on(table.flagType),
    severityIdx: index("agent_mod_events_severity_idx").on(table.severity),
    createdAtIdx: index("agent_mod_events_created_at_idx").on(table.createdAt),
  }),
);

/**
 * Agent activity log
 *
 * High-level activity tracking for reputation calculation
 */
export const agentActivityLog = pgTable(
  "agent_activity_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    agentReputationId: uuid("agent_reputation_id")
      .notNull()
      .references(() => agentReputation.id, { onDelete: "cascade" }),

    // Activity type
    activityType: text("activity_type").notNull(), // payment, request, violation, etc.

    // Value for payments
    amountUsd: real("amount_usd"),

    // Details
    details: jsonb("details").$type<Record<string, unknown>>(),

    // Success/failure
    isSuccessful: boolean("is_successful").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    agentReputationIdIdx: index("agent_activity_reputation_id_idx").on(
      table.agentReputationId,
    ),
    activityTypeIdx: index("agent_activity_type_idx").on(table.activityType),
    createdAtIdx: index("agent_activity_created_at_idx").on(table.createdAt),
  }),
);

// Type exports
export type AgentReputation = InferSelectModel<typeof agentReputation>;
export type NewAgentReputation = InferInsertModel<typeof agentReputation>;

export type AgentModerationEvent = InferSelectModel<
  typeof agentModerationEvents
>;
export type NewAgentModerationEvent = InferInsertModel<
  typeof agentModerationEvents
>;

export type AgentActivityLog = InferSelectModel<typeof agentActivityLog>;
export type NewAgentActivityLog = InferInsertModel<typeof agentActivityLog>;
