/**
 * Generic OAuth 2.0 Flow Handler
 *
 * Handles OAuth 2.0 authorization flow for any provider configured in the registry.
 * Works with standard OAuth 2.0 and supports provider-specific variations via config.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { dbWrite } from "@/db/client";
import { writeTransaction } from "@/db/helpers";
import { platformCredentials, platformCredentialTypeEnum } from "@/db/schemas/platform-credentials";
import { cache } from "@/lib/cache/client";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import type { OAuthProviderConfig, UserInfoMapping } from "../provider-registry";
import { getCallbackUrl, getClientId, getClientSecret, getNestedValue } from "../provider-registry";

const STATE_TTL_SECONDS = 600; // 10 minutes

/**
 * OAuth state stored in cache during authorization flow.
 */
interface OAuth2State {
  organizationId: string;
  userId: string;
  providerId: string;
  redirectUrl: string;
  scopes: string[];
  createdAt: number;
  codeVerifier?: string;
}

/**
 * Generate PKCE code verifier and challenge.
 * Uses S256 challenge method per RFC 7636.
 */
async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  // Generate 32 random bytes → 43-char base64url string
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = Buffer.from(bytes).toString("base64url");

  // SHA-256 hash of verifier → base64url encoded
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = Buffer.from(digest).toString("base64url");

  return { codeVerifier, codeChallenge };
}

/**
 * Standard OAuth 2.0 token response fields.
 */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  [key: string]: unknown;
}

/**
 * User info extracted from provider response.
 */
