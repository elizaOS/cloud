/**
 * Notion Automation Service
 *
 * Handles OAuth flow, workspace management, and page/database operations.
 * Uses Notion API for all operations.
 */

import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

const NOTION_API_BASE = "https://api.notion.com/v1";

// Required environment variables
const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID;
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.elizacloud.ai";

// Secret names
const SECRET_NAMES = {
  ACCESS_TOKEN: "NOTION_ACCESS_TOKEN",
  WORKSPACE_ID: "NOTION_WORKSPACE_ID",
  WORKSPACE_NAME: "NOTION_WORKSPACE_NAME",
  WORKSPACE_ICON: "NOTION_WORKSPACE_ICON",
  BOT_ID: "NOTION_BOT_ID",
};

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  icon?: string;
  lastEditedTime: string;
}

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  icon?: string;
}

export interface NotionConnectionStatus {
  configured: boolean;
  connected: boolean;
  workspaceId?: string;
  workspaceName?: string;
  workspaceIcon?: string;
  botId?: string;
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
  { status: NotionConnectionStatus; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000;

class NotionAutomationService {
  /**
   * Check if Notion OAuth is configured
   */
  isConfigured(): boolean {
    return Boolean(NOTION_CLIENT_ID && NOTION_CLIENT_SECRET);
  }

  /**
   * Generate OAuth2 URL for connecting to a workspace
   */
  generateOAuthUrl(state: OAuthState): string {
    if (!NOTION_CLIENT_ID) {
      throw new Error("Notion client ID not configured");
    }

    const stateEncoded = Buffer.from(JSON.stringify(state)).toString("base64");

    const params = new URLSearchParams({
      client_id: NOTION_CLIENT_ID,
      redirect_uri: `${APP_URL}/api/v1/notion/callback`,
      response_type: "code",
      owner: "user",
      state: stateEncoded,
    });

    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  }

  /**
   * Handle OAuth callback - exchange code for access token
   */
  async handleOAuthCallback(
    code: string,
    stateBase64: string
  ): Promise<{
    success: boolean;
    workspaceName?: string;
    error?: string;
  }> {
    if (!NOTION_CLIENT_ID || !NOTION_CLIENT_SECRET) {
      return { success: false, error: "Notion OAuth not configured" };
    }

    try {
      const state: OAuthState = JSON.parse(
        Buffer.from(stateBase64, "base64").toString()
      );

      // Exchange code for access token
      const tokenResponse = await fetch(`${NOTION_API_BASE}/oauth/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString("base64")}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: `${APP_URL}/api/v1/notion/callback`,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || tokenData.error) {
        logger.error("[Notion] OAuth token exchange failed:", tokenData);
        return {
          success: false,
          error: tokenData.error || "Failed to exchange code for token",
        };
      }

      const accessToken = tokenData.access_token;
      const workspaceId = tokenData.workspace_id;
      const workspaceName = tokenData.workspace_name;
      const workspaceIcon = tokenData.workspace_icon;
      const botId = tokenData.bot_id;

      // Store credentials
      await this.storeCredentials(state.organizationId, state.userId, {
        accessToken,
        workspaceId,
        workspaceName,
        workspaceIcon,
        botId,
      });

      // Invalidate cache
      this.invalidateStatusCache(state.organizationId);

      return {
        success: true,
        workspaceName,
      };
    } catch (error) {
      logger.error("[Notion] OAuth callback error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "OAuth callback failed",
      };
    }
  }

  /**
   * Store Notion credentials
   */
  private async storeCredentials(
    organizationId: string,
    userId: string,
    credentials: {
      accessToken: string;
      workspaceId: string;
      workspaceName: string;
      workspaceIcon?: string;
      botId: string;
    }
  ): Promise<void> {
    const audit = {
      action: "notion_connect" as const,
      resourceType: "integration" as const,
      organizationId,
      userId,
      metadata: { workspaceName: credentials.workspaceName },
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
        name: SECRET_NAMES.WORKSPACE_ID,
        value: credentials.workspaceId,
        scope: "organization",
        createdBy: userId,
      },
      audit
    );

    await secretsService.create(
      {
        organizationId,
        name: SECRET_NAMES.WORKSPACE_NAME,
        value: credentials.workspaceName,
        scope: "organization",
        createdBy: userId,
      },
      audit
    );

    if (credentials.workspaceIcon) {
      await secretsService.create(
        {
          organizationId,
          name: SECRET_NAMES.WORKSPACE_ICON,
          value: credentials.workspaceIcon,
          scope: "organization",
          createdBy: userId,
        },
        audit
      );
    }

    await secretsService.create(
      {
        organizationId,
        name: SECRET_NAMES.BOT_ID,
        value: credentials.botId,
        scope: "organization",
        createdBy: userId,
      },
      audit
    );
  }

  /**
   * Remove Notion credentials
   */
  async removeCredentials(
    organizationId: string,
    userId: string
  ): Promise<void> {
    const audit = {
      action: "notion_disconnect" as const,
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
  ): Promise<NotionConnectionStatus> {
    // Check cache
    const cached = statusCache.get(organizationId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.status;
    }

    if (!this.isConfigured()) {
      return {
        configured: false,
        connected: false,
        error: "Notion OAuth not configured",
      };
    }

    try {
      // Get stored credentials
      const accessToken = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.ACCESS_TOKEN
      );
      const workspaceId = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.WORKSPACE_ID
      );
      const workspaceName = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.WORKSPACE_NAME
      );
      const workspaceIcon = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.WORKSPACE_ICON
      );
      const botId = await secretsService.getByName(
        organizationId,
        SECRET_NAMES.BOT_ID
      );

      if (!accessToken || !workspaceId) {
        const status: NotionConnectionStatus = {
          configured: true,
          connected: false,
        };
        statusCache.set(organizationId, { status, timestamp: Date.now() });
        return status;
      }

      // Verify token is still valid by making a test API call
      const userResponse = await fetch(`${NOTION_API_BASE}/users/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
        },
      });

      if (!userResponse.ok) {
        const status: NotionConnectionStatus = {
          configured: true,
          connected: false,
          error: "Token expired or revoked",
        };
        statusCache.set(organizationId, { status, timestamp: Date.now() });
        return status;
      }

      const status: NotionConnectionStatus = {
        configured: true,
        connected: true,
        workspaceId,
        workspaceName: workspaceName || undefined,
        workspaceIcon: workspaceIcon || undefined,
        botId: botId || undefined,
      };

      statusCache.set(organizationId, { status, timestamp: Date.now() });
      return status;
    } catch (error) {
      logger.error("[Notion] Error getting connection status:", error);
      return {
        configured: true,
        connected: false,
        error: "Failed to check connection status",
      };
    }
  }

