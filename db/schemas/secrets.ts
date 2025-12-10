/**
 * Secrets Management Schema
 *
 * Production-grade secrets storage with:
 * - Envelope encryption (AES-256-GCM + KMS)
 * - Organization → Project → Environment scoping
 * - Audit logging for compliance
 * - Secret rotation support
 * - OAuth session storage
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
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
// ENUMS
// =============================================================================

export const secretScopeEnum = pgEnum("secret_scope", [
  "organization",
  "project",
  "environment",
]);

export const secretEnvironmentEnum = pgEnum("secret_environment", [
  "development",
  "preview",
  "production",
]);

export const secretAuditActionEnum = pgEnum("secret_audit_action", [
  "created",
  "read",
  "updated",
  "deleted",
  "rotated",
]);

export const secretActorTypeEnum = pgEnum("secret_actor_type", [
  "user",
  "api_key",
  "system",
  "deployment",
  "workflow",
]);

// =============================================================================
// SECRETS TABLE
// =============================================================================

/**
 * Encrypted secrets storage using envelope encryption.
 *
 * Each secret is encrypted with a unique DEK (Data Encryption Key),
 * and the DEK is encrypted with a KEK (Key Encryption Key) from KMS.
 * Only the encrypted DEK is stored in the database.
 */
export const secrets = pgTable(
  "secrets",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Scoping
    scope: secretScopeEnum("scope").notNull().default("organization"),
    project_id: uuid("project_id"), // For project-scoped secrets (character, mcp, workflow, etc.)
    project_type: text("project_type"), // "character" | "mcp" | "workflow" | "container" | "app"
    environment: secretEnvironmentEnum("environment"), // For environment-scoped secrets

    // Secret identity
    name: text("name").notNull(), // e.g., "OPENAI_API_KEY"
    description: text("description"),

    // Encrypted value (AES-256-GCM)
    encrypted_value: text("encrypted_value").notNull(),

    // Key management
    encryption_key_id: text("encryption_key_id").notNull(), // KMS key ID/ARN
    encrypted_dek: text("encrypted_dek").notNull(), // Encrypted data encryption key
    nonce: text("nonce").notNull(), // IV for AES-GCM (base64)
    auth_tag: text("auth_tag").notNull(), // GCM auth tag (base64)

    // Metadata
    version: integer("version").default(1).notNull(),
    last_rotated_at: timestamp("last_rotated_at"),
    expires_at: timestamp("expires_at"),

    // Audit
    created_by: uuid("created_by")
      .notNull()
      .references(() => users.id),
    last_accessed_at: timestamp("last_accessed_at"),
    access_count: integer("access_count").default(0).notNull(),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    // Unique constraint: one secret name per org/project/environment combo
    org_name_project_env_idx: uniqueIndex("secrets_org_name_project_env_idx").on(
      table.organization_id,
      table.name,
      table.project_id,
      table.environment
    ),
    org_idx: index("secrets_org_idx").on(table.organization_id),
    project_idx: index("secrets_project_idx").on(table.project_id),
    scope_idx: index("secrets_scope_idx").on(table.scope),
    env_idx: index("secrets_env_idx").on(table.environment),
    name_idx: index("secrets_name_idx").on(table.name),
    expires_idx: index("secrets_expires_idx").on(table.expires_at),
  })
);

// =============================================================================
// OAUTH SESSIONS TABLE
// =============================================================================

/**
 * OAuth token storage for third-party integrations.
 *
 * Stores encrypted access and refresh tokens for services like
 * Google, GitHub, Notion, Slack, etc.
 */
