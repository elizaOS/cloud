/**
 * Secrets Repository
 *
 * Database operations for secrets, OAuth sessions, and audit logs.
 */

import { db } from "@/db/client";
import {
  secrets,
  oauthSessions,
  secretAuditLog,
  type Secret,
  type NewSecret,
  type OAuthSession,
  type NewOAuthSession,
  type SecretAuditLog,
  type NewSecretAuditLog,
  type SecretScope,
  type SecretEnvironment,
} from "@/db/schemas/secrets";
import { eq, and, isNull, sql, desc, gte, lte, inArray } from "drizzle-orm";

// =============================================================================
// Secrets Repository
// =============================================================================

export interface FindSecretsParams {
  organizationId: string;
  projectId?: string;
  environment?: SecretEnvironment;
  scope?: SecretScope;
  names?: string[];
}

class SecretsRepository {
  /**
   * Create a new secret.
   */
  async create(data: NewSecret): Promise<Secret> {
    const [secret] = await db.insert(secrets).values(data).returning();
    return secret;
  }

  /**
   * Find a secret by ID.
   */
  async findById(id: string): Promise<Secret | undefined> {
    const [secret] = await db.select().from(secrets).where(eq(secrets.id, id));
    return secret;
  }

  /**
   * Find a secret by name within an organization context.
   */
  async findByName(
    organizationId: string,
    name: string,
    projectId?: string,
    environment?: SecretEnvironment
  ): Promise<Secret | undefined> {
    const conditions = [
      eq(secrets.organization_id, organizationId),
      eq(secrets.name, name),
    ];

    if (projectId) {
      conditions.push(eq(secrets.project_id, projectId));
    } else {
      conditions.push(isNull(secrets.project_id));
    }

    if (environment) {
      conditions.push(eq(secrets.environment, environment));
    } else {
      conditions.push(isNull(secrets.environment));
    }

    const [secret] = await db
      .select()
      .from(secrets)
      .where(and(...conditions));

    return secret;
  }

  /**
   * Find secrets for a given context (org, project, environment).
   * Returns secrets in priority order: environment > project > organization
   */
  async findByContext(params: FindSecretsParams): Promise<Secret[]> {
    const { organizationId, projectId, environment, scope, names } = params;

    const conditions = [eq(secrets.organization_id, organizationId)];

    if (scope) {
      conditions.push(eq(secrets.scope, scope));
    }

    if (projectId) {
      // Include both project-specific and organization-level secrets
      conditions.push(
        sql`(${secrets.project_id} = ${projectId} OR ${secrets.project_id} IS NULL)`
      );
    }

    if (environment) {
      // Include both environment-specific and non-environment secrets
      conditions.push(
        sql`(${secrets.environment} = ${environment} OR ${secrets.environment} IS NULL)`
      );
    }

    if (names && names.length > 0) {
      conditions.push(inArray(secrets.name, names));
    }

    const results = await db
      .select()
      .from(secrets)
      .where(and(...conditions))
      .orderBy(
        // Priority: environment-specific > project-specific > organization
        desc(secrets.environment),
        desc(secrets.project_id),
        secrets.name
      );

    // Deduplicate by name, keeping highest priority (first occurrence)
    const seen = new Set<string>();
    return results.filter((secret) => {
      if (seen.has(secret.name)) return false;
      seen.add(secret.name);
      return true;
    });
  }

  /**
   * List all secrets for an organization (metadata only, no values).
   */
  async listByOrganization(organizationId: string): Promise<Secret[]> {
    return db
      .select()
      .from(secrets)
      .where(eq(secrets.organization_id, organizationId))
      .orderBy(secrets.name);
  }

  /**
   * List secrets for a specific project.
   */
  async listByProject(projectId: string): Promise<Secret[]> {
    return db
      .select()
      .from(secrets)
      .where(eq(secrets.project_id, projectId))
      .orderBy(secrets.name);
  }

  /**
   * Update a secret.
   */
  async update(id: string, data: Partial<NewSecret>): Promise<Secret | undefined> {
    const [secret] = await db
      .update(secrets)
      .set({ ...data, updated_at: new Date() })
      .where(eq(secrets.id, id))
      .returning();
    return secret;
  }

  /**
   * Delete a secret.
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.delete(secrets).where(eq(secrets.id, id)).returning({ id: secrets.id });
    return result.length > 0;
  }

  /**
   * Increment access count and update last accessed time.
   */
  async recordAccess(id: string): Promise<void> {
    await db
      .update(secrets)
      .set({
        access_count: sql`${secrets.access_count} + 1`,
        last_accessed_at: new Date(),
      })
      .where(eq(secrets.id, id));
  }

  /**
   * Find secrets expiring within a given time window.
   */
  async findExpiringSoon(withinDays: number): Promise<Secret[]> {
    const now = new Date();
    const deadline = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

    return db
      .select()
      .from(secrets)
      .where(
        and(
          gte(secrets.expires_at, now),
          lte(secrets.expires_at, deadline)
        )
      )
      .orderBy(secrets.expires_at);
  }
}

// =============================================================================
// OAuth Sessions Repository
// =============================================================================

class OAuthSessionsRepository {
  /**
   * Create a new OAuth session.
   */
  async create(data: NewOAuthSession): Promise<OAuthSession> {
    const [session] = await db.insert(oauthSessions).values(data).returning();
    return session;
  }

  /**
   * Find an OAuth session by ID.
   */
  async findById(id: string): Promise<OAuthSession | undefined> {
    const [session] = await db
      .select()
      .from(oauthSessions)
      .where(eq(oauthSessions.id, id));
    return session;
  }

