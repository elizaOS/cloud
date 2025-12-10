/**
 * Secrets Service
 *
 * Unified service for managing encrypted secrets across the platform.
 * Provides CRUD operations with automatic encryption/decryption and audit logging.
 */

import {
  secretsRepository,
  oauthSessionsRepository,
  secretAuditLogRepository,
  type Secret,
  type OAuthSession,
  type FindSecretsParams,
} from "@/db/repositories/secrets";
import {
  getEncryptionService,
  type SecretsEncryptionService,
} from "./encryption";
import type {
  SecretScope,
  SecretEnvironment,
  SecretAuditAction,
  SecretActorType,
} from "@/db/schemas/secrets";

// =============================================================================
// Types
// =============================================================================

export interface CreateSecretParams {
  organizationId: string;
  name: string;
  value: string;
  scope?: SecretScope;
  projectId?: string;
  projectType?: string;
  environment?: SecretEnvironment;
  description?: string;
  expiresAt?: Date;
  createdBy: string;
}

export interface UpdateSecretParams {
  value?: string;
  description?: string;
  expiresAt?: Date | null;
}

export interface GetSecretsParams {
  organizationId: string;
  projectId?: string;
  environment?: SecretEnvironment;
  names?: string[];
}

export interface AuditContext {
  actorType: SecretActorType;
  actorId: string;
  actorEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  source?: string;
  requestId?: string;
  endpoint?: string;
}

export interface SecretMetadata {
  id: string;
  name: string;
  description: string | null;
  scope: "organization" | "project" | "environment";
  projectId: string | null;
  projectType: string | null;
  environment: "development" | "preview" | "production" | null;
  version: number;
  expiresAt: Date | null;
  lastRotatedAt: Date | null;
  lastAccessedAt: Date | null;
  accessCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Service Implementation
// =============================================================================

class SecretsService {
  private encryption: SecretsEncryptionService;

  constructor(encryption?: SecretsEncryptionService) {
    this.encryption = encryption || getEncryptionService();
  }

  /**
   * Check if secrets service is properly configured.
   */
  isConfigured(): boolean {
    return this.encryption.isConfigured();
  }

  // ===========================================================================
  // Secret CRUD Operations
  // ===========================================================================

  /**
   * Create a new secret.
   */
  async create(params: CreateSecretParams, audit: AuditContext): Promise<SecretMetadata> {
    const {
      organizationId,
      name,
      value,
      scope = "organization",
      projectId,
      projectType,
      environment,
      description,
      expiresAt,
      createdBy,
    } = params;

    // Check if secret already exists
    const existing = await secretsRepository.findByName(
      organizationId,
      name,
      projectId,
      environment
    );

    if (existing) {
      throw new Error(
        `Secret '${name}' already exists in this context. Use update or rotate instead.`
      );
    }

    // Encrypt the value
    const { encryptedValue, encryptedDek, nonce, authTag, keyId } =
      await this.encryption.encrypt(value);

    // Create the secret
    const secret = await secretsRepository.create({
      organization_id: organizationId,
      name,
      scope,
      project_id: projectId,
      project_type: projectType,
      environment,
      description,
      encrypted_value: encryptedValue,
      encryption_key_id: keyId,
      encrypted_dek: encryptedDek,
      nonce,
      auth_tag: authTag,
      expires_at: expiresAt,
      created_by: createdBy,
    });

    await this.logAudit(secret.id, organizationId, "created", name, audit);
    return this.toMetadata(secret);
  }

  /**
   * Get a single decrypted secret by name.
   */
  async get(
    organizationId: string,
    name: string,
    projectId?: string,
    environment?: SecretEnvironment,
    audit?: AuditContext
  ): Promise<string | null> {
    const secret = await secretsRepository.findByName(
      organizationId,
      name,
      projectId,
      environment
    );

    if (!secret) return null;

    // Decrypt
    const value = await this.encryption.decrypt({
      encryptedValue: secret.encrypted_value,
      encryptedDek: secret.encrypted_dek,
      nonce: secret.nonce,
      authTag: secret.auth_tag,
    });

    // Record access
    await secretsRepository.recordAccess(secret.id);

    // Audit log (if context provided)
    if (audit) {
      await this.logAudit(secret.id, organizationId, "read", name, audit);
    }

    return value;
  }

