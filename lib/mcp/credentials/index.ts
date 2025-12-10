/**
 * Credentials MCP Server
 *
 * Exposes secure credential management to AI agents via MCP protocol.
 * Supports text secrets (API keys) and OAuth platform credentials.
 */

import { z } from "zod";
import { platformCredentialsService, OAUTH_CONFIGS } from "@/lib/services/platform-credentials";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

// =============================================================================
// TYPES
// =============================================================================

export interface MCPContext {
  organizationId: string;
  userId: string;
  appId?: string;
}

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: Record<string, unknown>, context: MCPContext) => Promise<unknown>;
}

interface MCPResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

interface MCPServerDefinition {
  name: string;
  version: string;
  description: string;
  tools: MCPToolDefinition[];
  resources: MCPResourceDefinition[];
}

const AUDIT: AuditContext = { actorType: "system", actorId: "credentials-mcp", source: "mcp" };

// =============================================================================
// SCHEMAS
// =============================================================================

const PlatformSchema = z.enum(["discord", "twitter", "google", "gmail", "github", "slack", "telegram"]);

const CreateSecretSchema = z.object({
  name: z.string().min(1).max(255).describe("Secret name (e.g., OPENAI_API_KEY)"),
  value: z.string().min(1).describe("Secret value"),
  description: z.string().optional().describe("Optional description"),
});

const GetSecretSchema = z.object({
  name: z.string().describe("Secret name to retrieve"),
});

const DeleteSecretSchema = z.object({
  name: z.string().describe("Secret name to delete"),
});

const ListSecretsSchema = z.object({});

const RequestOAuthSchema = z.object({
  platform: PlatformSchema.describe("Platform to connect"),
  scopes: z.array(z.string()).optional().describe("Optional custom OAuth scopes"),
});

const GetCredentialSchema = z.object({
  platform: PlatformSchema.describe("Platform to get credential for"),
});

const GetTokenSchema = z.object({
  platform: PlatformSchema.describe("Platform to get access token for"),
});

const RevokeCredentialSchema = z.object({
  platform: PlatformSchema.describe("Platform to disconnect"),
});

const ListCredentialsSchema = z.object({
  platform: PlatformSchema.optional().describe("Filter by platform"),
});

// =============================================================================
// HANDLERS - Text Secrets
// =============================================================================

async function handleCreateSecret(params: z.infer<typeof CreateSecretSchema>, ctx: MCPContext) {
  const secret = await secretsService.create({
    organizationId: ctx.organizationId,
    name: params.name,
    value: params.value,
    description: params.description,
    scope: "organization",
    createdBy: ctx.userId,
  }, AUDIT);

  logger.info("[Credentials MCP] Secret created", { name: params.name, orgId: ctx.organizationId });
  return { success: true, secretId: secret.id, name: secret.name };
}

async function handleGetSecret(params: z.infer<typeof GetSecretSchema>, ctx: MCPContext) {
  const value = await secretsService.get(ctx.organizationId, params.name);
  if (!value) return { found: false, name: params.name };
  return { found: true, name: params.name, value };
}

async function handleDeleteSecret(params: z.infer<typeof DeleteSecretSchema>, ctx: MCPContext) {
  const secrets = await secretsService.list(ctx.organizationId);
  const secret = secrets.find(s => s.name === params.name);
  if (!secret) return { success: false, error: "Secret not found" };
  
  await secretsService.delete(secret.id, ctx.organizationId, AUDIT);
  logger.info("[Credentials MCP] Secret deleted", { name: params.name });
  return { success: true };
}

async function handleListSecrets(_params: z.infer<typeof ListSecretsSchema>, ctx: MCPContext) {
  const secrets = await secretsService.list(ctx.organizationId);
  return {
    secrets: secrets.map(s => ({
      name: s.name,
      description: s.description,
      createdAt: s.createdAt.toISOString(),
      lastAccessedAt: s.lastAccessedAt?.toISOString(),
    })),
  };
}

// =============================================================================
// HANDLERS - OAuth Credentials
// =============================================================================

async function handleRequestOAuth(params: z.infer<typeof RequestOAuthSchema>, ctx: MCPContext) {
  const config = OAUTH_CONFIGS[params.platform];
  if (!config) return { error: `Unsupported platform: ${params.platform}` };

  const result = await platformCredentialsService.createLinkSession({
    organizationId: ctx.organizationId,
    platform: params.platform,
    appId: ctx.appId,
    requestingUserId: ctx.userId,
    requestedScopes: params.scopes,
  });

  const cloudUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  
  return {
    sessionId: result.sessionId,
    authUrl: result.linkUrl,
    hostedUrl: `${cloudUrl}/auth/platform-link?session=${result.sessionId}`,
    expiresAt: result.expiresAt.toISOString(),
    instructions: `Direct user to this URL to authorize: ${cloudUrl}/auth/platform-link?session=${result.sessionId}`,
  };
}

async function handleGetCredential(params: z.infer<typeof GetCredentialSchema>, ctx: MCPContext) {
  const credentials = await platformCredentialsService.listCredentials(ctx.organizationId, {
    platform: params.platform,
    status: "active",
  });

  const cred = credentials[0];
  if (!cred) return { connected: false, platform: params.platform };

  return {
    connected: true,
    platform: cred.platform,
    platformUserId: cred.platform_user_id,
    platformUsername: cred.platform_username,
    platformDisplayName: cred.platform_display_name,
    status: cred.status,
    scopes: cred.scopes,
    linkedAt: cred.linked_at?.toISOString(),
  };
}

