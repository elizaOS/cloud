/**
 * Workflow Secret Requirements schema.
 *
 * Stores the secret/credential requirements for each workflow.
 * This enables dynamic tracking of what credentials each workflow needs,
 * replacing the hardcoded WORKFLOW_CREDENTIALS mapping.
 */

import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { generatedWorkflows } from "./generated-workflows";

/**
 * Secret requirement type enum
 * - oauth: Requires OAuth token (e.g., Google OAuth with specific scopes)
 * - api_key: Requires API key (e.g., Twilio auth token)
 * - credential: Generic credential requirement
 */
export const secretRequirementTypeEnum = pgEnum("secret_requirement_type", [
  "oauth",
  "api_key",
  "credential",
]);

/**
 * Workflow Secret Requirements table.
 *
 * Tracks which secrets/credentials each workflow needs to execute.
 * This enables:
 * - Dynamic validation before workflow execution
 * - Showing users what needs to be connected to run a workflow
 * - Agent context about which workflows are runnable
 */
export const workflowSecretRequirements = pgTable(
  "workflow_secret_requirements",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Link to workflow
    workflow_id: uuid("workflow_id")
      .notNull()
      .references(() => generatedWorkflows.id, { onDelete: "cascade" }),

    // Requirement details
    provider: text("provider").notNull(), // 'google', 'twilio', 'notion', etc.
    requirement_type: secretRequirementTypeEnum("requirement_type").notNull(),
    secret_key: text("secret_key"), // For api_key type: 'twilio_auth_token'
    scopes: text("scopes").array(), // For oauth type: ['gmail.send', 'calendar.events']

    // User-friendly info
    display_name: text("display_name").notNull(), // 'Google Gmail Access'
    description: text("description").notNull(), // 'Required to send emails'
    auth_url: text("auth_url"), // '/dashboard/settings?connect=google'

    // Metadata
    required: boolean("required").default(true).notNull(),
    step_number: integer("step_number"), // Which execution step needs this

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    workflow_idx: index("workflow_secret_requirements_workflow_idx").on(
      table.workflow_id,
    ),
    provider_idx: index("workflow_secret_requirements_provider_idx").on(
      table.provider,
    ),
  }),
);

// Type inference
export type WorkflowSecretRequirement = InferSelectModel<
  typeof workflowSecretRequirements
>;
export type NewWorkflowSecretRequirement = InferInsertModel<
  typeof workflowSecretRequirements
>;
