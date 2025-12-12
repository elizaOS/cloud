/**
 * Code Agent Sessions Schema
 *
 * Tracks code agent sessions with full state persistence.
 * Supports multiple runtime backends (Vercel Sandbox, Cloudflare Containers, AWS ECS).
 *
 * Features:
 * - Session lifecycle management
 * - File snapshots for state restoration
 * - Git state tracking
 * - Usage metering for billing
 */

import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// =============================================================================
// TYPES
// =============================================================================

export type CodeAgentSessionStatus =
  | "creating"
  | "ready"
  | "executing"
  | "suspended"
  | "restoring"
  | "terminated"
  | "error";

export type CodeAgentRuntimeType = "vercel" | "cloudflare" | "aws";

export type CodeAgentLanguage =
  | "python"
  | "javascript"
  | "typescript"
  | "shell"
  | "rust"
  | "go";

export interface FileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: string;
}

export interface GitState {
  isRepo: boolean;
  branch?: string;
  commitHash?: string;
  remoteUrl?: string;
  hasUncommittedChanges?: boolean;
}

export interface SessionCapabilities {
  languages: CodeAgentLanguage[];
  hasGit: boolean;
  hasDocker: boolean;
  maxCpuSeconds: number;
  maxMemoryMb: number;
  maxDiskMb: number;
  networkAccess: boolean;
}

// =============================================================================
// CODE AGENT SESSIONS TABLE
// =============================================================================

