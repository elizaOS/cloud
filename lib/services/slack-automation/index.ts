/**
 * Slack Automation Service
 *
 * Handles OAuth flow, workspace management, and message sending.
 * Uses Slack Web API for all operations.
 */

import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

const SLACK_API_BASE = "https://slack.com/api";

// Required environment variables
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.elizacloud.ai";

// OAuth2 scopes for bot
const BOT_SCOPES = [
  "channels:read",
  "channels:history",
  "chat:write",
  "chat:write.public",
  "groups:read",
  "im:read",
  "im:write",
  "mpim:read",
  "users:read",
  "team:read",
].join(",");

// Secret names
const SECRET_NAMES = {
  ACCESS_TOKEN: "SLACK_ACCESS_TOKEN",
  BOT_USER_ID: "SLACK_BOT_USER_ID",
  TEAM_ID: "SLACK_TEAM_ID",
  TEAM_NAME: "SLACK_TEAM_NAME",
  TEAM_ICON: "SLACK_TEAM_ICON",
};

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

export interface SlackConnectionStatus {
  configured: boolean;
  connected: boolean;
  teamId?: string;
  teamName?: string;
  teamIcon?: string;
  botUserId?: string;
  channels?: SlackChannel[];
  error?: string;
}

export interface OAuthState {
  organizationId: string;
  userId: string;
  returnUrl?: string;
}

