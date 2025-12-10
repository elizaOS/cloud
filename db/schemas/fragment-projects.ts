/**
 * Fragment Projects Schema
 * 
 * Stores saved fragment projects that can be deployed as apps.
 * Supports both "quick mode" (single-file fragments) and "full app mode" (Vercel Sandbox).
 */

import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { apps } from "./apps";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type { FragmentSchema } from "@/lib/fragments/schema";

/**
 * Builder mode types:
 * - fragment: Quick single-file generation (browser-based execution)
 * - full_app: Full Next.js app via Vercel Sandbox
 */
export type BuilderMode = "fragment" | "full_app";

/**
 * Message structure for conversation history
 */
export interface BuilderMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  filesAffected?: string[];
}

export const fragmentProjects = pgTable(
  "fragment_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Project identification
    name: text("name").notNull(),
    description: text("description"),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Builder mode: "fragment" (quick) or "full_app" (Vercel Sandbox)
    builder_mode: text("builder_mode").$type<BuilderMode>().default("fragment").notNull(),

    // Fragment data (for quick mode)
    fragment_data: jsonb("fragment_data").$type<FragmentSchema>(),

    // Template and status
    template: text("template").notNull(),
    status: text("status").default("draft").notNull(), // draft, generating, ready, deployed, error, archived

    // Sandbox session (for full_app mode)
    sandbox_id: text("sandbox_id"), // Vercel Sandbox ID
    sandbox_url: text("sandbox_url"), // Preview URL
    sandbox_expires_at: timestamp("sandbox_expires_at"),

    // Conversation history (for both modes)
    messages: jsonb("messages").$type<BuilderMessage[]>().default([]),

    // Generated files tracking (for full_app mode)
    generated_files: jsonb("generated_files")
      .$type<Array<{ path: string; type: "created" | "modified" | "deleted"; timestamp: string }>>()
      .default([]),

    // Build configuration
    build_config: jsonb("build_config")
      .$type<{
        templateType?: "chat" | "agent-dashboard" | "landing-page" | "analytics" | "blank";
        includeMonetization?: boolean;
        includeAnalytics?: boolean;
        features?: string[];
      }>()
      .default({}),

    // Deployment
    deployed_app_id: uuid("deployed_app_id").references(() => apps.id, {
      onDelete: "set null",
    }),
    deployed_container_id: text("deployed_container_id"), // If deployed as container

    // Resource usage (for full_app mode)
    cpu_seconds_used: integer("cpu_seconds_used").default(0),

    // Metadata
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
    deployed_at: timestamp("deployed_at"),
  },
  (table) => ({
    organization_idx: index("fragment_projects_organization_idx").on(
      table.organization_id
    ),
    user_idx: index("fragment_projects_user_idx").on(table.user_id),
    status_idx: index("fragment_projects_status_idx").on(table.status),
    deployed_app_idx: index("fragment_projects_deployed_app_idx").on(
      table.deployed_app_id
    ),
    builder_mode_idx: index("fragment_projects_builder_mode_idx").on(
      table.builder_mode
    ),
    sandbox_id_idx: index("fragment_projects_sandbox_id_idx").on(
      table.sandbox_id
    ),
  })
);

export type FragmentProject = InferSelectModel<typeof fragmentProjects>;
export type NewFragmentProject = InferInsertModel<typeof fragmentProjects>;

