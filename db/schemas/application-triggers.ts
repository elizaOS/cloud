/**
 * Application Triggers Schema
 * 
 * Generalized trigger system for all deployable components:
 * - Fragment Projects (Apps)
 * - Containers (Agents)
 * - User MCPs
 * - N8N Workflows (via n8n_workflow_triggers)
 * 
 * Supports trigger types:
 * - cron: Scheduled execution
 * - webhook: HTTP callback
 * - event: Platform events (agent_deployed, app_started, etc.)
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
import { fragmentProjects } from "./fragment-projects";
import { containers } from "./containers";
import { userMcps } from "./user-mcps";

// =============================================================================
// ENUMS
// =============================================================================

export const applicationTriggerTypeEnum = pgEnum("application_trigger_type", [
  "cron",
  "webhook",
  "event",
]);

export const applicationTriggerTargetEnum = pgEnum("application_trigger_target", [
  "fragment_project",
  "container",
  "user_mcp",
]);

// =============================================================================
// TRIGGER CONFIGURATION TYPES
// =============================================================================

export interface ApplicationTriggerConfig {
  // === Cron config ===
  cronExpression?: string;
  timezone?: string;
  
  // === Webhook config ===
  webhookSecret?: string;
  requireSignature?: boolean;
  allowedIps?: string[];
  allowedMethods?: ("GET" | "POST" | "PUT" | "DELETE")[];
  
  // === Event config ===
  eventTypes?: string[]; // e.g., ["agent.started", "agent.stopped", "error"]
  
  // === Common ===
  maxExecutionsPerDay?: number;
  estimatedCostPerExecution?: number;
  inputData?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeout?: number; // in seconds
  retryCount?: number;
  retryDelayMs?: number;
  
  // Allow custom properties
  [key: string]: unknown;
}

// =============================================================================
// APPLICATION TRIGGERS TABLE
// =============================================================================

export const applicationTriggers = pgTable(
  "application_triggers",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    created_by: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Target entity (polymorphic)
    target_type: applicationTriggerTargetEnum("target_type").notNull(),
    target_id: uuid("target_id").notNull(),

    // Trigger type
    trigger_type: applicationTriggerTypeEnum("trigger_type").notNull(),

    // Unique key for webhook triggers
    trigger_key: text("trigger_key").notNull().unique(),

    // Human-readable name
    name: text("name").notNull(),
    description: text("description"),

    // Configuration
    config: jsonb("config").$type<ApplicationTriggerConfig>().notNull().default({}),

    // Action to perform
    action_type: text("action_type").notNull().default("call_endpoint"),
    // call_endpoint: Call the target's endpoint
    // restart: Restart the container/agent
    // scale: Scale up/down
    // notify: Send notification
    // execute_workflow: Execute an N8N workflow
    
    action_config: jsonb("action_config").$type<{
      endpoint?: string;
      method?: string;
      body?: Record<string, unknown>;
      workflowId?: string;
      notificationChannels?: string[];
      scaleTarget?: number;
    }>().default({}),

    // Status
    is_active: boolean("is_active").default(true).notNull(),
    
    // Execution stats
    execution_count: integer("execution_count").default(0).notNull(),
    error_count: integer("error_count").default(0).notNull(),
    last_executed_at: timestamp("last_executed_at"),
    last_error_at: timestamp("last_error_at"),
    last_error_message: text("last_error_message"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    organization_idx: index("app_triggers_organization_idx").on(table.organization_id),
    target_idx: index("app_triggers_target_idx").on(table.target_type, table.target_id),
    trigger_type_idx: index("app_triggers_trigger_type_idx").on(table.trigger_type, table.is_active),
    trigger_key_idx: index("app_triggers_trigger_key_idx").on(table.trigger_key),
    is_active_idx: index("app_triggers_is_active_idx").on(table.is_active),
  })
);

// =============================================================================
// TRIGGER EXECUTIONS TABLE
// =============================================================================

export const applicationTriggerExecutions = pgTable(
  "application_trigger_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // References
    trigger_id: uuid("trigger_id")
      .notNull()
      .references(() => applicationTriggers.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Execution type
    execution_type: text("execution_type")
      .$type<"scheduled" | "webhook" | "event" | "manual">()
      .notNull(),

    // Status
    status: text("status")
      .$type<"pending" | "running" | "success" | "error" | "timeout">()
      .default("pending")
      .notNull(),

    // Input/Output
    input_data: jsonb("input_data").$type<Record<string, unknown>>(),
    output_data: jsonb("output_data").$type<Record<string, unknown>>(),
    error_message: text("error_message"),

    // Timing
    started_at: timestamp("started_at"),
    finished_at: timestamp("finished_at"),
    duration_ms: integer("duration_ms"),

    // Request metadata (for webhooks)
    request_metadata: jsonb("request_metadata").$type<{
      ip?: string;
      userAgent?: string;
      headers?: Record<string, string>;
    }>(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    trigger_id_idx: index("app_trigger_executions_trigger_id_idx").on(table.trigger_id),
    organization_idx: index("app_trigger_executions_org_idx").on(table.organization_id),
    status_idx: index("app_trigger_executions_status_idx").on(table.status),
    created_at_idx: index("app_trigger_executions_created_at_idx").on(table.created_at),
    trigger_date_idx: index("app_trigger_executions_trigger_date_idx").on(
      table.trigger_id,
      table.created_at
    ),
  })
);

// =============================================================================
// TYPES
// =============================================================================

export type ApplicationTrigger = InferSelectModel<typeof applicationTriggers>;
export type NewApplicationTrigger = InferInsertModel<typeof applicationTriggers>;
export type ApplicationTriggerExecution = InferSelectModel<typeof applicationTriggerExecutions>;
export type NewApplicationTriggerExecution = InferInsertModel<typeof applicationTriggerExecutions>;

