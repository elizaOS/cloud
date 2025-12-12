/**
 * App Integrations Schema
 *
 * Junction tables for linking apps to agents, workflows, and services.
 * Enables many-to-many relationships between apps and other entities.
 *
 * When an app is created from an agent, workflow, or service, these
 * tables track the linkage. Apps can have multiple integrations of
 * each type, and entities can be linked to multiple apps.
 */

import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { apps } from "./apps";
import { userCharacters } from "./user-characters";
import { n8nWorkflows } from "./n8n-workflows";
import { userMcps } from "./user-mcps";

// =============================================================================
// APP AGENTS JUNCTION TABLE
// =============================================================================

/**
 * Links apps to agents (user characters).
 * An app can have multiple agents, and an agent can be linked to multiple apps.
 */
export const appAgents = pgTable(
  "app_agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // App reference
    app_id: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),

    // Agent reference
    agent_id: uuid("agent_id")
      .notNull()
      .references(() => userCharacters.id, { onDelete: "cascade" }),

    // Whether this is the primary agent for the app
    is_primary: boolean("is_primary").default(false).notNull(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Each app-agent pair must be unique
    unique_idx: uniqueIndex("app_agents_unique_idx").on(
      table.app_id,
      table.agent_id
    ),
    app_idx: index("app_agents_app_idx").on(table.app_id),
    agent_idx: index("app_agents_agent_idx").on(table.agent_id),
  })
);

// =============================================================================
// APP WORKFLOWS JUNCTION TABLE
// =============================================================================

/**
 * Links apps to n8n workflows.
 * An app can have multiple workflows, and a workflow can be linked to multiple apps.
 */
export const appWorkflows = pgTable(
  "app_workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // App reference
    app_id: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),

    // Workflow reference
    workflow_id: uuid("workflow_id")
      .notNull()
      .references(() => n8nWorkflows.id, { onDelete: "cascade" }),

    // Whether this is the primary workflow for the app
    is_primary: boolean("is_primary").default(false).notNull(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Each app-workflow pair must be unique
    unique_idx: uniqueIndex("app_workflows_unique_idx").on(
      table.app_id,
      table.workflow_id
    ),
    app_idx: index("app_workflows_app_idx").on(table.app_id),
    workflow_idx: index("app_workflows_workflow_idx").on(table.workflow_id),
  })
);

// =============================================================================
// APP SERVICES JUNCTION TABLE
// =============================================================================

/**
 * Links apps to services (user MCPs).
 * An app can have multiple services, and a service can be linked to multiple apps.
 */
export const appServices = pgTable(
  "app_services",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // App reference
    app_id: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),

    // Service reference
    service_id: uuid("service_id")
      .notNull()
      .references(() => userMcps.id, { onDelete: "cascade" }),

    // Whether this is the primary service for the app
    is_primary: boolean("is_primary").default(false).notNull(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    // Each app-service pair must be unique
    unique_idx: uniqueIndex("app_services_unique_idx").on(
      table.app_id,
      table.service_id
    ),
    app_idx: index("app_services_app_idx").on(table.app_id),
    service_idx: index("app_services_service_idx").on(table.service_id),
  })
);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type AppAgent = InferSelectModel<typeof appAgents>;
export type NewAppAgent = InferInsertModel<typeof appAgents>;
export type AppWorkflow = InferSelectModel<typeof appWorkflows>;
export type NewAppWorkflow = InferInsertModel<typeof appWorkflows>;
export type AppService = InferSelectModel<typeof appServices>;
export type NewAppService = InferInsertModel<typeof appServices>;