async function handleGetToken(params: z.infer<typeof GetTokenSchema>, ctx: MCPContext) {
  const credentials = await platformCredentialsService.listCredentials(ctx.organizationId, {
    platform: params.platform,
    status: "active",
  });

  const cred = credentials[0];
  if (!cred) return { error: `${params.platform} not connected` };

  const result = await platformCredentialsService.getCredentialWithTokens(cred.id, ctx.organizationId);
  if (!result) return { error: "Failed to retrieve tokens" };

  // Auto-refresh if expired
  if (result.credential.token_expires_at && result.credential.token_expires_at < new Date()) {
    const refreshed = await platformCredentialsService.refreshToken(cred.id, ctx.organizationId);
    if (!refreshed) return { error: "Token expired and refresh failed" };
    
    const fresh = await platformCredentialsService.getCredentialWithTokens(cred.id, ctx.organizationId);
    if (!fresh) return { error: "Failed to get refreshed token" };
    
    return {
      platform: params.platform,
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken,
      expiresAt: fresh.credential.token_expires_at?.toISOString(),
      refreshed: true,
    };
  }

  return {
    platform: params.platform,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.credential.token_expires_at?.toISOString(),
    refreshed: false,
  };
}

async function handleRevokeCredential(params: z.infer<typeof RevokeCredentialSchema>, ctx: MCPContext) {
  const credentials = await platformCredentialsService.listCredentials(ctx.organizationId, {
    platform: params.platform,
    status: "active",
  });

  const cred = credentials[0];
  if (!cred) return { success: false, error: `${params.platform} not connected` };

  await platformCredentialsService.revokeCredential(cred.id, ctx.organizationId);
  logger.info("[Credentials MCP] Credential revoked", { platform: params.platform });
  return { success: true };
}

async function handleListCredentials(params: z.infer<typeof ListCredentialsSchema>, ctx: MCPContext) {
  const credentials = await platformCredentialsService.listCredentials(ctx.organizationId, {
    platform: params.platform,
    status: "active",
  });

  return {
    credentials: credentials.map(c => ({
      platform: c.platform,
      platformUserId: c.platform_user_id,
      platformUsername: c.platform_username,
      platformDisplayName: c.platform_display_name,
      status: c.status,
      linkedAt: c.linked_at?.toISOString(),
    })),
  };
}

// =============================================================================
// MCP SERVER DEFINITION
// =============================================================================

export const credentialsMcpServer: MCPServerDefinition = {
  name: "credentials",
  version: "1.0.0",
  description: "Secure credential management for AI agents. Store text secrets (API keys) and connect OAuth platforms (Discord, Twitter, Google, etc.).",

  tools: [
    // Text Secrets
    {
      name: "store_secret",
      description: "Store a text secret (API key, token, password). Secrets are encrypted at rest.",
      inputSchema: CreateSecretSchema,
      handler: handleCreateSecret as MCPToolDefinition["handler"],
    },
    {
      name: "get_secret",
      description: "Retrieve a stored secret by name. Use for API keys and tokens.",
      inputSchema: GetSecretSchema,
      handler: handleGetSecret as MCPToolDefinition["handler"],
    },
    {
      name: "delete_secret",
      description: "Delete a stored secret.",
      inputSchema: DeleteSecretSchema,
      handler: handleDeleteSecret as MCPToolDefinition["handler"],
    },
    {
      name: "list_secrets",
      description: "List all stored secrets (names only, not values).",
      inputSchema: ListSecretsSchema,
      handler: handleListSecrets as MCPToolDefinition["handler"],
    },

    // OAuth Credentials
    {
      name: "request_oauth",
      description: "Request OAuth authorization for a platform. Returns a URL to send to the user for authorization.",
      inputSchema: RequestOAuthSchema,
      handler: handleRequestOAuth as MCPToolDefinition["handler"],
    },
    {
      name: "get_credential",
      description: "Check if a platform is connected and get credential info (not tokens).",
      inputSchema: GetCredentialSchema,
      handler: handleGetCredential as MCPToolDefinition["handler"],
    },
    {
      name: "get_platform_token",
      description: "Get the access token for a connected platform. Auto-refreshes if expired.",
      inputSchema: GetTokenSchema,
      handler: handleGetToken as MCPToolDefinition["handler"],
    },
    {
      name: "revoke_credential",
      description: "Disconnect a platform and revoke its credentials.",
      inputSchema: RevokeCredentialSchema,
      handler: handleRevokeCredential as MCPToolDefinition["handler"],
    },
    {
      name: "list_credentials",
      description: "List all connected platform credentials.",
      inputSchema: ListCredentialsSchema,
      handler: handleListCredentials as MCPToolDefinition["handler"],
    },
  ],

  resources: [
    {
      uri: "credentials://secrets",
      name: "Stored Secrets",
      description: "List of stored text secrets",
      mimeType: "application/json",
    },
    {
      uri: "credentials://platforms",
      name: "Connected Platforms",
      description: "List of connected OAuth platforms",
      mimeType: "application/json",
    },
    {
      uri: "credentials://platforms/available",
      name: "Available Platforms",
      description: "List of platforms available for OAuth connection",
      mimeType: "application/json",
    },
  ],
};

// Resource handlers
export async function handleCredentialsResource(uri: string, ctx: MCPContext) {
  if (uri === "credentials://secrets") {
    const secrets = await secretsService.list(ctx.organizationId);
    return { secrets: secrets.map(s => ({ name: s.name, description: s.description })) };
  }
  if (uri === "credentials://platforms") {
    const creds = await platformCredentialsService.listCredentials(ctx.organizationId, { status: "active" });
    return { platforms: creds.map(c => ({ platform: c.platform, username: c.platform_username })) };
  }
  if (uri === "credentials://platforms/available") {
    return { platforms: Object.keys(OAUTH_CONFIGS) };
  }
  return null;
}

