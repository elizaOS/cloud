/**
 * N8N Workflow App Schema
 *
 * Schema for managing n8n workflows with:
 * - Workflow CRUD operations
 * - Version control (save, revert, review versions)
 * - Global and per-workflow variables
 * - API key management (global and per-workflow)
 * - n8n instance integration
 * - Workflow testing and validation
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";

// =============================================================================
// N8N INSTANCE TABLE
// =============================================================================

/**
 * User's n8n instances for workflow deployment and execution.
 */
export const n8nInstances = pgTable(
  "n8n_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Organization this instance belongs to
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // User who owns this instance
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Instance name
    name: text("name").notNull(),

    // n8n API endpoint (e.g., https://n8n.example.com)
    endpoint: text("endpoint").notNull(),

    // API key or token for authentication
    api_key: text("api_key").notNull(), // Encrypted in production

    // Whether this is the default instance for the app
    is_default: boolean("is_default").default(false).notNull(),

    // Instance metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    org_id_idx: index("n8n_instances_org_id_idx").on(table.organization_id),
    user_id_idx: index("n8n_instances_user_id_idx").on(table.user_id),
    org_default_idx: index("n8n_instances_org_default_idx").on(
      table.organization_id,
      table.is_default,
    ),
  }),
);

// =============================================================================
// WORKFLOW TABLE
// =============================================================================

/**
 * N8N workflows managed by the cloud app.
 */
export const n8nWorkflows = pgTable(
  "n8n_workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Organization this workflow belongs to (direct integration, not via app)
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // User who created this workflow
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Workflow name
    name: text("name").notNull(),

    // Workflow description
    description: text("description"),

    // The actual n8n workflow JSON
    workflow_data: jsonb("workflow_data")
      .$type<Record<string, unknown>>()
      .notNull(),

    // Current version number
    version: integer("version").default(1).notNull(),

    // Status: draft, active, archived
    status: text("status")
      .$type<"draft" | "active" | "archived">()
      .default("draft")
      .notNull(),

    // n8n instance this workflow is deployed to (if any)
    n8n_instance_id: uuid("n8n_instance_id").references(() => n8nInstances.id, {
      onDelete: "set null",
    }),

    // n8n workflow ID (if deployed to n8n)
    n8n_workflow_id: text("n8n_workflow_id"),

    // Whether workflow is active in n8n
    is_active_in_n8n: boolean("is_active_in_n8n").default(false).notNull(),

    // Workflow tags
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),

    // Workflow metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    org_id_idx: index("n8n_workflows_org_id_idx").on(table.organization_id),
    user_id_idx: index("n8n_workflows_user_id_idx").on(table.user_id),
    status_idx: index("n8n_workflows_status_idx").on(
      table.organization_id,
      table.status,
    ),
    n8n_instance_idx: index("n8n_workflows_n8n_instance_idx").on(
      table.n8n_instance_id,
    ),
  }),
);

// =============================================================================
// WORKFLOW VERSIONS TABLE
// =============================================================================

/**
 * Version history for workflows (enables revert and review).
 */
export const n8nWorkflowVersions = pgTable(
  "n8n_workflow_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Workflow this version belongs to
    workflow_id: uuid("workflow_id")
      .notNull()
      .references(() => n8nWorkflows.id, { onDelete: "cascade" }),

    // Organization ID (denormalized for queries)
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Version number
    version: integer("version").notNull(),

    // The workflow JSON at this version
    workflow_data: jsonb("workflow_data")
      .$type<Record<string, unknown>>()
      .notNull(),

    // Change description
    change_description: text("change_description"),

    // Who created this version
    created_by: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Timestamp
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    workflow_version_idx: uniqueIndex(
      "n8n_workflow_versions_workflow_version_idx",
    ).on(table.workflow_id, table.version),
    workflow_id_idx: index("n8n_workflow_versions_workflow_id_idx").on(
      table.workflow_id,
    ),
    org_id_idx: index("n8n_workflow_versions_org_id_idx").on(
      table.organization_id,
    ),
  }),
);

// =============================================================================
// WORKFLOW VARIABLES TABLE
// =============================================================================

/**
 * Global and per-workflow variables for n8n workflows.
 */
