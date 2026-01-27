/**
 * Google Automation Service
 *
 * Handles Google OAuth credential management, token refresh, and API access
 * for Gmail, Calendar, and Contacts integration.
 */

import { secretsService } from "@/lib/services/secrets";
import { dbRead, dbWrite } from "@/db/client";
import { platformCredentials } from "@/db/schemas/platform-credentials";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import {
  refreshGoogleToken,
  getGoogleUserInfo,
  googleApiRequest,
  GOOGLE_SCOPES,
} from "@/lib/utils/google-api";

// Buffer for token refresh (5 minutes before expiry)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// Cache TTL for connection status (5 minutes)
const STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedStatus {
  status: GoogleConnectionStatus;
  cachedAt: number;
}

export interface GoogleConnectionStatus {
  connected: boolean;
  configured: boolean;
  email?: string;
  name?: string;
  avatarUrl?: string;
  scopes?: string[];
  tokenExpired?: boolean;
  error?: string;
}

export interface GoogleCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
}

class GoogleAutomationService {
  // In-memory cache for connection status
  private statusCache = new Map<string, CachedStatus>();

  /**
   * Check if Google OAuth is configured on the platform
   */
  isConfigured(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  /**
   * Invalidate cached status for an organization.
   */
  invalidateStatusCache(organizationId: string): void {
    this.statusCache.delete(organizationId);
  }

  /**
   * Get Google credentials for an organization, with automatic token refresh.
   */
  async getCredentials(
    organizationId: string,
  ): Promise<GoogleCredentials | null> {
    // Find active Google credentials
    const [cred] = await dbRead
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

    if (!cred) {
      return null;
    }

    // Get tokens from secrets
    const [accessToken, refreshToken] = await Promise.all([
      cred.access_token_secret_id
        ? secretsService.getDecryptedValue(
            cred.access_token_secret_id,
            organizationId,
          )
        : null,
      cred.refresh_token_secret_id
        ? secretsService.getDecryptedValue(
            cred.refresh_token_secret_id,
            organizationId,
          )
        : null,
    ]);

    if (!accessToken) {
      logger.warn("[GoogleAutomation] No access token found", {
        organizationId,
      });
      return null;
    }

    // Check if token needs refresh
    const needsRefresh =
      cred.token_expires_at &&
      new Date(cred.token_expires_at).getTime() - TOKEN_EXPIRY_BUFFER_MS <
        Date.now();

    if (needsRefresh && refreshToken) {
      logger.info("[GoogleAutomation] Token expired, refreshing", {
        organizationId,
      });

      try {
        const refreshed = await this.refreshCredentials(
          organizationId,
          cred.id,
          refreshToken,
        );
        if (refreshed) {
          return {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: refreshed.expiresAt,
            scopes: cred.scopes as string[],
          };
        }
      } catch (error) {
        logger.error("[GoogleAutomation] Token refresh failed", {
          organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
        // Return existing token anyway, it might still work briefly
      }
    }

    return {
      accessToken,
      refreshToken: refreshToken || undefined,
      expiresAt: cred.token_expires_at
        ? new Date(cred.token_expires_at)
        : undefined,
      scopes: cred.scopes as string[],
    };
  }

  /**
   * Refresh Google tokens and update stored credentials.
   */
  private async refreshCredentials(
    organizationId: string,
    credentialId: string,
    refreshToken: string,
  ): Promise<GoogleCredentials | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth not configured");
    }

    const tokens = await refreshGoogleToken({
      refreshToken,
      clientId,
      clientSecret,
    });

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Store new access token
    const audit = {
      actorType: "system" as const,
      actorId: "token-refresh",
      source: "google-automation",
    };

    const accessTokenSecretId = await secretsService.create(
      {
        organizationId,
        name: `GOOGLE_ACCESS_TOKEN_REFRESHED_${Date.now()}`,
        value: tokens.access_token,
        scope: "organization",
        createdBy: "system",
      },
      audit,
    );

    // Update credential record
    const updates: Record<string, unknown> = {
      access_token_secret_id: accessTokenSecretId,
      token_expires_at: expiresAt,
      last_refreshed_at: new Date(),
      updated_at: new Date(),
    };

    // If we got a new refresh token, store it
    if (tokens.refresh_token) {
      const refreshTokenSecretId = await secretsService.create(
        {
          organizationId,
          name: `GOOGLE_REFRESH_TOKEN_REFRESHED_${Date.now()}`,
          value: tokens.refresh_token,
          scope: "organization",
          createdBy: "system",
        },
        audit,
      );
      updates.refresh_token_secret_id = refreshTokenSecretId;
    }

    await dbWrite
      .update(platformCredentials)
      .set(updates)
      .where(eq(platformCredentials.id, credentialId));

    logger.info("[GoogleAutomation] Token refreshed successfully", {
      organizationId,
      credentialId,
    });

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || refreshToken,
      expiresAt,
    };
  }

