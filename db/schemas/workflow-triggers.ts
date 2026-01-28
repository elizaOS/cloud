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
import { generatedWorkflows } from "./generated-workflows";
import { users } from "./users";

/**
 * Trigger type enum
 */
export const triggerTypeEnum = pgEnum("trigger_type", [
  "message_keyword",   // Exact keyword match (word boundary)
  "message_contains",  // Substring match anywhere in message
  "message_from",      // Match specific sender phone numbers
  "message_regex",     // Regular expression pattern match
  "schedule",          // Cron-based scheduled trigger
  "webhook",           // External webhook trigger
]);

/**
 * Provider filter enum
 */
export const providerFilterEnum = pgEnum("provider_filter", [
  "all",      // Trigger on any provider
  "twilio",   // Only Twilio (SMS)
  "blooio",   // Only Blooio (iMessage)
  "telegram", // Only Telegram
]);

/**
 * Trigger configuration type
 */
export interface TriggerConfig {
  // For keyword triggers - list of keywords that trigger the workflow
  keywords?: string[];
  // For contains triggers - substring to match
  contains?: string;
  // For regex triggers - regex pattern
  pattern?: string;
  // For sender-based triggers - list of phone numbers
  phoneNumbers?: string[];
  // For scheduled triggers - cron expression
  schedule?: string;
  // Case sensitivity for text matching
  caseSensitive?: boolean;
  // Webhook secret for external triggers
  webhookSecret?: string;
}

/**
 * Response configuration type
 */
export interface ResponseConfig {
  // Whether to send workflow output as response
  sendResponse?: boolean;
  // Template for response message (supports placeholders)
  responseTemplate?: string;
  // Field from workflow output to use as response
  responseField?: string;
}

/**
 * Workflow Triggers table schema.
 *
 * Stores trigger configurations that automatically execute workflows
 * based on incoming messages, schedules, or external webhooks.
 */
export const workflowTriggers = pgTable(
  "workflow_triggers",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Organization owner
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Workflow to execute when triggered
    workflow_id: uuid("workflow_id")
      .notNull()
      .references(() => generatedWorkflows.id, { onDelete: "cascade" }),

    // Created by user
    created_by_user_id: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Trigger identification
    name: text("name").notNull(),
    description: text("description"),

    // Trigger type
    trigger_type: triggerTypeEnum("trigger_type").notNull(),

    // Trigger configuration (conditions)
    trigger_config: jsonb("trigger_config")
      .$type<TriggerConfig>()
      .notNull()
      .default({}),

    // Response configuration
    response_config: jsonb("response_config")
      .$type<ResponseConfig>()
      .notNull()
      .default({ sendResponse: true }),

    // Provider filter - which messaging providers this trigger applies to
    provider_filter: providerFilterEnum("provider_filter")
      .notNull()
      .default("all"),

    // Priority - higher numbers are checked first (for conflict resolution)
    priority: integer("priority").notNull().default(0),

    // Active status
    is_active: boolean("is_active").notNull().default(true),

    // Statistics
    trigger_count: integer("trigger_count").notNull().default(0),
    last_triggered_at: timestamp("last_triggered_at"),
    last_error: text("last_error"),
    last_error_at: timestamp("last_error_at"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    organization_idx: index("workflow_triggers_organization_idx").on(
      table.organization_id,
    ),
    workflow_idx: index("workflow_triggers_workflow_idx").on(
      table.workflow_id,
    ),
    created_by_idx: index("workflow_triggers_created_by_idx").on(
      table.created_by_user_id,
    ),
    trigger_type_idx: index("workflow_triggers_type_idx").on(
      table.trigger_type,
    ),
    is_active_idx: index("workflow_triggers_is_active_idx").on(
      table.is_active,
    ),
    // Composite index for efficient trigger lookup
    org_active_priority_idx: index("workflow_triggers_org_active_priority_idx").on(
      table.organization_id,
      table.is_active,
      table.priority,
    ),
  }),
);

// Type inference
export type WorkflowTrigger = InferSelectModel<typeof workflowTriggers>;
export type NewWorkflowTrigger = InferInsertModel<typeof workflowTriggers>;
