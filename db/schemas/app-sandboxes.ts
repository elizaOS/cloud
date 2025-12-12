import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { apps } from "./apps";
import { users } from "./users";
import { organizations } from "./organizations";

/**
 * App sandbox sessions table schema.
 *
 * Tracks Vercel Sandbox instances for AI-powered app building.
 * Each session represents an ephemeral sandbox where users can
 * prompt Claude Code to generate/modify Next.js apps.
 */
export const appSandboxSessions = pgTable(
  "app_sandbox_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Session ownership
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Optional link to existing app (for editing existing apps)
    app_id: uuid("app_id").references(() => apps.id, { onDelete: "set null" }),

    // Sandbox identification
    sandbox_id: text("sandbox_id").unique(), // Vercel Sandbox ID
    sandbox_url: text("sandbox_url"), // Public URL to the sandbox dev server

    // Session status
    status: text("status")
      .$type<
        | "initializing"
        | "ready"
        | "generating"
        | "error"
        | "stopped"
        | "timeout"
      >()
      .notNull()
      .default("initializing"),
    status_message: text("status_message"),

    // App metadata (user's initial prompt and configuration)
    app_name: text("app_name"),
    app_description: text("app_description"),
    initial_prompt: text("initial_prompt"), // User's prompt to describe the app
    template_type: text("template_type")
      .$type<
        "chat" | "agent-dashboard" | "landing-page" | "analytics" | "blank"
      >()
      .default("blank"),

    // Build configuration
    build_config: jsonb("build_config")
      .$type<{
        features?: string[];
        integrations?: string[];
        styling?: "minimal" | "branded" | "custom";
        includeAnalytics?: boolean;
        includeMonetization?: boolean;
      }>()
      .default({})
      .notNull(),

    // Claude Code session tracking
    claude_session_id: text("claude_session_id"), // Claude CLI session ID
    claude_messages: jsonb("claude_messages")
      .$type<
        Array<{
          role: "user" | "assistant" | "system";
          content: string;
          timestamp: string;
        }>
      >()
      .default([])
      .notNull(),

    // Workflow tracking (for long-running Claude sessions)
    workflow_run_id: text("workflow_run_id"),
    workflow_status: text("workflow_status")
      .$type<"pending" | "running" | "paused" | "completed" | "failed">()
      .default("pending"),

    // Generated files tracking
    generated_files: jsonb("generated_files")
      .$type<
        Array<{
          path: string;
          type: "created" | "modified" | "deleted";
          timestamp: string;
        }>
      >()
      .default([])
      .notNull(),

    // Resource usage
    cpu_seconds_used: integer("cpu_seconds_used").default(0).notNull(),
    memory_mb_peak: integer("memory_mb_peak").default(0),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
    started_at: timestamp("started_at"),
    stopped_at: timestamp("stopped_at"),
    expires_at: timestamp("expires_at"), // Sandbox auto-stop time
  },
  (table) => ({
    user_id_idx: index("app_sandbox_sessions_user_id_idx").on(table.user_id),
    organization_id_idx: index("app_sandbox_sessions_org_id_idx").on(
      table.organization_id,
    ),
    app_id_idx: index("app_sandbox_sessions_app_id_idx").on(table.app_id),
    sandbox_id_idx: index("app_sandbox_sessions_sandbox_id_idx").on(
      table.sandbox_id,
    ),
    status_idx: index("app_sandbox_sessions_status_idx").on(table.status),
    created_at_idx: index("app_sandbox_sessions_created_at_idx").on(
      table.created_at,
    ),
  }),
);

/**
 * App builder prompts table schema.
 *
 * Stores conversation history between user and Claude Code
 * for app building sessions.
 */
export const appBuilderPrompts = pgTable(
  "app_builder_prompts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    sandbox_session_id: uuid("sandbox_session_id")
      .notNull()
      .references(() => appSandboxSessions.id, { onDelete: "cascade" }),

    // Message details
    role: text("role").$type<"user" | "assistant" | "system">().notNull(),
    content: text("content").notNull(),

    // Response metadata (for assistant messages)
    files_affected: jsonb("files_affected").$type<string[]>().default([]),
    tool_calls: jsonb("tool_calls")
      .$type<
        Array<{
          tool: string;
          input: Record<string, unknown>;
          output?: string;
        }>
      >()
      .default([]),

    // Status
    status: text("status")
      .$type<"pending" | "processing" | "completed" | "error">()
      .notNull()
      .default("pending"),
    error_message: text("error_message"),

    // Timing
    created_at: timestamp("created_at").notNull().defaultNow(),
    completed_at: timestamp("completed_at"),
    duration_ms: integer("duration_ms"),
  },
  (table) => ({
    session_idx: index("app_builder_prompts_session_idx").on(
      table.sandbox_session_id,
    ),
    created_at_idx: index("app_builder_prompts_created_at_idx").on(
      table.created_at,
    ),
  }),
);

/**
 * App templates table schema.
 *
 * Pre-built templates for common app types that users can start from.
 */
export const appTemplates = pgTable(
  "app_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Template identification
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    category: text("category")
      .$type<
        "chat" | "agent" | "dashboard" | "landing" | "analytics" | "utility"
      >()
      .notNull(),

    // Template content
    preview_image_url: text("preview_image_url"),
    git_repo_url: text("git_repo_url").notNull(), // GitHub repo with template code
    git_branch: text("git_branch").default("main"),

    // Features included
    features: jsonb("features").$type<string[]>().default([]).notNull(),

    // Claude prompts for this template
    system_prompt: text("system_prompt"), // Initial context for Claude
    example_prompts: jsonb("example_prompts")
      .$type<string[]>()
      .default([])
      .notNull(),

    // Usage tracking
    usage_count: integer("usage_count").default(0).notNull(),

    // Status
    is_active: boolean("is_active").default(true).notNull(),
    is_featured: boolean("is_featured").default(false).notNull(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    slug_idx: index("app_templates_slug_idx").on(table.slug),
    category_idx: index("app_templates_category_idx").on(table.category),
    is_active_idx: index("app_templates_is_active_idx").on(table.is_active),
    is_featured_idx: index("app_templates_is_featured_idx").on(
      table.is_featured,
    ),
  }),
);

// Type inference
export type AppSandboxSession = InferSelectModel<typeof appSandboxSessions>;
export type NewAppSandboxSession = InferInsertModel<typeof appSandboxSessions>;
export type AppBuilderPrompt = InferSelectModel<typeof appBuilderPrompts>;
export type NewAppBuilderPrompt = InferInsertModel<typeof appBuilderPrompts>;
export type AppTemplate = InferSelectModel<typeof appTemplates>;
export type NewAppTemplate = InferInsertModel<typeof appTemplates>;