  /**
   * Get a decrypted secret by its ID.
   * Convenience method for when you have the secret ID stored as a reference.
   */
  async getDecryptedValue(
    secretId: string,
    organizationId: string,
    audit?: AuditContext
  ): Promise<string> {
    const secret = await secretsRepository.findById(secretId);

    if (!secret || secret.organization_id !== organizationId) {
      throw new Error("Secret not found");
    }

    const value = await this.encryption.decrypt({
      encryptedValue: secret.encrypted_value,
      encryptedDek: secret.encrypted_dek,
      nonce: secret.nonce,
      authTag: secret.auth_tag,
    });

    await secretsRepository.recordAccess(secretId);

    if (audit) {
      await this.logAudit(secretId, organizationId, "read", secret.name, audit);
    }

    return value;
  }

  /**
   * Get multiple decrypted secrets for a context.
   * Returns a map of name -> value.
   */
  async getDecrypted(
    params: GetSecretsParams,
    audit?: AuditContext
  ): Promise<Record<string, string>> {
    const secrets = await secretsRepository.findByContext({
      organizationId: params.organizationId,
      projectId: params.projectId,
      environment: params.environment,
      names: params.names,
    });

    const result: Record<string, string> = {};

    for (const secret of secrets) {
      const value = await this.encryption.decrypt({
        encryptedValue: secret.encrypted_value,
        encryptedDek: secret.encrypted_dek,
        nonce: secret.nonce,
        authTag: secret.auth_tag,
      });

      result[secret.name] = value;
      await secretsRepository.recordAccess(secret.id);

      if (audit) {
        await this.logAudit(secret.id, params.organizationId, "read", secret.name, audit);
      }
    }

    return result;
  }

  /**
   * List secrets (metadata only, no values).
   */
  async list(organizationId: string): Promise<SecretMetadata[]> {
    const secrets = await secretsRepository.listByOrganization(organizationId);
    return secrets.map(this.toMetadata);
  }

  /**
   * List secrets for a specific project.
   */
  async listByProject(projectId: string): Promise<SecretMetadata[]> {
    const secrets = await secretsRepository.listByProject(projectId);
    return secrets.map(this.toMetadata);
  }

  /**
   * Update a secret's value.
   */
  async update(
    secretId: string,
    organizationId: string,
    params: UpdateSecretParams,
    audit: AuditContext
  ): Promise<SecretMetadata> {
    const existing = await secretsRepository.findById(secretId);
    if (!existing || existing.organization_id !== organizationId) {
      throw new Error("Secret not found");
    }

    const updateData: Record<string, unknown> = {};

    if (params.value !== undefined) {
      // Encrypt new value
      const { encryptedValue, encryptedDek, nonce, authTag, keyId } =
        await this.encryption.encrypt(params.value);

      updateData.encrypted_value = encryptedValue;
      updateData.encrypted_dek = encryptedDek;
      updateData.nonce = nonce;
      updateData.auth_tag = authTag;
      updateData.encryption_key_id = keyId;
      updateData.version = existing.version + 1;
    }

    if (params.description !== undefined) {
      updateData.description = params.description;
    }

    if (params.expiresAt !== undefined) {
      updateData.expires_at = params.expiresAt;
    }

    const updated = await secretsRepository.update(secretId, updateData as Partial<Secret>);
    if (!updated) {
      throw new Error("Failed to update secret");
    }

    await this.logAudit(secretId, organizationId, "updated", existing.name, audit);
    return this.toMetadata(updated);
  }