interface ExtractedUserInfo {
  id: string;
  email?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

/**
 * Result of initiating OAuth flow.
 */
export interface InitiateOAuth2Result {
  authUrl: string;
  state: string;
}

/**
 * Result of handling OAuth callback.
 */
export interface OAuth2CallbackResult {
  connectionId: string;
  organizationId: string;
  userId: string;
  platformUserId: string;
  email?: string;
  displayName?: string;
  redirectUrl: string;
}

/**
 * Initiate OAuth 2.0 authorization flow.
 *
 * Builds authorization URL from provider config and stores state for callback verification.
 */
export async function initiateOAuth2(
  provider: OAuthProviderConfig,
  params: {
    organizationId: string;
    userId: string;
    redirectUrl?: string;
    scopes?: string[];
  },
): Promise<InitiateOAuth2Result> {
  const clientId = getClientId(provider);
  if (!clientId) {
    throw new Error(`OAuth not configured: missing client ID for ${provider.id}`);
  }

  if (!provider.endpoints?.authorization) {
    throw new Error(`OAuth not configured: missing authorization endpoint for ${provider.id}`);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cloud.milady.ai";
  const callbackUrl = getCallbackUrl(provider, baseUrl);
  const scopes = params.scopes || provider.defaultScopes || [];
  const redirectUrl = params.redirectUrl || "/auth/success";

  // Generate cryptographically secure state
  const state = crypto.randomUUID();

  // Generate PKCE if required by provider
  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;
  if (provider.pkce) {
    const pkce = await generatePKCE();
    codeVerifier = pkce.codeVerifier;
    codeChallenge = pkce.codeChallenge;
  }

  // Store state for callback verification
  const stateData: OAuth2State = {
    organizationId: params.organizationId,
    userId: params.userId,
    providerId: provider.id,
    redirectUrl,
    scopes,
    createdAt: Date.now(),
    codeVerifier,
  };

  await cache.set(`oauth2:${provider.id}:${state}`, stateData, STATE_TTL_SECONDS);

  // Build authorization URL
  const authUrl = new URL(provider.endpoints.authorization);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("response_type", "code");

  if (scopes.length > 0) {
    authUrl.searchParams.set("scope", scopes.join(" "));
  }

  authUrl.searchParams.set("state", state);

  // Add PKCE parameters
  if (codeChallenge) {
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
  }

  // Add provider-specific authorization parameters
  if (provider.authParams) {
    for (const [key, value] of Object.entries(provider.authParams)) {
      authUrl.searchParams.set(key, value);
    }
  }

  logger.info(`[OAuth2] Initiated auth for ${provider.id}`, {
    organizationId: params.organizationId,
    scopes: scopes.length,
    state: state.substring(0, 8) + "...",
  });

  return {
    authUrl: authUrl.toString(),
    state,
  };
}

/**
 * Handle OAuth 2.0 callback.
 *
 * Validates state, exchanges code for tokens, fetches user info, and stores connection.
 */
export async function handleOAuth2Callback(
  provider: OAuthProviderConfig,
  code: string,
  state: string,
): Promise<OAuth2CallbackResult> {
  // Validate state
  const stateKey = `oauth2:${provider.id}:${state}`;
  const stateData = await cache.get<OAuth2State>(stateKey);

  if (!stateData) {
    throw new Error("Invalid or expired OAuth state");
  }

  if (stateData.providerId !== provider.id) {
    throw new Error("OAuth state provider mismatch");
  }

  // Delete state to prevent replay attacks
  await cache.del(stateKey);

  const { organizationId, userId, redirectUrl, scopes, codeVerifier } = stateData;

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(provider, code, codeVerifier);

  // Fetch user info: userInfo endpoint, token metadata endpoint, or from token response
  let userInfo: ExtractedUserInfo;
  if (provider.endpoints?.userInfo) {
    userInfo = await fetchUserInfo(provider, tokens.access_token);
  } else if (provider.endpoints?.tokenInfo) {
    userInfo = await fetchTokenInfo(provider, tokens.access_token);
  } else {
    userInfo = extractUserInfoFromTokens(provider, tokens);
  }

  // Store connection
  const connectionId = await storeConnection(
    provider,
    organizationId,
    userId,
    tokens,
    userInfo,
    scopes,
  );

  logger.info(`[OAuth2] Callback completed for ${provider.id}`, {
    organizationId,
    connectionId,
    platformUserId: userInfo.id,
  });

  return {
    connectionId,
    organizationId,
    userId,
    platformUserId: userInfo.id,
    email: userInfo.email,
    displayName: userInfo.displayName,
    redirectUrl,
  };
}

/**
 * Exchange authorization code for access and refresh tokens.
 */
async function exchangeCodeForTokens(
  provider: OAuthProviderConfig,
  code: string,
  codeVerifier?: string,
): Promise<TokenResponse> {
  const clientId = getClientId(provider);
  const clientSecret = getClientSecret(provider);

  if (!clientId || !clientSecret) {
    throw new Error(`OAuth not configured: missing credentials for ${provider.id}`);
  }

  if (!provider.endpoints?.token) {
    throw new Error(`OAuth not configured: missing token endpoint for ${provider.id}`);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cloud.milady.ai";
  const callbackUrl = getCallbackUrl(provider, baseUrl);

  // Build token request body
  const bodyParams: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_id: clientId,
    client_secret: clientSecret,
    ...provider.tokenParams,
  };

  // Include PKCE code_verifier if present
  if (codeVerifier) {
    bodyParams.code_verifier = codeVerifier;
  }

  // Build headers
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  // Handle special header configurations
  if (provider.tokenHeaders) {
    for (const [key, value] of Object.entries(provider.tokenHeaders)) {
      if (value === "Basic ${base64(CLIENT_ID:CLIENT_SECRET)}") {
        // Special placeholder for Basic auth
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        headers[key] = `Basic ${credentials}`;
        // Remove client credentials from body when using Basic auth
        delete bodyParams.client_id;
        delete bodyParams.client_secret;
      } else {
        headers[key] = value;
      }
    }
  }

  // Determine content type and body format
  let body: string;
  if (provider.tokenContentType === "json") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(bodyParams);
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(bodyParams).toString();
  }

  const response = await fetch(provider.endpoints.token, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`[OAuth2] Token exchange failed for ${provider.id}`, {
      status: response.status,
      error: errorText.substring(0, 500),
    });
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = await response.json();

  // Map non-standard field names if configured
  const tokenMapping = provider.tokenMapping;
  const tokens: TokenResponse = {
    access_token: data[tokenMapping?.accessToken || "access_token"],
    refresh_token: data[tokenMapping?.refreshToken || "refresh_token"],
    expires_in: data[tokenMapping?.expiresIn || "expires_in"],
    token_type: data[tokenMapping?.tokenType || "token_type"],
    scope: data[tokenMapping?.scope || "scope"],
    ...data,
  };

  if (!tokens.access_token) {
    throw new Error("Token exchange did not return access_token");
  }

  return tokens;
}

/**
 * Fetch user info from provider's user info endpoint.
 */
async function fetchUserInfo(
  provider: OAuthProviderConfig,
  accessToken: string,
): Promise<ExtractedUserInfo> {
  if (!provider.endpoints?.userInfo) {
    throw new Error(`No userInfo endpoint configured for ${provider.id}`);
  }

  // Handle GraphQL endpoints (e.g., Linear) - requires userInfoGraphQLQuery in config
  const graphqlQuery = provider.endpoints.userInfoGraphQLQuery;
  const userInfoMethod = provider.endpoints.userInfoMethod || "GET";

  let response: Response;
  if (graphqlQuery) {
    response = await fetch(provider.endpoints.userInfo, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query: graphqlQuery }),
    });
  } else if (userInfoMethod === "POST") {
    // Some providers (e.g., Dropbox) require POST for user info
    response = await fetch(provider.endpoints.userInfo, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } else {
    response = await fetch(provider.endpoints.userInfo, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`[OAuth2] User info fetch failed for ${provider.id}`, {
      status: response.status,
      error: errorText.substring(0, 500),
    });
    throw new Error(`User info fetch failed: ${response.status}`);
  }

  const data = await response.json();

  // Check for GraphQL errors (GraphQL APIs return 200 even on errors)
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    const errorMessage = data.errors.map((e: { message?: string }) => e.message).join(", ");
    logger.error(`[OAuth2] GraphQL error for ${provider.id}`, { errors: data.errors });
    throw new Error(`GraphQL error: ${errorMessage}`);
  }

  return extractUserInfo(provider.userInfoMapping, data);
}