  /**
   * Get connection status for an organization.
   */
  async getConnectionStatus(
    organizationId: string,
    options?: { skipCache?: boolean },
  ): Promise<GoogleConnectionStatus> {
    // Check cache first
    if (!options?.skipCache) {
      const cached = this.statusCache.get(organizationId);
      if (cached && Date.now() - cached.cachedAt < STATUS_CACHE_TTL_MS) {
        return cached.status;
      }
    }

    // Find active Google credentials
    const [cred] = await dbRead
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

    if (!cred) {
      const status: GoogleConnectionStatus = {
        connected: false,
        configured: false,
      };
      this.statusCache.set(organizationId, { status, cachedAt: Date.now() });
      return status;
    }

    const tokenExpired =
      cred.token_expires_at && new Date(cred.token_expires_at) < new Date();

    const status: GoogleConnectionStatus = {
      connected: true,
      configured: true,
      email: cred.platform_email || undefined,
      name: cred.platform_display_name || undefined,
      avatarUrl: cred.platform_avatar_url || undefined,
      scopes: cred.scopes as string[],
      tokenExpired,
    };

    this.statusCache.set(organizationId, { status, cachedAt: Date.now() });
    return status;
  }

  /**
   * Check if the organization has a specific Google scope.
   */
  async hasScope(organizationId: string, scope: string): Promise<boolean> {
    const status = await this.getConnectionStatus(organizationId);
    return status.scopes?.includes(scope) || false;
  }

  /**
   * Check if organization has Gmail access.
   */
  async hasGmailAccess(organizationId: string): Promise<boolean> {
    const status = await this.getConnectionStatus(organizationId);
    return (
      status.scopes?.includes(GOOGLE_SCOPES.GMAIL_READONLY) ||
      status.scopes?.includes(GOOGLE_SCOPES.GMAIL_SEND) ||
      false
    );
  }

  /**
   * Check if organization has Calendar access.
   */
  async hasCalendarAccess(organizationId: string): Promise<boolean> {
    const status = await this.getConnectionStatus(organizationId);
    return (
      status.scopes?.includes(GOOGLE_SCOPES.CALENDAR_READONLY) ||
      status.scopes?.includes(GOOGLE_SCOPES.CALENDAR_EVENTS) ||
      false
    );
  }

  /**
   * Check if organization has Contacts access.
   */
  async hasContactsAccess(organizationId: string): Promise<boolean> {
    const status = await this.getConnectionStatus(organizationId);
    return (
      status.scopes?.includes(GOOGLE_SCOPES.CONTACTS_READONLY) ||
      status.scopes?.includes(GOOGLE_SCOPES.CONTACTS) ||
      false
    );
  }

  /**
   * Make an authenticated Google API request.
   */
  async apiRequest<T>(
    organizationId: string,
    url: string,
    options: RequestInit = {},
  ): Promise<T> {
    const credentials = await this.getCredentials(organizationId);
    if (!credentials) {
      throw new Error("Google not connected for this organization");
    }

    return googleApiRequest<T>(credentials.accessToken, url, options);
  }
}

export const googleAutomationService = new GoogleAutomationService();