  /**
   * Rotate a secret (update value with new encryption).
   */
  async rotate(
    secretId: string,
    organizationId: string,
    newValue: string,
    audit: AuditContext
  ): Promise<SecretMetadata> {
    const existing = await secretsRepository.findById(secretId);
    if (!existing || existing.organization_id !== organizationId) {
      throw new Error("Secret not found");
    }

    // Encrypt new value with fresh DEK
    const { encryptedValue, encryptedDek, nonce, authTag, keyId } =
      await this.encryption.encrypt(newValue);

    const updated = await secretsRepository.update(secretId, {
      encrypted_value: encryptedValue,
      encrypted_dek: encryptedDek,
      nonce,
      auth_tag: authTag,
      encryption_key_id: keyId,
      version: existing.version + 1,
      last_rotated_at: new Date(),
    });

    if (!updated) {
      throw new Error("Failed to rotate secret");
    }

    await this.logAudit(secretId, organizationId, "rotated", existing.name, audit);
    return this.toMetadata(updated);
  }

  /**
   * Delete a secret.
   */
  async delete(
    secretId: string,
    organizationId: string,
    audit: AuditContext
  ): Promise<void> {
    const existing = await secretsRepository.findById(secretId);
    if (!existing || existing.organization_id !== organizationId) {
      throw new Error("Secret not found");
    }

    const deleted = await secretsRepository.delete(secretId);
    if (!deleted) {
      throw new Error("Failed to delete secret");
    }

    await this.logAudit(secretId, organizationId, "deleted", existing.name, audit);
  }

  // ===========================================================================
  // OAuth Session Operations
  // ===========================================================================

  /**
   * Store OAuth tokens for a provider.
   */
  async storeOAuthTokens(params: {
    organizationId: string;
    userId?: string;
    provider: string;
    providerAccountId?: string;
    accessToken: string;
    refreshToken?: string;
    tokenType?: string;
    scopes?: string[];
    accessTokenExpiresAt?: Date;
    refreshTokenExpiresAt?: Date;
    providerData?: Record<string, unknown>;
  }): Promise<OAuthSession> {
    const {
      organizationId,
      userId,
      provider,
      providerAccountId,
      accessToken,
      refreshToken,
      tokenType = "Bearer",
      scopes = [],
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
      providerData,
    } = params;

    // Encrypt access token
    const {
      encryptedValue: encryptedAccessToken,
      encryptedDek,
      nonce,
      authTag,
      keyId,
    } = await this.encryption.encrypt(accessToken);

    // Encrypt refresh token if provided (with separate DEK for security)
    let encryptedRefreshToken: string | undefined;
    let refreshEncryptedDek: string | undefined;
    let refreshNonce: string | undefined;
    let refreshAuthTag: string | undefined;
    if (refreshToken) {
      const refreshResult = await this.encryption.encrypt(refreshToken);
      encryptedRefreshToken = refreshResult.encryptedValue;
      refreshEncryptedDek = refreshResult.encryptedDek;
      refreshNonce = refreshResult.nonce;
      refreshAuthTag = refreshResult.authTag;
    }

    // Encrypt provider data if provided
    let encryptedProviderData: string | undefined;
    let providerDataNonce: string | undefined;
    let providerDataAuthTag: string | undefined;
    if (providerData) {
      const dataResult = await this.encryption.encrypt(JSON.stringify(providerData));
      encryptedProviderData = dataResult.encryptedValue;
      providerDataNonce = dataResult.nonce;
      providerDataAuthTag = dataResult.authTag;
    }

    // Check for existing session
    const existing = await oauthSessionsRepository.findByOrgAndProvider(
      organizationId,
      provider,
      userId
    );

    if (existing) {
      // Update existing session
      const updated = await oauthSessionsRepository.update(existing.id, {
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: encryptedRefreshToken,
        encryption_key_id: keyId,
        encrypted_dek: encryptedDek,
        nonce,
        auth_tag: authTag,
        refresh_encrypted_dek: refreshEncryptedDek,
        refresh_nonce: refreshNonce,
        refresh_auth_tag: refreshAuthTag,
        token_type: tokenType,
        scopes,
        access_token_expires_at: accessTokenExpiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
        encrypted_provider_data: encryptedProviderData,
        provider_data_nonce: providerDataNonce,
        provider_data_auth_tag: providerDataAuthTag,
        is_valid: true,
        revoked_at: null,
        revoke_reason: null,
      });

      if (!updated) {
        throw new Error("Failed to update OAuth session");
      }
      return updated;
    }

    // Create new session
    const session = await oauthSessionsRepository.create({
      organization_id: organizationId,
      user_id: userId,
      provider,
      provider_account_id: providerAccountId,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      token_type: tokenType,
      encryption_key_id: keyId,
      encrypted_dek: encryptedDek,
      nonce,
      auth_tag: authTag,
      refresh_encrypted_dek: refreshEncryptedDek,
      refresh_nonce: refreshNonce,
      refresh_auth_tag: refreshAuthTag,
      scopes,
      access_token_expires_at: accessTokenExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      encrypted_provider_data: encryptedProviderData,
      provider_data_nonce: providerDataNonce,
      provider_data_auth_tag: providerDataAuthTag,
    });

    return session;
  }

