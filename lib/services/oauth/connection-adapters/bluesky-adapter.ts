/**
 * Bluesky AT Protocol Connection Adapter
 *
 * Custom adapter for Bluesky OAuth connections stored in platform_credentials.
 * Unlike generic adapters that return Bearer tokens, Bluesky uses DPoP-bound
 * tokens. The getToken() method returns a marker string; actual API calls
 * should use getBlueskyAgent() from the bluesky-at provider.
 */

import { dbRead, dbWrite } from "@/db/client";
import { platformCredentials } from "@/db/schemas/platform-credentials";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { and, eq } from "drizzle-orm";
import type { ConnectionAdapter } from "./index";
import type { OAuthConnection, TokenResult } from "../types";
import { Errors } from "../errors";

const PLATFORM = "bluesky";
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AUDIT = {
  actorType: "system" as const,
  actorId: "bluesky-adapter",
  source: "bluesky-adapter",
};

export const blueskyAdapter: ConnectionAdapter = {
  platform: PLATFORM,

  async listConnections(organizationId: string): Promise<OAuthConnection[]> {
    try {
      const credentials = await dbRead
        .select()
        .from(platformCredentials)
        .where(
          and(
            eq(platformCredentials.organization_id, organizationId),
            eq(platformCredentials.platform, PLATFORM),
          ),
        );

      return credentials.map((cred) => ({
        id: cred.id,
        platform: PLATFORM,
        platformUserId: cred.platform_user_id,
        username: cred.platform_username || undefined,
        displayName: cred.platform_display_name || undefined,
        avatarUrl: cred.platform_avatar_url || undefined,
        status: (cred.status || "active") as OAuthConnection["status"],
        scopes: (cred.scopes as string[]) || [],
        linkedAt: cred.linked_at || cred.created_at || new Date(),
        lastUsedAt: cred.last_used_at || undefined,
        tokenExpired: false, // Session refresh is handled by the AT Protocol client
        source: "platform_credentials" as const,
      }));
    } catch (error) {
      logger.warn("[BlueskyAdapter] listConnections failed", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  },

  async getToken(
    organizationId: string,
    connectionId: string,
  ): Promise<TokenResult> {
    // For Bluesky, we can't return a raw access token because DPoP tokens
    // need per-request proof JWTs. Return a marker indicating the connection
    // is active. MCP tools should use getBlueskyAgent() directly.
    const cred = await findCredential(organizationId, connectionId);
    if (!cred) throw Errors.connectionNotFound(connectionId);
    if (cred.status !== "active") throw Errors.platformNotConnected(PLATFORM);

    // Update last_used_at
    await dbWrite
      .update(platformCredentials)
      .set({ last_used_at: new Date() })
      .where(eq(platformCredentials.id, connectionId));

    return {
      accessToken: `dpop:${cred.platform_user_id}`,
      scopes: (cred.scopes as string[]) || [],
      refreshed: false,
      fromCache: false,
    };
  },

  async revoke(
    organizationId: string,
    connectionId: string,
  ): Promise<void> {
    const cred = await findCredential(organizationId, connectionId);
    if (!cred) throw Errors.connectionNotFound(connectionId);

    // Delete the session secret
    if (cred.access_token_secret_id) {
      try {
        await secretsService.delete(
          cred.access_token_secret_id,
          organizationId,
          AUDIT,
        );
      } catch (error) {
        logger.warn(
          "[BlueskyAdapter] Failed to delete session secret",
          {
            connectionId,
            error:
              error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    // Also try to delete by name pattern (in case access_token_secret_id is stale)
    const secretName = `BLUESKY_SESSION_${organizationId}_${cred.platform_user_id}`;
    try {
      await secretsService.deleteByName(organizationId, secretName, AUDIT);
    } catch {
      // Ignore - may not exist
    }

    await dbWrite
      .update(platformCredentials)
      .set({
        status: "revoked",
        revoked_at: new Date(),
        updated_at: new Date(),
        access_token_secret_id: null,
      })
      .where(eq(platformCredentials.id, connectionId));

    logger.info("[BlueskyAdapter] Connection revoked", {
      connectionId,
      organizationId,
    });
  },

  async ownsConnection(connectionId: string): Promise<boolean> {
    if (!UUID_REGEX.test(connectionId)) return false;
    try {
      const [cred] = await dbRead
        .select({ id: platformCredentials.id })
        .from(platformCredentials)
        .where(
          and(
            eq(platformCredentials.id, connectionId),
            eq(platformCredentials.platform, PLATFORM),
          ),
        )
        .limit(1);
      return !!cred;
    } catch {
      return false;
    }
  },
};

async function findCredential(
  organizationId: string,
  connectionId: string,
) {
  const [cred] = await dbRead
    .select()
    .from(platformCredentials)
    .where(
      and(
        eq(platformCredentials.id, connectionId),
        eq(platformCredentials.organization_id, organizationId),
        eq(platformCredentials.platform, PLATFORM),
      ),
    )
    .limit(1);
  return cred || null;
}
