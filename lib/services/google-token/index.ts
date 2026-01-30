/**
 * Google Token Service
 *
 * Handles automatic token refresh for Google OAuth credentials.
 * Ensures valid access tokens are always available for API calls.
 */

import { dbRead } from "@/db/client";
import { dbWrite } from "@/db/client";
import { platformCredentials } from "@/db/schemas/platform-credentials";
import { secretsService } from "@/lib/services/secrets";
import { refreshGoogleToken } from "@/lib/utils/google-api";
import { logger } from "@/lib/utils/logger";
import { eq, and } from "drizzle-orm";

// Buffer time before expiry to trigger refresh (5 minutes)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export interface GoogleTokenResult {
  accessToken: string;
  email?: string;
  expiresAt?: Date;
}

class GoogleTokenService {
  /**
   * Get a valid Google access token for an organization
   * Automatically refreshes if expired or about to expire
   */
  async getValidToken(organizationId: string): Promise<GoogleTokenResult | null> {
    logger.info("[GoogleToken] getValidToken called", { organizationId });
    
    try {
      // Find the Google credential for this org
      const [credential] = await dbRead
        .select()
        .from(platformCredentials)
        .where(
          and(
            eq(platformCredentials.organization_id, organizationId),
            eq(platformCredentials.platform, "google"),
            eq(platformCredentials.status, "active"),
          ),
        )
        .limit(1);

      if (!credential) {
        logger.warn("[GoogleToken] No Google credential found in platform_credentials", { 
          organizationId,
          hint: "User needs to connect Google via Settings > Connections",
        });
        return null;
      }
      
      logger.info("[GoogleToken] Found credential", {
        organizationId,
        credentialId: credential.id,
        email: credential.platform_email,
        hasAccessTokenSecretId: !!credential.access_token_secret_id,
        hasRefreshTokenSecretId: !!credential.refresh_token_secret_id,
        tokenExpiresAt: credential.token_expires_at,
        status: credential.status,
      });

      // Check if token needs refresh
      const needsRefresh = this.tokenNeedsRefresh(credential.token_expires_at);

      if (needsRefresh && credential.refresh_token_secret_id) {
        logger.info("[GoogleToken] Token expired or expiring, attempting refresh", {
          organizationId,
          expiresAt: credential.token_expires_at,
        });

        const refreshed = await this.refreshToken(
          organizationId,
          credential.id,
          credential.refresh_token_secret_id,
          credential.access_token_secret_id,
        );

        if (refreshed) {
          return {
            accessToken: refreshed.accessToken,
            email: credential.platform_email || undefined,
            expiresAt: refreshed.expiresAt,
          };
        }
      }

      // Get the current access token
      if (!credential.access_token_secret_id) {
        logger.warn("[GoogleToken] No access token found", { organizationId });
        return null;
      }

      const accessToken = await secretsService.getDecryptedValue(
        credential.access_token_secret_id,
        organizationId,
      );

      if (!accessToken) {
        logger.warn("[GoogleToken] Failed to decrypt access token", { organizationId });
        return null;
      }

      return {
        accessToken,
        email: credential.platform_email || undefined,
        expiresAt: credential.token_expires_at || undefined,
      };
    } catch (error) {
      logger.error("[GoogleToken] Error getting valid token", {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });
      return null;
    }
  }

  /**
   * Check if token needs refresh
   */
  private tokenNeedsRefresh(expiresAt: Date | null): boolean {
    if (!expiresAt) {
      return false; // No expiry info, assume valid
    }

    const now = Date.now();
    const expiresAtMs = expiresAt.getTime();

    // Refresh if expired or will expire within buffer time
    return now + TOKEN_EXPIRY_BUFFER_MS >= expiresAtMs;
  }

