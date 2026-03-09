import {
  bigint, index, integer, jsonb, pgTable, text, timestamp, uuid,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { userCharacters } from "./user-characters";

export type MiladySandboxStatus =
  | "pending" | "provisioning" | "running" | "stopped" | "disconnected" | "error";

export const miladySandboxes = pgTable(
  "milady_sandboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    character_id: uuid("character_id").references(() => userCharacters.id, { onDelete: "set null" }),
    sandbox_id: text("sandbox_id"),
    status: text("status").$type<MiladySandboxStatus>().notNull().default("pending"),
    bridge_url: text("bridge_url"),
    health_url: text("health_url"),
    agent_name: text("agent_name"),
    agent_config: jsonb("agent_config").$type<Record<string, unknown>>(),
    neon_project_id: text("neon_project_id"),
    neon_branch_id: text("neon_branch_id"),
    database_uri: text("database_uri"),
    database_status: text("database_status").$type<"none" | "provisioning" | "ready" | "error">().notNull().default("none"),
    database_error: text("database_error"),
    snapshot_id: text("snapshot_id"),
    last_backup_at: timestamp("last_backup_at", { withTimezone: true }),
    last_heartbeat_at: timestamp("last_heartbeat_at", { withTimezone: true }),
    error_message: text("error_message"),
    error_count: integer("error_count").notNull().default(0),
    environment_vars: jsonb("environment_vars").$type<Record<string, string>>().notNull().default({}),
    // Docker infrastructure columns (added by 0046_docker_nodes migration)
    node_id: text("node_id"),
    container_name: text("container_name"),
    bridge_port: integer("bridge_port"),
    web_ui_port: integer("web_ui_port"),
    headscale_ip: text("headscale_ip"),
    docker_image: text("docker_image"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organization_idx: index("milady_sandboxes_organization_idx").on(table.organization_id),
    user_idx: index("milady_sandboxes_user_idx").on(table.user_id),
    status_idx: index("milady_sandboxes_status_idx").on(table.status),
    character_idx: index("milady_sandboxes_character_idx").on(table.character_id),
    sandbox_id_idx: index("milady_sandboxes_sandbox_id_idx").on(table.sandbox_id),
  }),
);

export type MiladyBackupSnapshotType = "auto" | "manual" | "pre-shutdown";

export interface MiladyBackupStateData {
  memories: Array<{ role: string; text: string; timestamp: number }>;
  config: Record<string, unknown>;
  workspaceFiles: Record<string, string>;
}

export const miladySandboxBackups = pgTable(
  "milady_sandbox_backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sandbox_record_id: uuid("sandbox_record_id").notNull().references(() => miladySandboxes.id, { onDelete: "cascade" }),
    snapshot_type: text("snapshot_type").$type<MiladyBackupSnapshotType>().notNull(),
    state_data: jsonb("state_data").$type<MiladyBackupStateData>().notNull(),
    vercel_snapshot_id: text("vercel_snapshot_id"),
    size_bytes: bigint("size_bytes", { mode: "number" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sandbox_record_idx: index("milady_sandbox_backups_sandbox_idx").on(table.sandbox_record_id),
    created_at_idx: index("milady_sandbox_backups_created_at_idx").on(table.created_at),
  }),
);

export type MiladySandbox = InferSelectModel<typeof miladySandboxes>;
export type NewMiladySandbox = InferInsertModel<typeof miladySandboxes>;
export type MiladySandboxBackup = InferSelectModel<typeof miladySandboxBackups>;
export type NewMiladySandboxBackup = InferInsertModel<typeof miladySandboxBackups>;
