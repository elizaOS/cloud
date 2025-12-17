/**
 * Webhooks Schema
 *
 * Unified webhook system for managing all webhooks across the platform.
 * Supports webhooks for external services, cron triggers, events, and more.
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
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

// =============================================================================
// ENUMS
// =============================================================================

export const webhookTargetTypeEnum = pgEnum("webhook_target_type", [
  "url",
  "agent",
  "application",
  "workflow",
  "a2a",
  "mcp",
]);

export const webhookExecutionStatusEnum = pgEnum("webhook_execution_status", [
  "pending",
  "success",
  "error",
  "timeout",
]);

// =============================================================================
// WEBHOOK CONFIGURATION TYPES
// =============================================================================

export interface WebhookConfig {
  // Security
  requireSignature?: boolean;
  allowedIps?: string[];
  allowedMethods?: ("GET" | "POST" | "PUT" | "DELETE" | "PATCH")[];

  // Event filtering
  eventTypes?: string[];
  eventFilters?: Record<string, unknown>;

  // Delivery
  timeoutSeconds?: number;
  retryCount?: number;
  retryDelayMs?: number;
  maxExecutionsPerDay?: number;

  // Cron (if scheduled)
  cronExpression?: string;
  cronTimezone?: string;

  // Custom headers to include in webhook requests
  headers?: Record<string, string>;

  // Allow custom properties
  [key: string]: unknown;
}

// =============================================================================
// WEBHOOKS TABLE
// =============================================================================

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    created_by: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Webhook identity
    name: text("name").notNull(),
    description: text("description"),

    // Unique key for webhook URL: /api/webhooks/{key}
    webhook_key: text("webhook_key").notNull().unique(),

    // Target configuration
    target_type: webhookTargetTypeEnum("target_type").notNull(),
    target_id: uuid("target_id"), // Reference to target entity (agent, app, etc.)
    target_url: text("target_url"), // For 'url' type

    // Security
    secret: text("secret").notNull(), // HMAC secret for signature verification

    // Configuration
    config: jsonb("config").$type<WebhookConfig>().notNull().default({}),

    // Status
    is_active: boolean("is_active").default(true).notNull(),

    // Statistics
    execution_count: integer("execution_count").default(0).notNull(),
    success_count: integer("success_count").default(0).notNull(),
    error_count: integer("error_count").default(0).notNull(),

    // Last execution tracking
    last_triggered_at: timestamp("last_triggered_at"),
    last_success_at: timestamp("last_success_at"),
    last_error_at: timestamp("last_error_at"),
    last_error_message: text("last_error_message"),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    webhook_key_idx: index("webhooks_webhook_key_idx").on(table.webhook_key),
    organization_idx: index("webhooks_organization_idx").on(
      table.organization_id,
    ),
    target_idx: index("webhooks_target_idx").on(
      table.target_type,
      table.target_id,
    ),
    is_active_idx: index("webhooks_is_active_idx").on(table.is_active),
    last_triggered_at_idx: index("webhooks_last_triggered_at_idx").on(
      table.last_triggered_at,
    ),
  }),
);

// =============================================================================
// WEBHOOK EXECUTIONS TABLE
// =============================================================================

export const webhookExecutions = pgTable(
  "webhook_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // References
    webhook_id: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Execution details
    status: webhookExecutionStatusEnum("status")
      .default("pending")
      .notNull(),
    event_type: text("event_type"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),

    // Response details
    response_status: integer("response_status"),
    response_body: text("response_body"),
    error_message: text("error_message"),

    // Timing
    started_at: timestamp("started_at"),
    finished_at: timestamp("finished_at"),
    duration_ms: integer("duration_ms"),

    // Request metadata
    request_ip: text("request_ip"),
    request_headers: jsonb("request_headers").$type<Record<string, string>>(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    webhook_id_idx: index("webhook_executions_webhook_id_idx").on(
      table.webhook_id,
    ),
    organization_idx: index("webhook_executions_organization_idx").on(
      table.organization_id,
    ),
    status_idx: index("webhook_executions_status_idx").on(table.status),
    created_at_idx: index("webhook_executions_created_at_idx").on(
      table.created_at,
    ),
    webhook_date_idx: index("webhook_executions_webhook_date_idx").on(
      table.webhook_id,
      table.created_at,
    ),
  }),
);

// =============================================================================
// TYPES
// =============================================================================

export type Webhook = InferSelectModel<typeof webhooks>;
export type NewWebhook = InferInsertModel<typeof webhooks>;
export type WebhookExecution = InferSelectModel<typeof webhookExecutions>;
export type NewWebhookExecution = InferInsertModel<typeof webhookExecutions>;