  /**
   * Refresh the Google access token
   */
  private async refreshToken(
    organizationId: string,
    credentialId: string,
    refreshTokenSecretId: string,
    currentAccessTokenSecretId: string | null,
  ): Promise<{ accessToken: string; expiresAt: Date } | null> {
    try {
      // Get Google OAuth credentials from env
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        logger.error("[GoogleToken] Missing Google OAuth configuration");
        return null;
      }

      // Get refresh token
      const refreshToken = await secretsService.getDecryptedValue(
        refreshTokenSecretId,
        organizationId,
      );

      if (!refreshToken) {
        logger.error("[GoogleToken] Failed to decrypt refresh token");
        return null;
      }

      // Call Google to refresh
      const tokens = await refreshGoogleToken({
        refreshToken,
        clientId,
        clientSecret,
      });

      // Calculate new expiry
      const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Update or create new access token secret
      let newAccessTokenSecretId: string;

      const auditContext = {
        actorType: "system" as const,
        actorId: "google-token-refresh",
        source: "automatic-refresh",
      };

      if (currentAccessTokenSecretId) {
        // Try to update existing secret, fall back to create if it was deleted
        try {
          await secretsService.update(
            currentAccessTokenSecretId,
            organizationId,
            { value: tokens.access_token },
            auditContext,
          );
          newAccessTokenSecretId = currentAccessTokenSecretId;
        } catch (updateError) {
          // Secret may have been deleted - create a new one
          // Use credentialId for consistent naming with OAuth callback
          logger.warn("[GoogleToken] Existing access token secret not found, creating new one", {
            organizationId,
            previousSecretId: currentAccessTokenSecretId,
            credentialId,
          });
          const newSecret = await secretsService.create(
            {
              organizationId,
              name: `GOOGLE_ACCESS_TOKEN_${credentialId}`,
              value: tokens.access_token,
              scope: "organization",
              createdBy: "system",
            },
            auditContext,
          );
          newAccessTokenSecretId = newSecret.id;
        }
      } else {
        // Create new secret using credentialId for consistent naming
        const newSecret = await secretsService.create(
          {
            organizationId,
            name: `GOOGLE_ACCESS_TOKEN_${credentialId}`,
            value: tokens.access_token,
            scope: "organization",
            createdBy: "system",
          },
          auditContext,
        );
        newAccessTokenSecretId = newSecret.id;
      }

      // Update platform_credentials with new token info
      await dbWrite
        .update(platformCredentials)
        .set({
          access_token_secret_id: newAccessTokenSecretId,
          token_expires_at: newExpiresAt,
          last_refreshed_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(platformCredentials.id, credentialId));

      logger.info("[GoogleToken] Token refreshed successfully", {
        organizationId,
        expiresAt: newExpiresAt,
      });

      return {
        accessToken: tokens.access_token,
        expiresAt: newExpiresAt,
      };
    } catch (error) {
      logger.error("[GoogleToken] Token refresh failed", {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      });

      // Mark credential as expired
      await dbWrite
        .update(platformCredentials)
        .set({
          status: "expired",
          error_message: error instanceof Error ? error.message : "Token refresh failed",
          updated_at: new Date(),
        })
        .where(eq(platformCredentials.id, credentialId));

      return null;
    }
  }

  /**
   * Check if Google is connected for an organization
   */
  async isConnected(organizationId: string): Promise<boolean> {
    const [credential] = await dbRead
      .select({ id: platformCredentials.id })
      .from(platformCredentials)
      .where(
        and(
          eq(platformCredentials.organization_id, organizationId),
          eq(platformCredentials.platform, "google"),
          eq(platformCredentials.status, "active"),
        ),
      )
      .limit(1);

    return !!credential;
  }

  /**
   * Get Google connection status for an organization
   */
  async getStatus(organizationId: string): Promise<{
    connected: boolean;
    email?: string;
    scopes?: string[];
    expiresAt?: Date;
    needsRefresh?: boolean;
  }> {
    const [credential] = await dbRead
      .select()
      .from(platformCredentials)
      .where(
        and(
          eq(platformCredentials.organization_id, organizationId),
          eq(platformCredentials.platform, "google"),
        ),
      )
      .limit(1);

    if (!credential || credential.status !== "active") {
      return { connected: false };
    }

    return {
      connected: true,
      email: credential.platform_email || undefined,
      scopes: (credential.scopes as string[]) || [],
      expiresAt: credential.token_expires_at || undefined,
      needsRefresh: this.tokenNeedsRefresh(credential.token_expires_at),
    };
  }
}

export const googleTokenService = new GoogleTokenService();