  /**
   * Get decrypted OAuth tokens.
   */
  async getOAuthTokens(
    organizationId: string,
    provider: string,
    userId?: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    tokenType: string;
    scopes: string[];
    isExpired: boolean;
    expiresAt?: Date;
  } | null> {
    const session = await oauthSessionsRepository.findByOrgAndProvider(
      organizationId,
      provider,
      userId
    );

    if (!session) return null;

    // Decrypt access token
    const accessToken = await this.encryption.decrypt({
      encryptedValue: session.encrypted_access_token,
      encryptedDek: session.encrypted_dek,
      nonce: session.nonce,
      authTag: session.auth_tag,
    });

    // Decrypt refresh token if present (uses separate encryption metadata)
    let refreshToken: string | undefined;
    if (
      session.encrypted_refresh_token &&
      session.refresh_encrypted_dek &&
      session.refresh_nonce &&
      session.refresh_auth_tag
    ) {
      refreshToken = await this.encryption.decrypt({
        encryptedValue: session.encrypted_refresh_token,
        encryptedDek: session.refresh_encrypted_dek,
        nonce: session.refresh_nonce,
        authTag: session.refresh_auth_tag,
      });
    }

    const isExpired = session.access_token_expires_at
      ? new Date() > session.access_token_expires_at
      : false;

    await oauthSessionsRepository.recordUsage(session.id);

    return {
      accessToken,
      refreshToken,
      tokenType: session.token_type || "Bearer",
      scopes: session.scopes,
      isExpired,
      expiresAt: session.access_token_expires_at || undefined,
    };
  }

  /**
   * List OAuth connections for an organization (metadata only).
   */
  async listOAuthConnections(
    organizationId: string
  ): Promise<
    Array<{
      id: string;
      provider: string;
      providerAccountId: string | null;
      scopes: string[];
      isValid: boolean;
      expiresAt: Date | null;
      lastUsedAt: Date | null;
      createdAt: Date;
    }>
  > {
    const sessions = await oauthSessionsRepository.listByOrganization(organizationId);
    return sessions.map((s) => ({
      id: s.id,
      provider: s.provider,
      providerAccountId: s.provider_account_id,
      scopes: s.scopes,
      isValid: s.is_valid,
      expiresAt: s.access_token_expires_at,
      lastUsedAt: s.last_used_at,
      createdAt: s.created_at,
    }));
  }

  /**
   * Revoke an OAuth connection.
   */
  async revokeOAuthConnection(
    sessionId: string,
    organizationId: string,
    reason: string
  ): Promise<void> {
    const session = await oauthSessionsRepository.findById(sessionId);
    if (!session || session.organization_id !== organizationId) {
      throw new Error("OAuth session not found");
    }

    await oauthSessionsRepository.revoke(sessionId, reason);
  }

  // ===========================================================================
  // Audit Operations
  // ===========================================================================