  /**
   * Search for pages the integration has access to
   */
  async searchPages(
    organizationId: string,
    query?: string
  ): Promise<NotionPage[]> {
    const accessToken = await secretsService.getByName(
      organizationId,
      SECRET_NAMES.ACCESS_TOKEN
    );

    if (!accessToken) {
      return [];
    }

    try {
      const response = await fetch(`${NOTION_API_BASE}/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          query: query || "",
          filter: { property: "object", value: "page" },
          page_size: 50,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        logger.error("[Notion] Failed to search pages:", data);
        return [];
      }

      return data.results.map(
        (page: {
          id: string;
          url: string;
          icon?: { emoji?: string; external?: { url: string } };
          last_edited_time: string;
          properties?: { title?: { title?: Array<{ plain_text: string }> } };
        }) => ({
          id: page.id,
          title:
            page.properties?.title?.title?.[0]?.plain_text || "Untitled",
          url: page.url,
          icon: page.icon?.emoji || page.icon?.external?.url,
          lastEditedTime: page.last_edited_time,
        })
      );
    } catch (error) {
      logger.error("[Notion] Error searching pages:", error);
      return [];
    }
  }

  /**
   * Create a page in a database or as a child of another page
   */
  async createPage(
    organizationId: string,
    options: {
      parentId: string;
      parentType: "database_id" | "page_id";
      properties: Record<string, unknown>;
      content?: unknown[];
    }
  ): Promise<{ success: boolean; pageId?: string; url?: string; error?: string }> {
    const accessToken = await secretsService.getByName(
      organizationId,
      SECRET_NAMES.ACCESS_TOKEN
    );

    if (!accessToken) {
      return { success: false, error: "Notion not connected" };
    }

    try {
      const body: Record<string, unknown> = {
        parent: { [options.parentType]: options.parentId },
        properties: options.properties,
      };

      if (options.content) {
        body.children = options.content;
      }

      const response = await fetch(`${NOTION_API_BASE}/pages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        logger.error("[Notion] Failed to create page:", data);
        return { success: false, error: data.message || "Failed to create page" };
      }

      return { success: true, pageId: data.id, url: data.url };
    } catch (error) {
      logger.error("[Notion] Error creating page:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create page",
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

export const notionAutomationService = new NotionAutomationService();
