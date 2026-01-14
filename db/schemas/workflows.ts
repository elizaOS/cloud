import {
  boolean,
  index,
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

/**
 * Workflow status enum.
 * Tracks the lifecycle state of a workflow definition.
 */
export const workflowStatusEnum = pgEnum("workflow_status", [
  "draft", // Workflow created but not active
  "active", // Workflow is active and can be triggered
  "paused", // Workflow is temporarily disabled
  "archived", // Workflow is archived
]);

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";

/**
 * Workflow trigger type enum.
 * Defines how a workflow can be started.
 */
export const workflowTriggerTypeEnum = pgEnum("workflow_trigger_type", [
  "manual", // Triggered by user action
  "webhook", // Triggered by external HTTP request
  "schedule", // Triggered on a schedule (cron)
]);

export type WorkflowTriggerType = "manual" | "webhook" | "schedule";

/**
 * Workflow node type enum.
 * The types of nodes available in a workflow.
 */
export const workflowNodeTypeEnum = pgEnum("workflow_node_type", [
  "trigger", // Entry point node
  "agent", // Call an AI agent
  "image", // Generate an image
  "output", // Output/save result
  "delay", // Wait/pause execution
  "http", // HTTP request to external API
  "condition", // Conditional branching
  "tts", // Text-to-speech
  "discord", // Send to Discord
  "mcp", // Call MCP tool
]);

export type WorkflowNodeType =
  | "trigger"
  | "agent"
  | "image"
  | "output"
  | "delay"
  | "http"
  | "condition"
  | "tts"
  | "discord"
  | "mcp";

/**
 * Workflow node definition.
 * Represents a single node in the workflow graph.
 */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

/**
 * Workflow edge definition.
 * Represents a connection between two nodes.
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * Workflow trigger configuration.
 */
export interface WorkflowTriggerConfig {
  type: WorkflowTriggerType;
  webhookPath?: string; // For webhook triggers
  webhookSecret?: string; // Optional secret for webhook authentication
  schedule?: string; // Cron expression for schedule triggers
  timezone?: string; // Timezone for schedule triggers (default: UTC)
  retryOnFailure?: boolean; // Whether to retry on failure
  maxRetries?: number; // Maximum retry attempts (default: 3)
}

/**
 * Workflows table schema.
 *
 * Stores workflow definitions with their node/edge graph structure.
 */
export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Workflow identification
    name: text("name").notNull(),
    description: text("description"),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    created_by_user_id: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Workflow status
    status: workflowStatusEnum("status").notNull().default("draft"),

    // Trigger configuration
    trigger_config: jsonb("trigger_config")
      .$type<WorkflowTriggerConfig>()
      .notNull()
      .default({ type: "manual" }),

    // Workflow graph structure
    nodes: jsonb("nodes").$type<WorkflowNode[]>().notNull().default([]),
    edges: jsonb("edges").$type<WorkflowEdge[]>().notNull().default([]),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    organization_idx: index("workflows_organization_idx").on(
      table.organization_id,
    ),
    created_by_idx: index("workflows_created_by_idx").on(
      table.created_by_user_id,
    ),
    status_idx: index("workflows_status_idx").on(table.status),
    created_at_idx: index("workflows_created_at_idx").on(table.created_at),
  }),
);

// Type inference
export type Workflow = InferSelectModel<typeof workflows>;
export type NewWorkflow = InferInsertModel<typeof workflows>;