export const oauthSessions = pgTable(
  "oauth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Ownership
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),

    // Provider info
    provider: text("provider").notNull(), // "google", "github", "notion", "slack", etc.
    provider_account_id: text("provider_account_id"), // External account ID

    // Tokens (encrypted)
    encrypted_access_token: text("encrypted_access_token").notNull(),
    encrypted_refresh_token: text("encrypted_refresh_token"),
    token_type: text("token_type").default("Bearer"),

    // Encryption metadata for access token
    encryption_key_id: text("encryption_key_id").notNull(),
    encrypted_dek: text("encrypted_dek").notNull(),
    nonce: text("nonce").notNull(),
    auth_tag: text("auth_tag").notNull(),

    // Encryption metadata for refresh token (separate DEK for security)
    refresh_encrypted_dek: text("refresh_encrypted_dek"),
    refresh_nonce: text("refresh_nonce"),
    refresh_auth_tag: text("refresh_auth_tag"),

    // Token metadata
    scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),
    access_token_expires_at: timestamp("access_token_expires_at"),
    refresh_token_expires_at: timestamp("refresh_token_expires_at"),

    // Provider-specific data (encrypted JSON)
    encrypted_provider_data: text("encrypted_provider_data"),
    provider_data_nonce: text("provider_data_nonce"),
    provider_data_auth_tag: text("provider_data_auth_tag"),

    // Usage tracking
    last_used_at: timestamp("last_used_at"),
    last_refreshed_at: timestamp("last_refreshed_at"),
    refresh_count: integer("refresh_count").default(0).notNull(),

    // Status
    is_valid: boolean("is_valid").default(true).notNull(),
    revoked_at: timestamp("revoked_at"),
    revoke_reason: text("revoke_reason"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    org_provider_idx: uniqueIndex("oauth_sessions_org_provider_idx").on(
      table.organization_id,
      table.provider,
      table.user_id
    ),
    user_provider_idx: index("oauth_sessions_user_provider_idx").on(
      table.user_id,
      table.provider
    ),
    provider_idx: index("oauth_sessions_provider_idx").on(table.provider),
    expires_idx: index("oauth_sessions_expires_idx").on(
      table.access_token_expires_at
    ),
    valid_idx: index("oauth_sessions_valid_idx").on(table.is_valid),
  })
);

// =============================================================================
// SECRET AUDIT LOG TABLE
// =============================================================================

/**
 * Immutable audit log for all secret operations.
 *
 * Required for SOC 2 compliance and security monitoring.
 * Records are never deleted, only appended.
 */
export const secretAuditLog = pgTable(
  "secret_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Reference (don't FK - keep log even if secret deleted)
    secret_id: uuid("secret_id"), // Null for OAuth operations
    oauth_session_id: uuid("oauth_session_id"), // Null for secret operations
    organization_id: uuid("organization_id").notNull(),

    // What happened
    action: secretAuditActionEnum("action").notNull(),
    secret_name: text("secret_name"), // Denormalized for queries after deletion

    // Who did it
    actor_type: secretActorTypeEnum("actor_type").notNull(),
    actor_id: text("actor_id").notNull(), // User ID, API key ID, "system", deployment ID
    actor_email: text("actor_email"), // Denormalized for display

    // Context
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    source: text("source"), // "dashboard", "api", "cli", "deployment", "workflow"

    // Request details
    request_id: text("request_id"), // Correlation ID
    endpoint: text("endpoint"), // API endpoint that triggered this

    // Additional metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),

    // Immutable timestamp
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    secret_idx: index("secret_audit_log_secret_idx").on(table.secret_id),
    oauth_idx: index("secret_audit_log_oauth_idx").on(table.oauth_session_id),
    org_idx: index("secret_audit_log_org_idx").on(table.organization_id),
    action_idx: index("secret_audit_log_action_idx").on(table.action),
    actor_idx: index("secret_audit_log_actor_idx").on(
      table.actor_type,
      table.actor_id
    ),
    created_at_idx: index("secret_audit_log_created_at_idx").on(table.created_at),
    // Composite index for common query patterns
    org_action_time_idx: index("secret_audit_log_org_action_time_idx").on(
      table.organization_id,
      table.action,
      table.created_at
    ),
  })
);

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type Secret = InferSelectModel<typeof secrets>;
export type NewSecret = InferInsertModel<typeof secrets>;

export type OAuthSession = InferSelectModel<typeof oauthSessions>;
export type NewOAuthSession = InferInsertModel<typeof oauthSessions>;

export type SecretAuditLog = InferSelectModel<typeof secretAuditLog>;
export type NewSecretAuditLog = InferInsertModel<typeof secretAuditLog>;

// Scope types
export type SecretScope = "organization" | "project" | "environment";
export type SecretEnvironment = "development" | "preview" | "production";
export type SecretAuditAction = "created" | "read" | "updated" | "deleted" | "rotated";
export type SecretActorType = "user" | "api_key" | "system" | "deployment" | "workflow";