export const codeAgentSessions = pgTable(
  "code_agent_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Session identity
    name: text("name"),
    description: text("description"),

    // Runtime configuration
    runtime_type: text("runtime_type")
      .$type<CodeAgentRuntimeType>()
      .notNull()
      .default("vercel"),
    runtime_id: text("runtime_id"), // Sandbox ID, Container ID, etc.
    runtime_url: text("runtime_url"), // Public URL if available

    // Session state
    status: text("status")
      .$type<CodeAgentSessionStatus>()
      .notNull()
      .default("creating"),
    status_message: text("status_message"),
    working_directory: text("working_directory").default("/app"),

    // Environment
    environment_variables: jsonb("environment_variables")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    secrets_loaded: jsonb("secrets_loaded")
      .$type<string[]>()
      .default([])
      .notNull(),

    // Git state
    git_state: jsonb("git_state").$type<GitState>(),

    // Capabilities
    capabilities: jsonb("capabilities")
      .$type<SessionCapabilities>()
      .default({
        languages: ["javascript", "typescript", "python", "shell"],
        hasGit: true,
        hasDocker: false,
        maxCpuSeconds: 3600,
        maxMemoryMb: 2048,
        maxDiskMb: 10240,
        networkAccess: true,
      })
      .notNull(),

    // Snapshots
    latest_snapshot_id: uuid("latest_snapshot_id"),
    snapshot_count: integer("snapshot_count").default(0).notNull(),
    auto_snapshot_enabled: boolean("auto_snapshot_enabled")
      .default(true)
      .notNull(),
    auto_snapshot_interval_seconds: integer("auto_snapshot_interval_seconds")
      .default(300)
      .notNull(),

    // Usage tracking
    cpu_seconds_used: integer("cpu_seconds_used").default(0).notNull(),
    memory_mb_peak: integer("memory_mb_peak").default(0).notNull(),
    disk_mb_used: integer("disk_mb_used").default(0).notNull(),
    api_calls_count: integer("api_calls_count").default(0).notNull(),
    commands_executed: integer("commands_executed").default(0).notNull(),
    files_created: integer("files_created").default(0).notNull(),
    files_modified: integer("files_modified").default(0).notNull(),

    // Cost tracking
    estimated_cost_cents: integer("estimated_cost_cents").default(0).notNull(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
    last_activity_at: timestamp("last_activity_at").notNull().defaultNow(),
    expires_at: timestamp("expires_at"),
    suspended_at: timestamp("suspended_at"),
    terminated_at: timestamp("terminated_at"),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => ({
    org_idx: index("code_agent_sessions_org_idx").on(table.organization_id),
    user_idx: index("code_agent_sessions_user_idx").on(table.user_id),
    status_idx: index("code_agent_sessions_status_idx").on(table.status),
    runtime_idx: index("code_agent_sessions_runtime_idx").on(table.runtime_id),
    created_at_idx: index("code_agent_sessions_created_at_idx").on(
      table.created_at
    ),
    expires_at_idx: index("code_agent_sessions_expires_at_idx").on(
      table.expires_at
    ),
  })
);

// =============================================================================
// CODE AGENT SNAPSHOTS TABLE
// =============================================================================

export const codeAgentSnapshots = pgTable(
  "code_agent_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    session_id: uuid("session_id")
      .notNull()
      .references(() => codeAgentSessions.id, { onDelete: "cascade" }),

    // Snapshot identity
    name: text("name"),
    description: text("description"),
    snapshot_type: text("snapshot_type")
      .$type<"auto" | "manual" | "pre_restore">()
      .default("manual")
      .notNull(),

    // Storage
    storage_backend: text("storage_backend")
      .$type<"r2" | "s3" | "vercel_blob">()
      .default("vercel_blob")
      .notNull(),
    storage_key: text("storage_key").notNull(), // Bucket key for file archive

    // Content metadata
    file_count: integer("file_count").default(0).notNull(),
    total_size_bytes: integer("total_size_bytes").default(0).notNull(),
    file_manifest: jsonb("file_manifest").$type<FileEntry[]>().default([]),

    // Git state at snapshot time
    git_state: jsonb("git_state").$type<GitState>(),

    // Environment at snapshot time
    environment_variables: jsonb("environment_variables")
      .$type<Record<string, string>>()
      .default({}),
    working_directory: text("working_directory"),

    // Validity
    is_valid: boolean("is_valid").default(true).notNull(),
    validation_error: text("validation_error"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    expires_at: timestamp("expires_at"),
  },
  (table) => ({
    session_idx: index("code_agent_snapshots_session_idx").on(table.session_id),
    created_at_idx: index("code_agent_snapshots_created_at_idx").on(
      table.created_at
    ),
    storage_key_idx: index("code_agent_snapshots_storage_key_idx").on(
      table.storage_key
    ),
  })
);

// =============================================================================
// CODE AGENT COMMANDS TABLE
// =============================================================================

export const codeAgentCommands = pgTable(
  "code_agent_commands",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    session_id: uuid("session_id")
      .notNull()
      .references(() => codeAgentSessions.id, { onDelete: "cascade" }),

    // Command details
    command_type: text("command_type")
      .$type<
        | "shell"
        | "python"
        | "javascript"
        | "typescript"
        | "read_file"
        | "write_file"
        | "list_files"
        | "delete_file"
        | "git"
        | "install_packages"
      >()
      .notNull(),
    command: text("command").notNull(),
    arguments: jsonb("arguments").$type<Record<string, unknown>>(),

    // Working directory at execution time
    working_directory: text("working_directory"),

    // Result
    status: text("status")
      .$type<"pending" | "running" | "success" | "error" | "timeout">()
      .default("pending")
      .notNull(),
    exit_code: integer("exit_code"),
    stdout: text("stdout"),
    stderr: text("stderr"),
    error_message: text("error_message"),

    // Files affected
    files_created: jsonb("files_created").$type<string[]>().default([]),
    files_modified: jsonb("files_modified").$type<string[]>().default([]),
    files_deleted: jsonb("files_deleted").$type<string[]>().default([]),

    // Execution metrics
    duration_ms: integer("duration_ms"),
    cpu_time_ms: integer("cpu_time_ms"),
    memory_mb_peak: integer("memory_mb_peak"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    started_at: timestamp("started_at"),
    completed_at: timestamp("completed_at"),
  },
  (table) => ({
    session_idx: index("code_agent_commands_session_idx").on(table.session_id),
    status_idx: index("code_agent_commands_status_idx").on(table.status),
    created_at_idx: index("code_agent_commands_created_at_idx").on(
      table.created_at
    ),
  })
);

// =============================================================================
// INTERPRETER EXECUTIONS TABLE (for quick stateless executions)
// =============================================================================

export const interpreterExecutions = pgTable(
  "interpreter_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Execution details
    language: text("language")
      .$type<"python" | "javascript" | "typescript" | "shell">()
      .notNull(),
    code: text("code").notNull(),
    packages: jsonb("packages").$type<string[]>().default([]),

    // Result
    status: text("status")
      .$type<"pending" | "running" | "success" | "error" | "timeout">()
      .default("pending")
      .notNull(),
    output: text("output"),
    error: text("error"),
    exit_code: integer("exit_code"),

    // Metrics
    duration_ms: integer("duration_ms"),
    memory_mb_peak: integer("memory_mb_peak"),

    // Cost
    cost_cents: integer("cost_cents").default(0).notNull(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    completed_at: timestamp("completed_at"),
  },
  (table) => ({
    org_idx: index("interpreter_executions_org_idx").on(table.organization_id),
    user_idx: index("interpreter_executions_user_idx").on(table.user_id),
    language_idx: index("interpreter_executions_language_idx").on(
      table.language
    ),
    created_at_idx: index("interpreter_executions_created_at_idx").on(
      table.created_at
    ),
  })
);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type CodeAgentSession = InferSelectModel<typeof codeAgentSessions>;
export type NewCodeAgentSession = InferInsertModel<typeof codeAgentSessions>;

export type CodeAgentSnapshot = InferSelectModel<typeof codeAgentSnapshots>;
export type NewCodeAgentSnapshot = InferInsertModel<typeof codeAgentSnapshots>;

export type CodeAgentCommand = InferSelectModel<typeof codeAgentCommands>;
export type NewCodeAgentCommand = InferInsertModel<typeof codeAgentCommands>;

export type InterpreterExecution = InferSelectModel<typeof interpreterExecutions>;
export type NewInterpreterExecution = InferInsertModel<typeof interpreterExecutions>;