  /**
   * Find an OAuth session by organization and provider.
   */
  async findByOrgAndProvider(
    organizationId: string,
    provider: string,
    userId?: string
  ): Promise<OAuthSession | undefined> {
    const conditions = [
      eq(oauthSessions.organization_id, organizationId),
      eq(oauthSessions.provider, provider),
      eq(oauthSessions.is_valid, true),
    ];

    if (userId) {
      conditions.push(eq(oauthSessions.user_id, userId));
    }

    const [session] = await db
      .select()
      .from(oauthSessions)
      .where(and(...conditions));

    return session;
  }

  /**
   * List all OAuth sessions for an organization.
   */
  async listByOrganization(organizationId: string): Promise<OAuthSession[]> {
    return db
      .select()
      .from(oauthSessions)
      .where(eq(oauthSessions.organization_id, organizationId))
      .orderBy(oauthSessions.provider);
  }

  /**
   * Update an OAuth session.
   */
  async update(
    id: string,
    data: Partial<NewOAuthSession>
  ): Promise<OAuthSession | undefined> {
    const [session] = await db
      .update(oauthSessions)
      .set({ ...data, updated_at: new Date() })
      .where(eq(oauthSessions.id, id))
      .returning();
    return session;
  }

  /**
   * Revoke an OAuth session.
   */
  async revoke(id: string, reason: string): Promise<OAuthSession | undefined> {
    const [session] = await db
      .update(oauthSessions)
      .set({
        is_valid: false,
        revoked_at: new Date(),
        revoke_reason: reason,
        updated_at: new Date(),
      })
      .where(eq(oauthSessions.id, id))
      .returning();
    return session;
  }

  /**
   * Delete an OAuth session.
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.delete(oauthSessions).where(eq(oauthSessions.id, id)).returning({ id: oauthSessions.id });
    return result.length > 0;
  }

  /**
   * Record usage of an OAuth session.
   */
  async recordUsage(id: string): Promise<void> {
    await db
      .update(oauthSessions)
      .set({ last_used_at: new Date() })
      .where(eq(oauthSessions.id, id));
  }

  /**
   * Record a token refresh.
   */
  async recordRefresh(id: string): Promise<void> {
    await db
      .update(oauthSessions)
      .set({
        last_refreshed_at: new Date(),
        refresh_count: sql`${oauthSessions.refresh_count} + 1`,
        updated_at: new Date(),
      })
      .where(eq(oauthSessions.id, id));
  }

  /**
   * Find sessions with expired access tokens that have refresh tokens.
   */
  async findNeedingRefresh(): Promise<OAuthSession[]> {
    const now = new Date();

    return db
      .select()
      .from(oauthSessions)
      .where(
        and(
          eq(oauthSessions.is_valid, true),
          lte(oauthSessions.access_token_expires_at, now),
          sql`${oauthSessions.encrypted_refresh_token} IS NOT NULL`
        )
      );
  }
}

// =============================================================================
// Secret Audit Log Repository
// =============================================================================

class SecretAuditLogRepository {
  /**
   * Create an audit log entry.
   */
  async create(data: NewSecretAuditLog): Promise<SecretAuditLog> {
    const [entry] = await db.insert(secretAuditLog).values(data).returning();
    return entry;
  }

  /**
   * Find audit entries for a specific secret.
   */
  async findBySecret(secretId: string, limit = 100): Promise<SecretAuditLog[]> {
    return db
      .select()
      .from(secretAuditLog)
      .where(eq(secretAuditLog.secret_id, secretId))
      .orderBy(desc(secretAuditLog.created_at))
      .limit(limit);
  }

  /**
   * Find audit entries for an organization.
   */
  async findByOrganization(
    organizationId: string,
    limit = 100
  ): Promise<SecretAuditLog[]> {
    return db
      .select()
      .from(secretAuditLog)
      .where(eq(secretAuditLog.organization_id, organizationId))
      .orderBy(desc(secretAuditLog.created_at))
      .limit(limit);
  }

  /**
   * Find audit entries within a time range.
   */
  async findByTimeRange(
    organizationId: string,
    start: Date,
    end: Date,
    limit = 1000
  ): Promise<SecretAuditLog[]> {
    return db
      .select()
      .from(secretAuditLog)
      .where(
        and(
          eq(secretAuditLog.organization_id, organizationId),
          gte(secretAuditLog.created_at, start),
          lte(secretAuditLog.created_at, end)
        )
      )
      .orderBy(desc(secretAuditLog.created_at))
      .limit(limit);
  }

  /**
   * Find audit entries by actor.
   */
  async findByActor(
    actorType: string,
    actorId: string,
    limit = 100
  ): Promise<SecretAuditLog[]> {
    return db
      .select()
      .from(secretAuditLog)
      .where(
        and(
          eq(secretAuditLog.actor_type, actorType as "user" | "api_key" | "system" | "deployment" | "workflow"),
          eq(secretAuditLog.actor_id, actorId)
        )
      )
      .orderBy(desc(secretAuditLog.created_at))
      .limit(limit);
  }
}

// =============================================================================
// Exports
// =============================================================================

export const secretsRepository = new SecretsRepository();
export const oauthSessionsRepository = new OAuthSessionsRepository();
export const secretAuditLogRepository = new SecretAuditLogRepository();

// Re-export types
export type { Secret, NewSecret, OAuthSession, NewOAuthSession, SecretAuditLog, NewSecretAuditLog };