// Cache for status checks (5 minute TTL)
const statusCache = new Map<
  string,
  { status: SlackConnectionStatus; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class SlackAutomationService {
  /**
   * Check if Slack OAuth is configured
   */
  isConfigured(): boolean {
    return Boolean(SLACK_CLIENT_ID && SLACK_CLIENT_SECRET);
  }

  /**
   * Generate OAuth2 URL for installing the app to a workspace
   */
  generateOAuthUrl(state: OAuthState): string {
    if (!SLACK_CLIENT_ID) {
      throw new Error("Slack client ID not configured");
    }

    const stateEncoded = Buffer.from(JSON.stringify(state)).toString("base64");

    const params = new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      scope: BOT_SCOPES,
      redirect_uri: `${APP_URL}/api/v1/slack/callback`,
      state: stateEncoded,
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /**
   * Handle OAuth callback - exchange code for access token
   */
  async handleOAuthCallback(
    code: string,
    stateBase64: string
  ): Promise<{
    success: boolean;
    teamId?: string;
    teamName?: string;
    error?: string;
  }> {
    if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
      return { success: false, error: "Slack OAuth not configured" };
    }

    try {
      const state: OAuthState = JSON.parse(
        Buffer.from(stateBase64, "base64").toString()
      );

      // Exchange code for access token
      const tokenResponse = await fetch(`${SLACK_API_BASE}/oauth.v2.access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: SLACK_CLIENT_ID,
          client_secret: SLACK_CLIENT_SECRET,
          code,
          redirect_uri: `${APP_URL}/api/v1/slack/callback`,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData.ok) {
        logger.error("[Slack] OAuth token exchange failed:", tokenData);
        return {
          success: false,
          error: tokenData.error || "Failed to exchange code for token",
        };
      }

      const accessToken = tokenData.access_token;
      const teamId = tokenData.team?.id;
      const teamName = tokenData.team?.name;
      const botUserId = tokenData.bot_user_id;

      // Get team info for icon
      let teamIcon: string | undefined;
      try {
        const teamInfoResponse = await fetch(
          `${SLACK_API_BASE}/team.info?team=${teamId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        const teamInfo = await teamInfoResponse.json();
        if (teamInfo.ok && teamInfo.team?.icon) {
          teamIcon =
            teamInfo.team.icon.image_132 ||
            teamInfo.team.icon.image_68 ||
            teamInfo.team.icon.image_34;
        }
      } catch (e) {
        logger.warn("[Slack] Failed to fetch team icon:", e);
      }

      // Store credentials
      await this.storeCredentials(state.organizationId, state.userId, {
        accessToken,
        teamId,
        teamName,
        teamIcon,
        botUserId,
      });

      // Invalidate cache
      this.invalidateStatusCache(state.organizationId);

      return {
        success: true,
        teamId,
        teamName,
      };
    } catch (error) {
      logger.error("[Slack] OAuth callback error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "OAuth callback failed",
      };
    }
  }

  /**
   * Store Slack credentials
   */
  private async storeCredentials(
    organizationId: string,
    userId: string,
    credentials: {
      accessToken: string;
      teamId: string;
      teamName: string;
      teamIcon?: string;
      botUserId: string;
    }
  ): Promise<void> {
    const audit = {
      action: "slack_connect" as const,
      resourceType: "integration" as const,
      organizationId,
      userId,
      metadata: { teamId: credentials.teamId, teamName: credentials.teamName },
    };

    // Remove existing credentials first
    await this.removeCredentials(organizationId, userId);

    // Store new credentials
    await secretsService.create(
      {
        organizationId,
        name: SECRET_NAMES.ACCESS_TOKEN,
        value: credentials.accessToken,
        scope: "organization",
        createdBy: userId,
      },
      audit
    );

    await secretsService.create(
      {
        organizationId,
        name: SECRET_NAMES.TEAM_ID,
        value: credentials.teamId,
        scope: "organization",
        createdBy: userId,
      },
      audit
    );

    await secretsService.create(
      {
        organizationId,
        name: SECRET_NAMES.TEAM_NAME,
        value: credentials.teamName,
        scope: "organization",
        createdBy: userId,
      },
      audit
    );

    if (credentials.teamIcon) {
      await secretsService.create(
        {
          organizationId,
          name: SECRET_NAMES.TEAM_ICON,
          value: credentials.teamIcon,
          scope: "organization",
          createdBy: userId,
        },
        audit
      );
    }

    await secretsService.create(
      {
        organizationId,
        name: SECRET_NAMES.BOT_USER_ID,
        value: credentials.botUserId,
        scope: "organization",
        createdBy: userId,
      },
      audit
    );
  }

  /**
   * Remove Slack credentials
   */
  async removeCredentials(
    organizationId: string,
    userId: string
  ): Promise<void> {
    const audit = {
      action: "slack_disconnect" as const,
      resourceType: "integration" as const,
      organizationId,
      userId,
      metadata: {},
    };

    for (const secretName of Object.values(SECRET_NAMES)) {
      try {
        await secretsService.deleteByName(organizationId, secretName, audit);
      } catch {
        // Ignore if doesn't exist
      }
    }

    this.invalidateStatusCache(organizationId);
  }

  /**
   * Get connection status for an organization
   */
  async getConnectionStatus(
    organizationId: string
  ): Promise<SlackConnectionStatus> {
    // Check cache
    const cached = statusCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.status;
    }

    if (!this.isConfigured()) {
      return {
        configured: false,
        connected: false,
        error: "Slack OAuth not configured",
      };
    }

    try {
      // Get stored credentials
      const accessToken = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.ACCESS_TOKEN
      );
      const teamId = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.TEAM_ID
      );
      const teamName = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.TEAM_NAME
      );
      const teamIcon = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.TEAM_ICON
      );
      const botUserId = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.BOT_USER_ID
      );

      if (!accessToken || !teamId) {
        const status: SlackConnectionStatus = {
          configured: true,
          connected: false,
        };
        statusCache.set(organizationId, { status, timestamp: Date.now() });
        return status;
      }

      // Verify token is still valid by making a test API call
      const authTestResponse = await fetch(`${SLACK_API_BASE}/auth.test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      const authTest = await authTestResponse.json();

      if (!authTest.ok) {
        const status: SlackConnectionStatus = {
          configured: true,
          connected: false,
          error: "Token expired or revoked",
        };
        statusCache.set(organizationId, { status, timestamp: Date.now() });
        return status;
      }

      const status: SlackConnectionStatus = {
        configured: true,
        connected: true,
        teamId,
        teamName: teamName || authTest.team,
        teamIcon: teamIcon || undefined,
        botUserId: botUserId || authTest.user_id,
      };

      statusCache.set(organizationId, { status, timestamp: Date.now() });
      return status;
    } catch (error) {
      logger.error("[Slack] Error getting connection status:", error);
      return {
        configured: true,
        connected: false,
        error: "Failed to check connection status",
      };
    }
  }

  /**
   * Get list of channels the bot can access
   */
  async getChannels(organizationId: string): Promise<SlackChannel[]> {
    const accessToken = await secretsService.getByName(
      organizationId,
      SECRET_NAMES.ACCESS_TOKEN
    );

    if (!accessToken) {
      return [];
    }

    try {
      const response = await fetch(
        `${SLACK_API_BASE}/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=200`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();

      if (!data.ok) {
        logger.error("[Slack] Failed to fetch channels:", data);
        return [];
      }

      return data.channels.map(
        (ch: {
          id: string;
          name: string;
          is_private: boolean;
          is_member: boolean;
        }) => ({
          id: ch.id,
          name: ch.name,
          isPrivate: ch.is_private,
          isMember: ch.is_member,
        })
      );
    } catch (error) {
      logger.error("[Slack] Error fetching channels:", error);
      return [];
    }
  }

  /**
   * Send a message to a channel
   */
  async sendMessage(
    organizationId: string,
    channelId: string,
    text: string,
    options?: {
      blocks?: unknown[];
      threadTs?: string;
      unfurlLinks?: boolean;
    }
  ): Promise<{ success: boolean; ts?: string; error?: string }> {
    const accessToken = await secretsService.getByName(
      organizationId,
      SECRET_NAMES.ACCESS_TOKEN
    );

    if (!accessToken) {
      return { success: false, error: "Slack not connected" };
    }

    try {
      const body: Record<string, unknown> = {
        channel: channelId,
        text,
      };

      if (options?.blocks) {
        body.blocks = options.blocks;
      }
      if (options?.threadTs) {
        body.thread_ts = options.threadTs;
      }
      if (options?.unfurlLinks !== undefined) {
        body.unfurl_links = options.unfurlLinks;
      }

      const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.ok) {
        logger.error("[Slack] Failed to send message:", data);
        return { success: false, error: data.error };
      }

      return { success: true, ts: data.ts };
    } catch (error) {
      logger.error("[Slack] Error sending message:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send message",
      };
    }
  }

  /**
   * Invalidate cached status for an organization
   */
  invalidateStatusCache(organizationId: string): void {
    statusCache.delete(organizationId);
  }
}

export const slackAutomationService = new SlackAutomationService();
