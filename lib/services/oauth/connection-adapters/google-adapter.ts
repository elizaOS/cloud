/**
 * Google Connection Adapter
 *
 * Uses platform_credentials table for storage.
 * Delegates to googleAutomationService for token refresh.
 */

import { dbRead, dbWrite } from "@/db/client";
import { platformCredentials } from "@/db/schemas/platform-credentials";
import { eq, and } from "drizzle-orm";
import { googleAutomationService } from "@/lib/services/google-automation";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import type { ConnectionAdapter } from "./index";
import type { OAuthConnection, TokenResult } from "../types";
import { Errors } from "../errors";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findCredential(organizationId: string, connectionId: string) {
  const [cred] = await dbRead
    .select()
    .from(platformCredentials)
    .where(
      and(
        eq(platformCredentials.id, connectionId),
        eq(platformCredentials.organization_id, organizationId),
        eq(platformCredentials.platform, "google"),
      ),
    )
    .limit(1);
  return cred;
}

export const googleAdapter: ConnectionAdapter = {
  platform: "google",

  async listConnections(organizationId: string): Promise<OAuthConnection[]> {
    const credentials = await dbRead
      .select()
      .from(platformCredentials)
      .where(
        and(
          eq(platformCredentials.organization_id, organizationId),
          eq(platformCredentials.platform, "google"),
        ),
      );

    return credentials.map((cred) => ({
      id: cred.id,
      platform: "google",
      platformUserId: cred.platform_user_id,
      email: cred.platform_email || undefined,
      username: cred.platform_username || undefined,
      displayName: cred.platform_display_name || undefined,
      avatarUrl: cred.platform_avatar_url || undefined,
      status: cred.status,
      scopes: (cred.scopes as string[]) || [],
      linkedAt: cred.linked_at || cred.created_at,
      lastUsedAt: cred.last_used_at || undefined,
      tokenExpired: cred.token_expires_at ? new Date(cred.token_expires_at) < new Date() : false,
      source: "platform_credentials" as const,
    }));
  },

  async getToken(organizationId: string, connectionId: string): Promise<TokenResult> {
    const cred = await findCredential(organizationId, connectionId);
    if (!cred) throw Errors.connectionNotFound(connectionId);
    if (cred.status === "revoked") throw Errors.connectionRevoked("Google");
    if (cred.status !== "active") throw Errors.platformNotConnected("google");

    // Check if token was expired before calling getCredentials
    // googleAutomationService.getCredentials auto-refreshes expired tokens
    const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
    const wasExpired =
      cred.token_expires_at &&
      new Date(cred.token_expires_at).getTime() - TOKEN_EXPIRY_BUFFER_MS < Date.now();

    const credentials = await googleAutomationService.getCredentials(organizationId);
    if (!credentials) throw Errors.tokenRefreshFailed("Google", "No credentials returned");

    await dbWrite
      .update(platformCredentials)
      .set({ last_used_at: new Date(), updated_at: new Date() })
      .where(eq(platformCredentials.id, connectionId));

    // If token was expired but we now have fresh credentials, it was refreshed
    const wasRefreshed = wasExpired && credentials.expiresAt && credentials.expiresAt.getTime() > Date.now();

    return {
      accessToken: credentials.accessToken,
      expiresAt: credentials.expiresAt,
      scopes: credentials.scopes,
      refreshed: wasRefreshed,
      fromCache: false,
    };
  },

  async revoke(organizationId: string, connectionId: string): Promise<void> {
    const cred = await findCredential(organizationId, connectionId);
    if (!cred) throw Errors.connectionNotFound(connectionId);

    const audit = { actorType: "system" as const, actorId: "oauth-service", source: "revoke-connection" };

    // Delete token secrets - log failures but don't block revocation
    const deleteSecret = async (id: string | null, tokenType: string) => {
      if (!id) return;
      try {
        await secretsService.delete(id, organizationId, audit);
      } catch (error) {
        logger.warn("[GoogleAdapter] Failed to delete secret during revoke", {
          secretId: id,
          tokenType,
          organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
    await Promise.all([
      deleteSecret(cred.access_token_secret_id, "access_token"),
      deleteSecret(cred.refresh_token_secret_id, "refresh_token"),
    ]);

    await dbWrite
      .update(platformCredentials)
      .set({ status: "revoked", revoked_at: new Date(), updated_at: new Date() })
      .where(eq(platformCredentials.id, connectionId));

    // Invalidate the status cache synchronously to ensure consistency
    googleAutomationService.invalidateStatusCache(organizationId);
    logger.info("[GoogleAdapter] Connection revoked", { connectionId, organizationId });
  },

  async ownsConnection(connectionId: string): Promise<boolean> {
    if (!UUID_REGEX.test(connectionId)) return false;

    const [cred] = await dbRead
      .select({ id: platformCredentials.id })
      .from(platformCredentials)
      .where(and(eq(platformCredentials.id, connectionId), eq(platformCredentials.platform, "google")))
      .limit(1);

    return !!cred;
  },
};
