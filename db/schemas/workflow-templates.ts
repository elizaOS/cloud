/**
 * Workflow Templates schema.
 *
 * Stores reusable workflow templates with semantic search capability.
 * Templates can be:
 * - Derived from successful user workflows
 * - System-provided templates
 * - Public templates shared across organizations
 *
 * Shaw's vision: "I'm going to search for similar workflows I already have...
 * Those are valuable, viable workflows."
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  customType,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { generatedWorkflows } from "./generated-workflows";

/**
 * Custom vector type for pgvector
 * This allows us to store embeddings for semantic search
 */
const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // Parse the vector string format: [0.1,0.2,0.3,...]
    const cleaned = value.replace(/[\[\]]/g, "");
    return cleaned.split(",").map(Number);
  },
});

/**
 * Workflow Templates table.
 *
 * Stores template workflows that can be searched semantically
 * and used as patterns for generating new workflows.
 */
export const workflowTemplates = pgTable(
  "workflow_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Optional org ownership (null = system/global template)
    organization_id: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),

    // Source workflow this template was derived from
    source_workflow_id: uuid("source_workflow_id").references(
      () => generatedWorkflows.id,
      { onDelete: "set null" },
    ),

    // Searchable metadata
    name: text("name").notNull(),
    description: text("description").notNull(),
    user_intent: text("user_intent").notNull(),

    // Semantic search vector (1536 dimensions for text-embedding-3-small)
    embedding: vector("embedding", { dimensions: 1536 }),

    // Template data
    generated_code: text("generated_code").notNull(),
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

    // Dependencies and requirements
    service_dependencies: text("service_dependencies").array().default([]),
    secret_requirements: jsonb("secret_requirements")
      .$type<
        Array<{
          provider: string;
          type: "oauth" | "api_key" | "credential";
          scopes?: string[];
          displayName: string;
          description: string;
        }>
      >()
      .notNull()
      .default([]),

    // Discovery
    tags: text("tags").array().default([]),
    category: text("category").default("custom"),
    is_public: boolean("is_public").default(false).notNull(),
    is_system: boolean("is_system").default(false).notNull(),

    // Analytics
    usage_count: integer("usage_count").default(0).notNull(),
    success_count: integer("success_count").default(0).notNull(),
    success_rate: numeric("success_rate", { precision: 5, scale: 2 }).default(
      "0.00",
    ),
    avg_execution_time_ms: integer("avg_execution_time_ms"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    // Standard indexes
    organization_idx: index("workflow_templates_organization_idx").on(
      table.organization_id,
    ),
    category_idx: index("workflow_templates_category_idx").on(table.category),
    public_idx: index("workflow_templates_public_idx").on(table.is_public),
    system_idx: index("workflow_templates_system_idx").on(table.is_system),
    source_workflow_idx: index("workflow_templates_source_workflow_idx").on(
      table.source_workflow_id,
    ),
    // Note: Vector index (ivfflat) will be created in migration SQL
    // as Drizzle doesn't have native support for vector indexes
  }),
);

// Type inference
export type WorkflowTemplate = InferSelectModel<typeof workflowTemplates>;
export type NewWorkflowTemplate = InferInsertModel<typeof workflowTemplates>;