/**
 * Fetch user info from provider's token metadata endpoint.
 * Used by providers like HubSpot where the token exchange does not return user/hub_id.
 */
async function fetchTokenInfo(
  provider: OAuthProviderConfig,
  accessToken: string
): Promise<ExtractedUserInfo> {
  const baseUrl = provider.endpoints?.tokenInfo;
  if (!baseUrl) {
    throw new Error(`No tokenInfo endpoint configured for ${provider.id}`);
  }
  const url = `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(accessToken)}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`[OAuth2] Token info fetch failed for ${provider.id}`, {
      status: response.status,
      error: errorText.substring(0, 500),
    });
    throw new Error(`Token info fetch failed: ${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  return extractUserInfo(provider.userInfoMapping, data);
}

/**
 * Extract user info from token response when no userInfo endpoint.
 * Used by providers like Notion that include user info in token response.
 */
function extractUserInfoFromTokens(
  provider: OAuthProviderConfig,
  tokens: TokenResponse,
): ExtractedUserInfo {
  // Providers like Notion include user info in token response
  const mapping = provider.userInfoMapping;
  if (mapping) {
    return extractUserInfo(mapping, tokens);
  }

  // FALLBACK: No userInfo endpoint AND no userInfoMapping configured.
  // Generate pseudo-ID from token hash. This is a degraded state - connections
  // created this way won't have email, username, etc.
  logger.warn(
    `[OAuth2] No userInfo endpoint or mapping for ${provider.id}, using token hash as ID`,
    {
      providerId: provider.id,
      hasUserInfoEndpoint: !!provider.endpoints?.userInfo,
      hasUserInfoMapping: !!provider.userInfoMapping,
    },
  );
  const hash = Buffer.from(tokens.access_token.substring(0, 32)).toString("base64url");
  return {
    id: `${provider.id}_${hash}`,
    raw: tokens,
  };
}

/**
 * Extract user info using the provider's mapping configuration.
 */
function extractUserInfo(mapping: UserInfoMapping | undefined, data: unknown): ExtractedUserInfo {
  if (!mapping) {
    // Default mapping for standard OAuth2 claims
    const obj = data as Record<string, unknown>;
    return {
      id: String(obj.id || obj.sub || "unknown"),
      email: obj.email as string | undefined,
      username: obj.username as string | undefined,
      displayName: (obj.name || obj.display_name) as string | undefined,
      avatarUrl: (obj.picture || obj.avatar_url || obj.avatar) as string | undefined,
      raw: obj,
    };
  }

  const id = getNestedValue(data, mapping.id);
  if (!id) {
    throw new Error("Could not extract user ID from provider response");
  }

  return {
    id: String(id),
    email: mapping.email ? (getNestedValue(data, mapping.email) as string) : undefined,
    username: mapping.username ? (getNestedValue(data, mapping.username) as string) : undefined,
    displayName: mapping.displayName
      ? (getNestedValue(data, mapping.displayName) as string)
      : undefined,
    avatarUrl: mapping.avatarUrl ? (getNestedValue(data, mapping.avatarUrl) as string) : undefined,
    raw: data as Record<string, unknown>,
  };
}

/**
 * Create a secret, or rotate it if one with the same name already exists.
 * Handles orphaned secrets from failed previous OAuth attempts.
 */
async function createOrRotateSecret(
  organizationId: string,
  name: string,
  value: string,
  userId: string,
  audit: { actorType: "user"; actorId: string; source: string },
  newlyCreatedSecretIds: string[],
): Promise<{ id: string }> {
  try {
    const secret = await secretsService.create(
      {
        organizationId,
        name,
        value,
        scope: "organization",
        createdBy: userId,
      },
      audit,
    );
    newlyCreatedSecretIds.push(secret.id);
    return secret;
  } catch (error) {
    // If secret already exists (orphaned from previous failed attempt), find and rotate it
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (
      errorMsg.includes("already exists") ||
      errorMsg.includes("duplicate") ||
      errorMsg.includes("unique constraint")
    ) {
      logger.info(`[OAuth2] Secret "${name}" already exists, attempting to rotate`, {
        organizationId,
      });
      // Find the existing secret by listing and filtering
      const allSecrets = await secretsService.list(organizationId);
      const existingSecret = allSecrets.find((s) => s.name === name);
      if (existingSecret) {
        await secretsService.rotate(existingSecret.id, organizationId, value, audit);
        return { id: existingSecret.id };
      }
    }
    throw error;
  }
}

/**
 * Store OAuth connection in database.
 */
async function storeConnection(
  provider: OAuthProviderConfig,
  organizationId: string,
  userId: string,
  tokens: TokenResponse,
  userInfo: ExtractedUserInfo,
  scopes: string[],
): Promise<string> {
  const audit = {
    actorType: "user" as const,
    actorId: userId,
    source: `oauth2-${provider.id}-callback`,
  };

  // Track newly created secrets for cleanup on failure
  const newlyCreatedSecretIds: string[] = [];

  const providerPlatform = provider.id as (typeof platformCredentialTypeEnum.enumValues)[number];
  const cleanupNewlyCreatedSecrets = async (context: string) => {
    if (newlyCreatedSecretIds.length === 0) return;
    logger.warn(
      `[OAuth2] ${context}, cleaning up ${newlyCreatedSecretIds.length} newly created secret(s)`,
      {
        providerId: provider.id,
        organizationId,
      },
    );
    for (const secretId of newlyCreatedSecretIds) {
      try {
        await secretsService.delete(secretId, organizationId, audit);
      } catch (cleanupError) {
        logger.error(`[OAuth2] Failed to cleanup secret ${secretId}`, {
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    }
  };

  const revokeConnectionsDb = async (
    connections: Array<{
      id: string;
      organization_id: string;
      platform_user_id: string;
      access_token_secret_id: string | null;
      refresh_token_secret_id: string | null;
    }>,
    reason: string,
    db = dbWrite,
  ) => {
    if (connections.length === 0) return;

    await db
      .update(platformCredentials)
      .set({
        status: "revoked",
        revoked_at: new Date(),
        updated_at: new Date(),
        user_id: null,
        error_message: reason,
        access_token_secret_id: null,
        refresh_token_secret_id: null,
      })
      .where(
        inArray(
          platformCredentials.id,
          connections.map((c) => c.id),
        ),
      );
  };

  const revokeConnectionsSecrets = async (
    connections: Array<{
      id: string;
      organization_id: string;
      platform_user_id: string;
      access_token_secret_id: string | null;
      refresh_token_secret_id: string | null;
    }>,
    reason: string,
  ) => {
    if (connections.length === 0) return;

    const revokeAudit = {
      actorType: "user" as const,
      actorId: userId,
      source: `oauth2-${provider.id}-revoke-duplicate`,
    };

    const secretsToDelete = connections.flatMap((connection) => {
      const secrets: Array<{
        secretId: string;
        tokenType: string;
        organizationId: string;
        connectionId: string;
      }> = [];

      if (connection.access_token_secret_id) {
        secrets.push({
          secretId: connection.access_token_secret_id,
          tokenType: "access_token",
          organizationId: connection.organization_id,
          connectionId: connection.id,
        });
      }

      if (connection.refresh_token_secret_id) {
        secrets.push({
          secretId: connection.refresh_token_secret_id,
          tokenType: "refresh_token",
          organizationId: connection.organization_id,
          connectionId: connection.id,
        });
      }

      return secrets;
    });

    const deleteSecret = async (
      secretId: string,
      tokenType: string,
      organizationId: string,
      connectionId: string,
    ) => {
      try {
        await secretsService.delete(secretId, organizationId, revokeAudit);
      } catch (error) {
        logger.warn(`[OAuth2] Failed to delete ${tokenType} secret during revoke`, {
          providerId: provider.id,
          connectionId,
          secretId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    await Promise.all(
      secretsToDelete.map((secret) =>
        deleteSecret(secret.secretId, secret.tokenType, secret.organizationId, secret.connectionId),
      ),
    );

    logger.info("[OAuth2] Revoked duplicate platform connections", {
      providerId: provider.id,
      userId,
      connectionIds: connections.map((c) => c.id),
      reason,
    });
  };

  // Check if this platform user ID is already linked to a different user in the org
  const existingByPlatformUser = await dbWrite
    .select({
      id: platformCredentials.id,
      user_id: platformCredentials.user_id,
      access_token_secret_id: platformCredentials.access_token_secret_id,
      refresh_token_secret_id: platformCredentials.refresh_token_secret_id,
    })
    .from(platformCredentials)
    .where(
      and(
        eq(platformCredentials.organization_id, organizationId),
        eq(platformCredentials.platform, providerPlatform),
        eq(platformCredentials.platform_user_id, userInfo.id),
        sql`${platformCredentials.user_id} IS NOT NULL`,
      ),
    )
    .limit(1);

  if (
    existingByPlatformUser.length > 0 &&
    existingByPlatformUser[0].user_id &&
    existingByPlatformUser[0].user_id !== userId
  ) {
    logger.warn("[OAuth2] Platform user already linked to different user", {
      providerId: provider.id,
      platformUserId: userInfo.id,
      existingUserId: existingByPlatformUser[0].user_id,
      attemptedUserId: userId,
      organizationId,
    });
    throw new Error("OAUTH_ACCOUNT_ALREADY_LINKED");
  }

  // Fetch any existing connections for this user/platform (should be at most one after constraints)
  const existingUserConnections = await dbWrite
    .select({
      id: platformCredentials.id,
      organization_id: platformCredentials.organization_id,
      platform_user_id: platformCredentials.platform_user_id,
      access_token_secret_id: platformCredentials.access_token_secret_id,
      refresh_token_secret_id: platformCredentials.refresh_token_secret_id,
    })
    .from(platformCredentials)
    .where(
      and(
        eq(platformCredentials.organization_id, organizationId),
        eq(platformCredentials.user_id, userId),
        eq(platformCredentials.platform, providerPlatform),
      ),
    )
    .orderBy(
      desc(
        sql`COALESCE(${platformCredentials.linked_at}, ${platformCredentials.updated_at}, ${platformCredentials.created_at})`,
      ),
    );

  const matchingUserConnection = existingUserConnections.find(
    (connection) => connection.platform_user_id === userInfo.id,
  );

  let pendingRevocation:
    | {
        connections: Array<{
          id: string;
          organization_id: string;
          platform_user_id: string;
          access_token_secret_id: string | null;
          refresh_token_secret_id: string | null;
        }>;
        reason: string;
      }
    | undefined;

  if (matchingUserConnection) {
    const duplicates = existingUserConnections.filter(
      (connection) => connection.id !== matchingUserConnection.id,
    );
    if (duplicates.length > 0) {
      pendingRevocation = {
        connections: duplicates,
        reason: "duplicate user/platform connection",
      };
    }
  } else if (existingUserConnections.length > 0) {
    pendingRevocation = {
      connections: existingUserConnections,
      reason: "replaced by new platform connection",
    };
  }

  const existing = matchingUserConnection ? [matchingUserConnection] : existingByPlatformUser;

  let accessTokenSecretId: string;
  let refreshTokenSecretId: string | undefined;

  if (existing.length > 0 && existing[0].access_token_secret_id) {
    // Update existing secrets - handle orphaned secret references gracefully
    try {
      await secretsService.rotate(
        existing[0].access_token_secret_id,
        organizationId,
        tokens.access_token,
        audit,
      );
      accessTokenSecretId = existing[0].access_token_secret_id;
    } catch (rotateError) {
      // If secret doesn't exist (orphaned reference), create a new one
      const errorMsg = rotateError instanceof Error ? rotateError.message : String(rotateError);
      if (errorMsg.includes("not found")) {
        logger.warn(
          `[OAuth2] Access token secret not found (orphaned reference), creating new secret`,
          {
            providerId: provider.id,
            organizationId,
            oldSecretId: existing[0].access_token_secret_id,
          },
        );
        const accessSecret = await createOrRotateSecret(
          organizationId,
          `${provider.id.toUpperCase()}_ACCESS_TOKEN_${userInfo.id}`,
          tokens.access_token,
          userId,
          audit,
          newlyCreatedSecretIds,
        );
        accessTokenSecretId = accessSecret.id;
      } else {
        throw rotateError;
      }
    }

    if (tokens.refresh_token && existing[0].refresh_token_secret_id) {
      try {
        await secretsService.rotate(
          existing[0].refresh_token_secret_id,
          organizationId,
          tokens.refresh_token,
          audit,
        );
        refreshTokenSecretId = existing[0].refresh_token_secret_id;
      } catch (rotateError) {
        // If secret doesn't exist (orphaned reference), create a new one
        const errorMsg = rotateError instanceof Error ? rotateError.message : String(rotateError);
        if (errorMsg.includes("not found")) {
          logger.warn(
            `[OAuth2] Refresh token secret not found (orphaned reference), creating new secret`,
            {
              providerId: provider.id,
              organizationId,
              oldSecretId: existing[0].refresh_token_secret_id,
            },
          );
          const refreshSecret = await createOrRotateSecret(
            organizationId,
            `${provider.id.toUpperCase()}_REFRESH_TOKEN_${userInfo.id}`,
            tokens.refresh_token,
            userId,
            audit,
            newlyCreatedSecretIds,
          );
          refreshTokenSecretId = refreshSecret.id;
        } else {
          throw rotateError;
        }
      }
    } else if (tokens.refresh_token) {
      // Use createOrRotateSecret to handle orphaned secrets from failed previous attempts
      const refreshSecret = await createOrRotateSecret(
        organizationId,
        `${provider.id.toUpperCase()}_REFRESH_TOKEN_${userInfo.id}`,
        tokens.refresh_token,
        userId,
        audit,
        newlyCreatedSecretIds,
      );
      refreshTokenSecretId = refreshSecret.id;
    } else if (existing[0].refresh_token_secret_id) {
      refreshTokenSecretId = existing[0].refresh_token_secret_id;
    }
  } else {
    // Create new secrets with cleanup on partial failure
    try {
      const accessSecret = await createOrRotateSecret(
        organizationId,
        `${provider.id.toUpperCase()}_ACCESS_TOKEN_${userInfo.id}`,
        tokens.access_token,
        userId,
        audit,
        newlyCreatedSecretIds,
      );
      accessTokenSecretId = accessSecret.id;

      if (tokens.refresh_token) {
        const refreshSecret = await createOrRotateSecret(
          organizationId,
          `${provider.id.toUpperCase()}_REFRESH_TOKEN_${userInfo.id}`,
          tokens.refresh_token,
          userId,
          audit,
          newlyCreatedSecretIds,
        );
        refreshTokenSecretId = refreshSecret.id;
      }
    } catch (secretError) {
      await cleanupNewlyCreatedSecrets("Secret creation failed");
      throw secretError;
    }
  }

  // Calculate token expiry with bounds validation
  // Clamp expires_in between 60 seconds and 1 year to handle malformed responses
  const expiresInSeconds = tokens.expires_in
    ? Math.max(Math.min(tokens.expires_in, 86400 * 365), 60)
    : undefined;
  const tokenExpiresAt = expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000)
    : undefined;

  let revokeFailed = false;
  let revokeFailure: unknown;
  let insertBlocked = false;

  // Upsert connection with cleanup on failure
  try {
    const connectionId = await writeTransaction(async (tx) => {
      if (pendingRevocation) {
        try {
          await revokeConnectionsDb(pendingRevocation.connections, pendingRevocation.reason, tx);
        } catch (revokeError) {
          revokeFailed = true;
          revokeFailure = revokeError;
          throw revokeError;
        }
      }

      const result = await tx
        .insert(platformCredentials)
        .values({
          organization_id: organizationId,
          user_id: userId,
          platform: providerPlatform,
          platform_user_id: userInfo.id,
          platform_username: userInfo.username || undefined,
          platform_display_name: userInfo.displayName || undefined,
          platform_avatar_url: userInfo.avatarUrl || undefined,
          platform_email: userInfo.email || undefined,
          status: "active",
          access_token_secret_id: accessTokenSecretId,
          refresh_token_secret_id: refreshTokenSecretId,
          token_expires_at: tokenExpiresAt,
          scopes,
          profile_data: userInfo.raw,
          source_type: "web",
          linked_at: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            platformCredentials.organization_id,
            platformCredentials.platform,
            platformCredentials.platform_user_id,
          ],
          setWhere: sql`${platformCredentials.user_id} IS NULL OR ${platformCredentials.user_id} = ${userId}`,
          set: {
            user_id: userId,
            platform_username: userInfo.username || undefined,
            platform_display_name: userInfo.displayName || undefined,
            platform_avatar_url: userInfo.avatarUrl || undefined,
            platform_email: userInfo.email || undefined,
            status: "active",
            access_token_secret_id: accessTokenSecretId,
            refresh_token_secret_id: refreshTokenSecretId,
            token_expires_at: tokenExpiresAt,
            scopes,
            profile_data: userInfo.raw,
            linked_at: new Date(),
            updated_at: new Date(),
          },
        })
        .returning({ id: platformCredentials.id });

      if (result.length === 0) {
        insertBlocked = true;
        throw new Error("OAUTH_ACCOUNT_ALREADY_LINKED");
      }

      return result[0].id;
    });

    if (pendingRevocation) {
      await revokeConnectionsSecrets(
        pendingRevocation.connections,
        pendingRevocation.reason,
      );
    }

    return connectionId;
  } catch (error) {
    if (revokeFailed) {
      await cleanupNewlyCreatedSecrets("Revocation failed prior to insert");
      throw revokeFailure ?? error;
    }

    if (insertBlocked) {
      await cleanupNewlyCreatedSecrets("Database insert blocked by existing connection");
      throw new Error("OAUTH_ACCOUNT_ALREADY_LINKED");
    }

    await cleanupNewlyCreatedSecrets("Database insert failed");
    // Map unique constraint violation on user_platform_idx to a domain error
    // This handles the race condition where a concurrent OAuth completion for the
    // same user/platform inserts between our revoke and insert
    if (error instanceof Error && error.message.includes("user_platform_idx")) {
      throw new Error("OAUTH_ACCOUNT_ALREADY_LINKED");
    }
    throw error;
  }
}

/**
 * Refresh an OAuth 2.0 access token using a refresh token.
 */
export async function refreshOAuth2Token(
  provider: OAuthProviderConfig,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn?: number; newRefreshToken?: string }> {
  const clientId = getClientId(provider);
  const clientSecret = getClientSecret(provider);

  if (!clientId || !clientSecret) {
    throw new Error(`OAuth not configured: missing credentials for ${provider.id}`);
  }

  if (!provider.endpoints?.token) {
    throw new Error(`OAuth not configured: missing token endpoint for ${provider.id}`);
  }

  const bodyParams: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  };

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  // Handle special header configurations
  if (provider.tokenHeaders) {
    for (const [key, value] of Object.entries(provider.tokenHeaders)) {
      if (value === "Basic ${base64(CLIENT_ID:CLIENT_SECRET)}") {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        headers[key] = `Basic ${credentials}`;
        delete bodyParams.client_id;
        delete bodyParams.client_secret;
      } else {
        headers[key] = value;
      }
    }
  }

  let body: string;
  if (provider.tokenContentType === "json") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(bodyParams);
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(bodyParams).toString();
  }

  const response = await fetch(provider.endpoints.token, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`[OAuth2] Token refresh failed for ${provider.id}`, {
      status: response.status,
      error: errorText.substring(0, 500),
    });
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json();
  const tokenMapping = provider.tokenMapping;

  const accessToken = data[tokenMapping?.accessToken || "access_token"];
  if (!accessToken) {
    throw new Error("Token refresh response missing access_token");
  }

  return {
    accessToken,
    expiresIn: data[tokenMapping?.expiresIn || "expires_in"],
    newRefreshToken: data[tokenMapping?.refreshToken || "refresh_token"],
  };
}