  /**
   * Get audit log for a secret.
   */
  async getSecretAuditLog(secretId: string, limit = 100) {
    return secretAuditLogRepository.findBySecret(secretId, limit);
  }

  /**
   * Get audit log for an organization.
   */
  async getOrganizationAuditLog(organizationId: string, limit = 100) {
    return secretAuditLogRepository.findByOrganization(organizationId, limit);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async logAudit(
    secretId: string,
    organizationId: string,
    action: SecretAuditAction,
    secretName: string,
    context: AuditContext
  ): Promise<void> {
    await secretAuditLogRepository.create({
      secret_id: secretId,
      organization_id: organizationId,
      action,
      secret_name: secretName,
      actor_type: context.actorType,
      actor_id: context.actorId,
      actor_email: context.actorEmail,
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
      source: context.source,
      request_id: context.requestId,
      endpoint: context.endpoint,
    });
  }

  private toMetadata(secret: Secret): SecretMetadata {
    return {
      id: secret.id,
      name: secret.name,
      description: secret.description,
      scope: secret.scope,
      projectId: secret.project_id,
      projectType: secret.project_type,
      environment: secret.environment,
      version: secret.version,
      expiresAt: secret.expires_at,
      lastRotatedAt: secret.last_rotated_at,
      lastAccessedAt: secret.last_accessed_at,
      accessCount: secret.access_count,
      createdAt: secret.created_at,
      updatedAt: secret.updated_at,
    };
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let secretsServiceInstance: SecretsService | null = null;

export function getSecretsService(): SecretsService {
  if (!secretsServiceInstance) {
    secretsServiceInstance = new SecretsService();
  }
  return secretsServiceInstance;
}

// For backwards compatibility
export const secretsService = {
  get isConfigured() {
    return getSecretsService().isConfigured();
  },
  create: (params: CreateSecretParams, audit: AuditContext) =>
    getSecretsService().create(params, audit),
  get: (
    organizationId: string,
    name: string,
    projectId?: string,
    environment?: SecretEnvironment,
    audit?: AuditContext
  ) => getSecretsService().get(organizationId, name, projectId, environment, audit),
  getDecryptedValue: (
    secretId: string,
    organizationId: string,
    audit?: AuditContext
  ) => getSecretsService().getDecryptedValue(secretId, organizationId, audit),
  getDecrypted: (params: GetSecretsParams, audit?: AuditContext) =>
    getSecretsService().getDecrypted(params, audit),
  list: (organizationId: string) => getSecretsService().list(organizationId),
  listByProject: (projectId: string) => getSecretsService().listByProject(projectId),
  update: (
    secretId: string,
    organizationId: string,
    params: UpdateSecretParams,
    audit: AuditContext
  ) => getSecretsService().update(secretId, organizationId, params, audit),
  rotate: (
    secretId: string,
    organizationId: string,
    newValue: string,
    audit: AuditContext
  ) => getSecretsService().rotate(secretId, organizationId, newValue, audit),
  delete: (secretId: string, organizationId: string, audit: AuditContext) =>
    getSecretsService().delete(secretId, organizationId, audit),
  storeOAuthTokens: (params: Parameters<SecretsService["storeOAuthTokens"]>[0]) =>
    getSecretsService().storeOAuthTokens(params),
  getOAuthTokens: (organizationId: string, provider: string, userId?: string) =>
    getSecretsService().getOAuthTokens(organizationId, provider, userId),
  listOAuthConnections: (organizationId: string) =>
    getSecretsService().listOAuthConnections(organizationId),
  revokeOAuthConnection: (sessionId: string, organizationId: string, reason: string) =>
    getSecretsService().revokeOAuthConnection(sessionId, organizationId, reason),
  getSecretAuditLog: (secretId: string, limit?: number) =>
    getSecretsService().getSecretAuditLog(secretId, limit),
  getOrganizationAuditLog: (organizationId: string, limit?: number) =>
    getSecretsService().getOrganizationAuditLog(organizationId, limit),
};

// Export class for testing
export { SecretsService };