export const n8nWorkflowVariables = pgTable(
  "n8n_workflow_variables",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Organization this variable belongs to
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Workflow ID (null for global variables)
    workflow_id: uuid("workflow_id").references(() => n8nWorkflows.id, {
      onDelete: "cascade",
    }),

    // Variable name
    name: text("name").notNull(),

    // Variable value (encrypted in production)
    value: text("value").notNull(),

    // Variable type: string, number, boolean, json
    type: text("type")
      .$type<"string" | "number" | "boolean" | "json">()
      .default("string")
      .notNull(),

    // Whether this is a secret (should be encrypted)
    is_secret: boolean("is_secret").default(false).notNull(),

    // Variable description
    description: text("description"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    org_workflow_name_idx: uniqueIndex(
      "n8n_workflow_variables_org_workflow_name_idx",
    ).on(table.organization_id, table.workflow_id, table.name),
    org_id_idx: index("n8n_workflow_variables_org_id_idx").on(
      table.organization_id,
    ),
    workflow_id_idx: index("n8n_workflow_variables_workflow_id_idx").on(
      table.workflow_id,
    ),
  }),
);

// =============================================================================
// WORKFLOW API KEYS TABLE
// =============================================================================

/**
 * API keys for workflows (global and per-workflow).
 * Used for authenticating workflow execution requests.
 */
export const n8nWorkflowApiKeys = pgTable(
  "n8n_workflow_api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Organization this API key belongs to
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Workflow ID (null for global API keys)
    workflow_id: uuid("workflow_id").references(() => n8nWorkflows.id, {
      onDelete: "cascade",
    }),

    // API key name/description
    name: text("name").notNull(),

    // The actual API key (hashed in production)
    key_hash: text("key_hash").notNull(),

    // Key prefix for display (e.g., "n8n_...")
    key_prefix: text("key_prefix").notNull(),

    // Permissions/scopes (JSON array)
    scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),

    // Whether key is active
    is_active: boolean("is_active").default(true).notNull(),

    // Expiration date (null = never expires)
    expires_at: timestamp("expires_at"),

    // Last used timestamp
    last_used_at: timestamp("last_used_at"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    org_id_idx: index("n8n_workflow_api_keys_org_id_idx").on(
      table.organization_id,
    ),
    workflow_id_idx: index("n8n_workflow_api_keys_workflow_id_idx").on(
      table.workflow_id,
    ),
    key_prefix_idx: index("n8n_workflow_api_keys_key_prefix_idx").on(
      table.key_prefix,
    ),
  }),
);

// =============================================================================
// WORKFLOW EXECUTIONS TABLE
// =============================================================================

/**
 * Execution history for workflow testing and validation.
 */
export const n8nWorkflowExecutions = pgTable(
  "n8n_workflow_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Workflow this execution belongs to
    workflow_id: uuid("workflow_id")
      .notNull()
      .references(() => n8nWorkflows.id, { onDelete: "cascade" }),

    // Organization ID (denormalized)
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Trigger that initiated this execution (null for manual/test executions)
    trigger_id: uuid("trigger_id"),
    // NOTE: No FK constraint here to avoid circular dependency issues
    // The trigger_id is validated at the application layer

    // Execution type: test, manual, scheduled, webhook, a2a, mcp
    execution_type: text("execution_type")
      .$type<"test" | "manual" | "scheduled" | "webhook" | "a2a" | "mcp">()
      .default("test")
      .notNull(),

    // Execution status: running, success, error, canceled
    status: text("status")
      .$type<"running" | "success" | "error" | "canceled">()
      .default("running")
      .notNull(),

    // Input data (for test executions)
    input_data: jsonb("input_data").$type<Record<string, unknown>>(),

    // Output data (result of execution)
    output_data: jsonb("output_data").$type<Record<string, unknown>>(),

    // Error message (if status is error)
    error_message: text("error_message"),

    // Execution duration in milliseconds
    duration_ms: integer("duration_ms"),

    // n8n execution ID (if executed in n8n)
    n8n_execution_id: text("n8n_execution_id"),

    // Who triggered this execution
    triggered_by: uuid("triggered_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Timestamps
    started_at: timestamp("started_at").notNull().defaultNow(),
    finished_at: timestamp("finished_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    workflow_id_idx: index("n8n_workflow_executions_workflow_id_idx").on(
      table.workflow_id,
    ),
    org_id_idx: index("n8n_workflow_executions_org_id_idx").on(
      table.organization_id,
    ),
    trigger_id_idx: index("n8n_workflow_executions_trigger_id_idx").on(
      table.trigger_id,
    ),
    status_idx: index("n8n_workflow_executions_status_idx").on(
      table.workflow_id,
      table.status,
    ),
    created_at_idx: index("n8n_workflow_executions_created_at_idx").on(
      table.created_at,
    ),
    // Composite index for counting executions by trigger per day
    trigger_date_idx: index("n8n_workflow_executions_trigger_date_idx").on(
      table.trigger_id,
      table.created_at,
    ),
  }),
);

