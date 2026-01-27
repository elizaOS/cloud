import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { userMcps } from "./user-mcps";

/**
 * Workflow status enum
 */
export const workflowStatusEnum = pgEnum("workflow_status", [
  "draft",
  "testing",
  "live",
  "shared",
  "deprecated",
]);

/**
 * Generated Workflows table schema.
 *
 * Stores AI-generated workflows created by the Workflow Factory.
 * These workflows can be tested, executed, and optionally shared
 * as MCPs for other users to use.
 */
export const generatedWorkflows = pgTable(
  "generated_workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Owner
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    created_by_user_id: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Workflow identification
    name: text("name").notNull(),
    description: text("description"),

    // Original intent that generated this workflow
    user_intent: text("user_intent").notNull(),

    // Generated code
    generated_code: text("generated_code").notNull(),

    // Service dependencies (e.g., ['google', 'notion', 'blooio'])
    service_dependencies: jsonb("service_dependencies")
      .$type<string[]>()
      .notNull()
      .default([]),

    // Execution plan
    execution_plan: jsonb("execution_plan")
      .$type<
        Array<{
          step: number;
          serviceId: string;
          operation: string;
        }>
      >()
      .notNull()
      .default([]),

    // Test results from validation
    test_results: jsonb("test_results")
      .$type<{
        syntaxValid?: boolean;
        hasErrorHandling?: boolean;
        hasTypedReturn?: boolean;
        warnings?: string[];
        lastTestedAt?: string;
        testsPassed?: number;
        testsFailed?: number;
      }>()
      .default({}),

    // Generation metadata
    generation_metadata: jsonb("generation_metadata")
      .$type<{
        model?: string;
        iterations?: number;
        tokensUsed?: number;
        promptTokens?: number;
        completionTokens?: number;
        generatedAt?: string;
      }>()
      .default({}),

    // Status
    status: workflowStatusEnum("status").notNull().default("draft"),

    // Usage statistics
    usage_count: integer("usage_count").default(0).notNull(),
    success_count: integer("success_count").default(0).notNull(),
    failure_count: integer("failure_count").default(0).notNull(),
    success_rate: numeric("success_rate", { precision: 5, scale: 2 }).default(
      "0.00",
    ),

    // Average execution time in milliseconds
    avg_execution_time_ms: integer("avg_execution_time_ms"),

    // Sharing
    is_public: boolean("is_public").default(false).notNull(),
    mcp_id: uuid("mcp_id").references(() => userMcps.id, {
      onDelete: "set null",
    }),
    shared_at: timestamp("shared_at"),

    // Versioning
    version: text("version").notNull().default("1.0.0"),
    parent_workflow_id: uuid("parent_workflow_id"),

    // Tags for discovery
    tags: jsonb("tags").$type<string[]>().notNull().default([]),

    // Category
    category: text("category").default("custom"),

    // Additional metadata
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
    last_used_at: timestamp("last_used_at"),
  },
  (table) => ({
    organization_idx: index("generated_workflows_organization_idx").on(
      table.organization_id,
    ),
    created_by_idx: index("generated_workflows_created_by_idx").on(
      table.created_by_user_id,
    ),
    status_idx: index("generated_workflows_status_idx").on(table.status),
    is_public_idx: index("generated_workflows_is_public_idx").on(
      table.is_public,
    ),
    mcp_id_idx: index("generated_workflows_mcp_id_idx").on(table.mcp_id),
    created_at_idx: index("generated_workflows_created_at_idx").on(
      table.created_at,
    ),
    category_idx: index("generated_workflows_category_idx").on(table.category),
    parent_workflow_idx: index("generated_workflows_parent_idx").on(
      table.parent_workflow_id,
    ),
  }),
);

/**
 * Workflow executions table schema.
 *
 * Tracks individual executions of generated workflows.
 */
export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    workflow_id: uuid("workflow_id")
      .notNull()
      .references(() => generatedWorkflows.id, { onDelete: "cascade" }),

    // Who executed it
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Execution details
    status: text("status").notNull().default("pending"), // pending, running, completed, failed
    started_at: timestamp("started_at").notNull().defaultNow(),
    completed_at: timestamp("completed_at"),
    execution_time_ms: integer("execution_time_ms"),

    // Input/Output
    input_params: jsonb("input_params")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    output_result: jsonb("output_result").$type<{
      success: boolean;
      data?: unknown;
      error?: string;
      message?: string;
    }>(),

    // Error details if failed
    error_message: text("error_message"),
    error_stack: text("error_stack"),

    // Metadata
    metadata: jsonb("metadata")
      .$type<{
        triggeredBy?: "user" | "agent" | "schedule";
        agentId?: string;
        roomId?: string;
      }>()
      .default({})
      .notNull(),

    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    workflow_idx: index("workflow_executions_workflow_idx").on(
      table.workflow_id,
    ),
    organization_idx: index("workflow_executions_organization_idx").on(
      table.organization_id,
    ),
    user_idx: index("workflow_executions_user_idx").on(table.user_id),
    status_idx: index("workflow_executions_status_idx").on(table.status),
    started_at_idx: index("workflow_executions_started_at_idx").on(
      table.started_at,
    ),
  }),
);

// Type inference
export type GeneratedWorkflow = InferSelectModel<typeof generatedWorkflows>;
export type NewGeneratedWorkflow = InferInsertModel<typeof generatedWorkflows>;
export type WorkflowExecution = InferSelectModel<typeof workflowExecutions>;
export type NewWorkflowExecution = InferInsertModel<typeof workflowExecutions>;
