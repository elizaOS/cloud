/**
 * Bots Service
 *
 * Manages Discord, Telegram, and other platform bot connections.
 * Generic cloud capability for bot token validation, OAuth flows,
 * and server/group management.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  orgPlatformConnections,
  orgPlatformServers,
  OrgPlatformConnection,
  OrgPlatformServer,
  NewOrgPlatformConnection,
  NewOrgPlatformServer,
} from "@/db/schemas/org-platforms";
import { secretsService, type AuditContext } from "./secrets";
import { logger } from "@/lib/utils/logger";

// Default audit context for system operations
const SYSTEM_AUDIT: AuditContext = {
  actorType: "system",
  actorId: "org-platforms-service",
  source: "org-platforms",
};

// =============================================================================
// TYPES
// =============================================================================

export type PlatformType = "discord" | "telegram" | "slack" | "twitter";

export interface DiscordBotInfo {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot: boolean;
}

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  approximate_member_count?: number;
}

export interface TelegramChat {
  id: number;
  type: "group" | "supergroup" | "channel";
  title: string;
  username?: string;
  photo?: { small_file_id: string };
}

export interface ConnectDiscordParams {
  organizationId: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
  botInfo: DiscordBotInfo;
}

export interface ConnectTelegramParams {
  organizationId: string;
  userId: string;
  botToken: string;
  botInfo: TelegramBotInfo;
}

export interface ServerWithConnection extends OrgPlatformServer {
  connection: OrgPlatformConnection;
}

// =============================================================================
// DISCORD API HELPERS
// =============================================================================

const DISCORD_API_BASE = "https://discord.com/api/v10";

async function discordApiRequest<T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${DISCORD_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Discord API error: ${response.status} - ${error.message || "Unknown error"}`
    );
  }

  return response.json();
}

async function discordBotApiRequest<T>(
  endpoint: string,
  botToken: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${DISCORD_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Discord Bot API error: ${response.status} - ${error.message || "Unknown error"}`
    );
  }

  return response.json();
}

// =============================================================================
// TELEGRAM API HELPERS
// =============================================================================

const TELEGRAM_API_BASE = "https://api.telegram.org";

async function telegramApiRequest<T>(
  method: string,
  botToken: string,
  params?: Record<string, string | number | boolean>
): Promise<T> {
  const url = new URL(`${TELEGRAM_API_BASE}/bot${botToken}/${method}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      `Telegram API error: ${data.error_code} - ${data.description}`
    );
  }

  return data.result;
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate a Discord bot token and get bot info
 */
export async function validateDiscordBotToken(
  botToken: string
): Promise<DiscordBotInfo> {
  return discordBotApiRequest<DiscordBotInfo>("/users/@me", botToken);
}

/**
 * Validate a Telegram bot token and get bot info
 */
export async function validateTelegramBotToken(
  botToken: string
): Promise<TelegramBotInfo> {
  return telegramApiRequest<TelegramBotInfo>("getMe", botToken);
}

/**
 * Get Discord guilds the bot is in
 */
export async function getDiscordBotGuilds(
  botToken: string
): Promise<DiscordGuild[]> {
  return discordBotApiRequest<DiscordGuild[]>("/users/@me/guilds", botToken);
}

/**
 * Get Telegram updates to discover groups (requires bot to be in groups)
 */