// =============================================================================
// WORKFLOW TRIGGERS TABLE
// =============================================================================

/**
 * Configuration for workflow triggers.
 * Different trigger types use different fields.
 */
export interface WorkflowTriggerConfig {
  // === Cron trigger config ===
  cronExpression?: string;
  inputData?: Record<string, unknown>;

  // === Webhook trigger config ===
  /** Auto-generated HMAC secret for signature verification */
  webhookSecret?: string;
  /** Whether to require signature verification (default: true) */
  requireSignature?: boolean;
  /** Whether to include output data in webhook response (default: false) */
  includeOutputInResponse?: boolean;
  /** IP addresses allowed to call webhook (empty = all allowed) */
  allowedIps?: string[];
  /** Auto-generated webhook URL (for reference) */
  webhookUrl?: string;

  // === A2A/MCP trigger config ===
  skillId?: string;
  toolName?: string;

  // === Common config ===
  /** Maximum executions per day (default: 10000 for webhooks, 1440 for cron) */
  maxExecutionsPerDay?: number;
  /** Estimated cost per execution in credits (for budget control) */
  estimatedCostPerExecution?: number;

  // Allow additional custom properties
  [key: string]: unknown;
}

/**
 * Triggers for workflows (cron, webhook, A2A, MCP).
 */
export const n8nWorkflowTriggers = pgTable(
  "n8n_workflow_triggers",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Workflow this trigger belongs to
    workflow_id: uuid("workflow_id")
      .notNull()
      .references(() => n8nWorkflows.id, { onDelete: "cascade" }),

    // Organization ID (denormalized)
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Trigger type
    trigger_type: text("trigger_type")
      .$type<"cron" | "webhook" | "a2a" | "mcp">()
      .notNull(),

    // Trigger configuration (typed for IntelliSense)
    config: jsonb("config").$type<WorkflowTriggerConfig>().notNull(),

    // For cron: cron expression (e.g., "0 0 * * *")
    // For webhook: webhook path
    // For A2A/MCP: skill/tool name
    trigger_key: text("trigger_key").notNull(),

    // Whether trigger is active
    is_active: boolean("is_active").default(true).notNull(),

    // Last execution time
    last_executed_at: timestamp("last_executed_at"),

    // Execution count
    execution_count: integer("execution_count").default(0).notNull(),

    // Error count
    error_count: integer("error_count").default(0).notNull(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    workflow_id_idx: index("n8n_workflow_triggers_workflow_id_idx").on(
      table.workflow_id,
    ),
    org_id_idx: index("n8n_workflow_triggers_org_id_idx").on(
      table.organization_id,
    ),
    trigger_type_idx: index("n8n_workflow_triggers_trigger_type_idx").on(
      table.trigger_type,
      table.is_active,
    ),
    trigger_key_idx: index("n8n_workflow_triggers_trigger_key_idx").on(
      table.trigger_key,
    ),
  }),
);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type N8nInstance = InferSelectModel<typeof n8nInstances>;
export type NewN8nInstance = InferInsertModel<typeof n8nInstances>;
export type N8nWorkflow = InferSelectModel<typeof n8nWorkflows>;
export type NewN8nWorkflow = InferInsertModel<typeof n8nWorkflows>;
export type N8nWorkflowVersion = InferSelectModel<typeof n8nWorkflowVersions>;
export type NewN8nWorkflowVersion = InferInsertModel<
  typeof n8nWorkflowVersions
>;
export type N8nWorkflowVariable = InferSelectModel<typeof n8nWorkflowVariables>;
export type NewN8nWorkflowVariable = InferInsertModel<
  typeof n8nWorkflowVariables
>;
export type N8nWorkflowApiKey = InferSelectModel<typeof n8nWorkflowApiKeys>;
export type NewN8nWorkflowApiKey = InferInsertModel<typeof n8nWorkflowApiKeys>;
export type N8nWorkflowExecution = InferSelectModel<
  typeof n8nWorkflowExecutions
>;
export type NewN8nWorkflowExecution = InferInsertModel<
  typeof n8nWorkflowExecutions
>;
export type N8nWorkflowTrigger = InferSelectModel<typeof n8nWorkflowTriggers>;
export type NewN8nWorkflowTrigger = InferInsertModel<
  typeof n8nWorkflowTriggers
>;