export async function getTelegramUpdates(
  botToken: string
): Promise<TelegramChat[]> {
  interface TelegramUpdate {
    message?: {
      chat: TelegramChat;
    };
  }

  const updates = await telegramApiRequest<TelegramUpdate[]>(
    "getUpdates",
    botToken,
    { limit: 100 }
  );

  // Extract unique chats from updates
  const chatMap = new Map<number, TelegramChat>();
  for (const update of updates) {
    if (update.message?.chat) {
      const chat = update.message.chat;
      if (chat.type === "group" || chat.type === "supergroup") {
        chatMap.set(chat.id, chat);
      }
    }
  }

  return Array.from(chatMap.values());
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

class BotsService {
  // ===========================================================================
  // PLATFORM CONNECTIONS
  // ===========================================================================

  /**
   * Connect a Discord bot to an organization
   */
  async connectDiscord(params: ConnectDiscordParams): Promise<OrgPlatformConnection> {
    const {
      organizationId,
      userId,
      accessToken,
      refreshToken,
      expiresAt,
      scopes,
      botInfo,
    } = params;

    logger.info("[OrgPlatforms] Connecting Discord bot", {
      organizationId,
      botId: botInfo.id,
      botUsername: botInfo.username,
    });

    // Store tokens in secrets
    const accessTokenSecret = await secretsService.create(
      {
        organizationId,
        name: `DISCORD_ACCESS_TOKEN_${botInfo.id}`,
        value: accessToken,
        scope: "project",
        projectType: "org-app",
        createdBy: userId,
      },
      SYSTEM_AUDIT
    );

    let refreshTokenSecretId: string | undefined;
    if (refreshToken) {
      const refreshTokenSecret = await secretsService.create(
        {
          organizationId,
          name: `DISCORD_REFRESH_TOKEN_${botInfo.id}`,
          value: refreshToken,
          scope: "project",
          projectType: "org-app",
          createdBy: userId,
        },
        SYSTEM_AUDIT
      );
      refreshTokenSecretId = refreshTokenSecret.id;
    }

    // Check for existing connection
    const existing = await db
      .select()
      .from(orgPlatformConnections)
      .where(
        and(
          eq(orgPlatformConnections.organization_id, organizationId),
          eq(orgPlatformConnections.platform, "discord"),
          eq(orgPlatformConnections.platform_bot_id, botInfo.id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing connection
      const [updated] = await db
        .update(orgPlatformConnections)
        .set({
          status: "active",
          platform_bot_username: botInfo.username,
          oauth_access_token_secret_id: accessTokenSecret.id,
          oauth_refresh_token_secret_id: refreshTokenSecretId,
          oauth_expires_at: expiresAt,
          oauth_scopes: scopes,
          error_message: null,
          disconnected_at: null,
          updated_at: new Date(),
        })
        .where(eq(orgPlatformConnections.id, existing[0].id))
        .returning();

      return updated;
    }

    // Create new connection
    const [connection] = await db
      .insert(orgPlatformConnections)
      .values({
        organization_id: organizationId,
        connected_by: userId,
        platform: "discord",
        platform_bot_id: botInfo.id,
        platform_bot_username: botInfo.username,
        platform_bot_name: botInfo.username,
        status: "active",
        oauth_access_token_secret_id: accessTokenSecret.id,
        oauth_refresh_token_secret_id: refreshTokenSecretId,
        oauth_expires_at: expiresAt,
        oauth_scopes: scopes,
      })
      .returning();

    return connection;
  }

  /**
   * Connect a Telegram bot to an organization
   */
  async connectTelegram(params: ConnectTelegramParams): Promise<OrgPlatformConnection> {
    const { organizationId, userId, botToken, botInfo } = params;

    logger.info("[OrgPlatforms] Connecting Telegram bot", {
      organizationId,
      botId: botInfo.id,
      botUsername: botInfo.username,
    });

    // Store bot token in secrets
    const tokenSecret = await secretsService.create(
      {
        organizationId,
        name: `TELEGRAM_BOT_TOKEN_${botInfo.id}`,
        value: botToken,
        scope: "project",
        projectType: "org-app",
        createdBy: userId,
      },
      SYSTEM_AUDIT
    );

    // Check for existing connection
    const existing = await db
      .select()
      .from(orgPlatformConnections)
      .where(
        and(
          eq(orgPlatformConnections.organization_id, organizationId),
          eq(orgPlatformConnections.platform, "telegram"),
          eq(orgPlatformConnections.platform_bot_id, String(botInfo.id))
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing connection
      const [updated] = await db
        .update(orgPlatformConnections)
        .set({
          status: "active",
          platform_bot_username: botInfo.username,
          platform_bot_name: botInfo.first_name,
          bot_token_secret_id: tokenSecret.id,
          error_message: null,
          disconnected_at: null,
          updated_at: new Date(),
        })
        .where(eq(orgPlatformConnections.id, existing[0].id))
        .returning();

      return updated;
    }

    // Create new connection
    const [connection] = await db
      .insert(orgPlatformConnections)
      .values({
        organization_id: organizationId,
        connected_by: userId,
        platform: "telegram",
        platform_bot_id: String(botInfo.id),
        platform_bot_username: botInfo.username,
        platform_bot_name: botInfo.first_name,
        status: "active",
        bot_token_secret_id: tokenSecret.id,
      })
      .returning();

    return connection;
  }

  /**
   * Connect a Twitter/X account to an organization
   */
  async connectTwitter(params: {
    organizationId: string;
    userId: string;
    username: string;
    email?: string;
    password: string;
    twoFactorSecret?: string;
  }): Promise<OrgPlatformConnection> {
    const { organizationId, userId, username, password, email, twoFactorSecret } = params;

    logger.info("[OrgPlatforms] Connecting Twitter account", {
      organizationId,
      username,
    });

    // Store credentials in secrets
    const passwordSecret = await secretsService.create(
      {
        organizationId,
        name: `TWITTER_PASSWORD_${username}`,
        value: password,
        scope: "project",
        projectType: "org-app",
        createdBy: userId,
      },
      SYSTEM_AUDIT
    );

    if (email) {
      await secretsService.create(
        {
          organizationId,
          name: `TWITTER_EMAIL_${username}`,
          value: email,
          scope: "project",
          projectType: "org-app",
          createdBy: userId,
        },
        SYSTEM_AUDIT
      );
    }

    if (twoFactorSecret) {
      await secretsService.create(
        {
          organizationId,
          name: `TWITTER_2FA_${username}`,
          value: twoFactorSecret,
          scope: "project",
          projectType: "org-app",
          createdBy: userId,
        },
        SYSTEM_AUDIT
      );
    }

    // Check for existing connection
    const existing = await db
      .select()
      .from(orgPlatformConnections)
      .where(
        and(
          eq(orgPlatformConnections.organization_id, organizationId),
          eq(orgPlatformConnections.platform, "twitter"),
          eq(orgPlatformConnections.platform_bot_username, username)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing connection
      const [updated] = await db
        .update(orgPlatformConnections)
        .set({
          status: "active",
          bot_token_secret_id: passwordSecret.id, // Store password secret ref
          error_message: null,
          disconnected_at: null,
          updated_at: new Date(),
        })
        .where(eq(orgPlatformConnections.id, existing[0].id))
        .returning();

      return updated;
    }

    // Create new connection
    const [connection] = await db
      .insert(orgPlatformConnections)
      .values({
        organization_id: organizationId,
        connected_by: userId,
        platform: "twitter",
        platform_bot_id: username, // Use username as ID for Twitter
        platform_bot_username: username,
        platform_bot_name: `@${username}`,
        status: "active",
        bot_token_secret_id: passwordSecret.id,
        metadata: {
          email: email || undefined,
          has2FA: !!twoFactorSecret,
        },
      })
      .returning();

    return connection;
  }

  /**
   * Disconnect a platform connection
   */
  async disconnect(connectionId: string, organizationId: string): Promise<void> {
    logger.info("[OrgPlatforms] Disconnecting platform", {
      connectionId,
      organizationId,
    });

    // Soft delete - mark as disconnected
    await db
      .update(orgPlatformConnections)
      .set({
        status: "disconnected",
        disconnected_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(
          eq(orgPlatformConnections.id, connectionId),
          eq(orgPlatformConnections.organization_id, organizationId)
        )
      );

    // Disable all servers for this connection
    await db
      .update(orgPlatformServers)
      .set({
        enabled: false,
        updated_at: new Date(),
      })
      .where(eq(orgPlatformServers.connection_id, connectionId));
  }

  /**
   * Get all platform connections for an organization
   */
  async getConnections(organizationId: string): Promise<OrgPlatformConnection[]> {
    return db
      .select()
      .from(orgPlatformConnections)
      .where(
        and(
          eq(orgPlatformConnections.organization_id, organizationId),
          isNull(orgPlatformConnections.disconnected_at)
        )
      )
      .orderBy(desc(orgPlatformConnections.connected_at));
  }

  /**
   * Get a specific platform connection
   */
  async getConnection(
    connectionId: string,
    organizationId: string
  ): Promise<OrgPlatformConnection | null> {
    const [connection] = await db
      .select()
      .from(orgPlatformConnections)
      .where(
        and(
          eq(orgPlatformConnections.id, connectionId),
          eq(orgPlatformConnections.organization_id, organizationId)
        )
      )
      .limit(1);

    return connection || null;
  }

  /**
   * Get connection by platform type
   */
  async getConnectionByPlatform(
    organizationId: string,
    platform: PlatformType
  ): Promise<OrgPlatformConnection | null> {
    const [connection] = await db
      .select()
      .from(orgPlatformConnections)
      .where(
        and(
          eq(orgPlatformConnections.organization_id, organizationId),
          eq(orgPlatformConnections.platform, platform),
          eq(orgPlatformConnections.status, "active")
        )
      )
      .limit(1);

    return connection || null;
  }

  // ===========================================================================
  // PLATFORM SERVERS/GROUPS
  // ===========================================================================

  /**
   * Sync Discord guilds for a connection
   */
  async syncDiscordGuilds(
    connectionId: string,
    organizationId: string
  ): Promise<OrgPlatformServer[]> {
    const connection = await this.getConnection(connectionId, organizationId);
    if (!connection || connection.platform !== "discord") {
      throw new Error("Invalid Discord connection");
    }

    // Get bot token from secrets
    const botToken = await secretsService.getDecryptedValue(
      connection.oauth_access_token_secret_id!,
      organizationId
    );

    // Fetch guilds from Discord
    const guilds = await getDiscordBotGuilds(botToken);

    logger.info("[OrgPlatforms] Syncing Discord guilds", {
      connectionId,
      guildCount: guilds.length,
    });

    // Upsert servers
    const servers: OrgPlatformServer[] = [];
    for (const guild of guilds) {
      const existing = await db
        .select()
        .from(orgPlatformServers)
        .where(
          and(
            eq(orgPlatformServers.connection_id, connectionId),
            eq(orgPlatformServers.server_id, guild.id)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const [updated] = await db
          .update(orgPlatformServers)
          .set({
            server_name: guild.name,
            server_icon: guild.icon
              ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
              : null,
            member_count: guild.approximate_member_count?.toString(),
            updated_at: new Date(),
          })
          .where(eq(orgPlatformServers.id, existing[0].id))
          .returning();

        servers.push(updated);
      } else {
        const [created] = await db
          .insert(orgPlatformServers)
          .values({
            connection_id: connectionId,
            organization_id: organizationId,
            server_id: guild.id,
            server_name: guild.name,
            server_icon: guild.icon
              ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
              : null,
            member_count: guild.approximate_member_count?.toString(),
            enabled: true,
          })
          .returning();

        servers.push(created);
      }
    }

    return servers;
  }

  /**
   * Add a Telegram group
   */
  async addTelegramGroup(
    connectionId: string,
    organizationId: string,
    chat: TelegramChat
  ): Promise<OrgPlatformServer> {
    const connection = await this.getConnection(connectionId, organizationId);
    if (!connection || connection.platform !== "telegram") {
      throw new Error("Invalid Telegram connection");
    }

    // Check for existing
    const existing = await db
      .select()
      .from(orgPlatformServers)
      .where(
        and(
          eq(orgPlatformServers.connection_id, connectionId),
          eq(orgPlatformServers.server_id, String(chat.id))
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(orgPlatformServers)
        .set({
          server_name: chat.title,
          updated_at: new Date(),
        })
        .where(eq(orgPlatformServers.id, existing[0].id))
        .returning();

      return updated;
    }

    const [server] = await db
      .insert(orgPlatformServers)
      .values({
        connection_id: connectionId,
        organization_id: organizationId,
        server_id: String(chat.id),
        server_name: chat.title,
        enabled: true,
      })
      .returning();

    return server;
  }

  /**
   * Get all servers for a connection
   */
  async getServers(connectionId: string): Promise<OrgPlatformServer[]> {
    return db
      .select()
      .from(orgPlatformServers)
      .where(eq(orgPlatformServers.connection_id, connectionId))
      .orderBy(desc(orgPlatformServers.created_at));
  }

  /**
   * Get all servers for an organization across all platforms
   */
  async getAllServers(organizationId: string): Promise<ServerWithConnection[]> {
    const results = await db
      .select()
      .from(orgPlatformServers)
      .innerJoin(
        orgPlatformConnections,
        eq(orgPlatformServers.connection_id, orgPlatformConnections.id)
      )
      .where(eq(orgPlatformServers.organization_id, organizationId))
      .orderBy(desc(orgPlatformServers.created_at));

    return results.map((row) => ({
      ...row.org_platform_servers,
      connection: row.org_platform_connections,
    }));
  }

  /**
   * Update server settings
   */
  async updateServer(
    serverId: string,
    organizationId: string,
    updates: Partial<NewOrgPlatformServer>
  ): Promise<OrgPlatformServer> {
    const [updated] = await db
      .update(orgPlatformServers)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(orgPlatformServers.id, serverId),
          eq(orgPlatformServers.organization_id, organizationId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error("Server not found");
    }

    return updated;
  }

  /**
   * Enable/disable a server
   */
  async setServerEnabled(
    serverId: string,
    organizationId: string,
    enabled: boolean
  ): Promise<OrgPlatformServer> {
    return this.updateServer(serverId, organizationId, { enabled });
  }

  /**
   * Update agent settings for a server
   */
  async updateAgentSettings(
    serverId: string,
    organizationId: string,
    agentSettings: OrgPlatformServer["agent_settings"]
  ): Promise<OrgPlatformServer> {
    return this.updateServer(serverId, organizationId, { agent_settings: agentSettings });
  }

  // ===========================================================================
  // HEALTH CHECKS
  // ===========================================================================

  /**
   * Check health of a platform connection
   */
  async checkConnectionHealth(
    connectionId: string,
    organizationId: string
  ): Promise<{ healthy: boolean; error?: string }> {
    const connection = await this.getConnection(connectionId, organizationId);
    if (!connection) {
      return { healthy: false, error: "Connection not found" };
    }

    try {
      if (connection.platform === "discord") {
        const token = await secretsService.getDecryptedValue(
          connection.oauth_access_token_secret_id!,
          organizationId
        );
        await validateDiscordBotToken(token);
      } else if (connection.platform === "telegram") {
        const token = await secretsService.getDecryptedValue(
          connection.bot_token_secret_id!,
          organizationId
        );
        await validateTelegramBotToken(token);
      }

      // Update last health check
      await db
        .update(orgPlatformConnections)
        .set({
          last_health_check: new Date(),
          status: "active",
          error_message: null,
        })
        .where(eq(orgPlatformConnections.id, connectionId));

      return { healthy: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await db
        .update(orgPlatformConnections)
        .set({
          last_health_check: new Date(),
          status: "error",
          error_message: errorMessage,
        })
        .where(eq(orgPlatformConnections.id, connectionId));

      return { healthy: false, error: errorMessage };
    }
  }

  /**
   * Get decrypted bot token for a connection
   */
  async getBotToken(
    connectionId: string,
    organizationId: string
  ): Promise<string> {
    const connection = await this.getConnection(connectionId, organizationId);
    if (!connection) {
      throw new Error("Connection not found");
    }

    const secretId =
      connection.platform === "discord"
        ? connection.oauth_access_token_secret_id
        : connection.bot_token_secret_id;

    if (!secretId) {
      throw new Error("No token stored for this connection");
    }

    return secretsService.getDecryptedValue(secretId, organizationId);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const botsService = new BotsService();

