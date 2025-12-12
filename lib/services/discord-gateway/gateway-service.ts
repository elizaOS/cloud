/**
 * Discord Gateway Service
 *
 * Core service for managing multi-tenant Discord bot connections.
 * Handles bot registration, status tracking, and coordination with gateway pods.
 */

import { logger } from "@/lib/utils/logger";
import {
  discordBotConnectionsRepository,
  discordEventRoutesRepository,
  discordEventQueueRepository,
} from "@/db/repositories/discord-gateway";
import { secretsService } from "@/lib/services/secrets";
import { cache } from "@/lib/cache/client";
import type {
  BotRegistrationRequest,
  BotRegistrationResult,
  BotStatus,
  GatewayHealth,
  ShardStatus,
  DiscordUser,
  DiscordGuild,
} from "./types";
import type {
  DiscordBotConnection,
  NewDiscordBotConnection,
  DiscordConnectionStatus,
} from "@/db/schemas/discord-gateway";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const CACHE_TTL = 300; // 5 minutes

/**
 * Discord Gateway Service
 *
 * Manages Discord bot connections for multi-tenant operation.
 */
export class DiscordGatewayService {
  private static instance: DiscordGatewayService;

  private constructor() {}

  static getInstance(): DiscordGatewayService {
    if (!DiscordGatewayService.instance) {
      DiscordGatewayService.instance = new DiscordGatewayService();
    }
    return DiscordGatewayService.instance;
  }

  // ===========================================================================
  // BOT REGISTRATION
  // ===========================================================================

  /**
   * Register a new Discord bot for an organization.
   */
  async registerBot(request: BotRegistrationRequest): Promise<BotRegistrationResult> {
    const { organizationId, platformConnectionId, botToken, applicationId, intents } = request;

    logger.info("[Discord Gateway] Registering bot", {
      organizationId,
      applicationId,
    });

    // Validate bot token by fetching current user
    const botUser = await this.validateBotToken(botToken);
    if (!botUser) {
      return {
        success: false,
        error: "Invalid bot token - unable to authenticate with Discord",
      };
    }

    // Check if connection already exists
    const existing = await discordBotConnectionsRepository.getByPlatformConnection(
      platformConnectionId
    );

    if (existing) {
      logger.info("[Discord Gateway] Updating existing bot connection", {
        connectionId: existing.id,
      });

      // Update existing connection
      await discordBotConnectionsRepository.updateStatus(existing.id, "disconnected", {
        errorMessage: undefined,
      });

      return {
        success: true,
        connectionId: existing.id,
        botUserId: botUser.id,
        botUsername: botUser.username,
      };
    }

    // Create new bot connection record
    const newConnection: NewDiscordBotConnection = {
      platform_connection_id: platformConnectionId,
      organization_id: organizationId,
      application_id: applicationId,
      bot_user_id: botUser.id,
      bot_username: botUser.username,
      shard_id: 0,
      shard_count: 1,
      status: "disconnected",
      intents: intents ?? 3276799, // Default intents
    };

    const connection = await discordBotConnectionsRepository.create(newConnection);

    // Store bot token in secrets service
    if (secretsService.isConfigured) {
      await secretsService.set({
        organizationId,
        key: `discord_bot_token_${connection.id}`,
        value: botToken,
        projectId: connection.id,
      });
    }

    logger.info("[Discord Gateway] Bot registered successfully", {
      connectionId: connection.id,
      botUserId: botUser.id,
      botUsername: botUser.username,
    });

    return {
      success: true,
      connectionId: connection.id,
      botUserId: botUser.id,
      botUsername: botUser.username,
    };
  }

  /**
   * Unregister a Discord bot.
   */
  async unregisterBot(connectionId: string): Promise<boolean> {
    logger.info("[Discord Gateway] Unregistering bot", { connectionId });

    const connection = await this.getConnection(connectionId);
    if (!connection) {
      return false;
    }

    // Delete bot token from secrets
    if (secretsService.isConfigured) {
      await secretsService.delete({
        organizationId: connection.organization_id,
        key: `discord_bot_token_${connectionId}`,
        projectId: connectionId,
      });
    }

    // Delete connection record
    await discordBotConnectionsRepository.delete(connectionId);

    // Invalidate cache
    await cache.del(`discord:bot:${connectionId}`);

    logger.info("[Discord Gateway] Bot unregistered", { connectionId });
    return true;
  }

  // ===========================================================================
  // STATUS & MONITORING
  // ===========================================================================

  /**
   * Get bot status for an organization.
   */
  async getBotStatus(organizationId: string): Promise<BotStatus[]> {
    const connections = await discordBotConnectionsRepository.listByOrganization(
      organizationId
    );

    return connections.map((conn) => this.connectionToStatus(conn));
  }

  /**
   * Get a single bot's status.
   */
  async getBotStatusById(connectionId: string): Promise<BotStatus | null> {
    const connection = await this.getConnection(connectionId);
    if (!connection) return null;
    return this.connectionToStatus(connection);
  }

  /**
   * Get gateway health status.
   */
  async getHealth(): Promise<GatewayHealth> {
    const connectedBots = await discordBotConnectionsRepository.listByStatus("connected");
    const disconnectedBots = await discordBotConnectionsRepository.listByStatus("disconnected");
    const allBots = [...connectedBots, ...disconnectedBots];
    
    // Get queue stats
    const queueStats = await discordEventQueueRepository.getStats();

    // Build shard status (group by pod)
    const podMap = new Map<string, DiscordBotConnection[]>();
    for (const bot of connectedBots) {
      if (bot.gateway_pod) {
        const existing = podMap.get(bot.gateway_pod) ?? [];
        existing.push(bot);
        podMap.set(bot.gateway_pod, existing);
      }
    }

    const shards: ShardStatus[] = Array.from(podMap.entries()).map(([podName, bots]) => {
      const totalGuilds = bots.reduce((sum, b) => sum + (b.guild_count ?? 0), 0);
      const oldestHeartbeat = bots.reduce(
        (oldest, b) => {
          if (!b.last_heartbeat) return oldest;
          if (!oldest) return b.last_heartbeat;
          return b.last_heartbeat < oldest ? b.last_heartbeat : oldest;
        },
        null as Date | null
      );

      // Determine health based on heartbeat age
      const heartbeatAge = oldestHeartbeat
        ? Date.now() - oldestHeartbeat.getTime()
        : Infinity;
      const status: ShardStatus["status"] =
        heartbeatAge < 60000 ? "healthy" : heartbeatAge < 300000 ? "degraded" : "unhealthy";

      return {
        shardId: bots[0]?.shard_id ?? 0,
        podName,
        botsCount: bots.length,
        guildsCount: totalGuilds,
        status,
        lastHeartbeat: oldestHeartbeat,
      };
    });

    const totalGuilds = allBots.reduce((sum, b) => sum + (b.guild_count ?? 0), 0);

    // Determine overall health
    const healthyShards = shards.filter((s) => s.status === "healthy").length;
    const overallStatus: GatewayHealth["status"] =
      disconnectedBots.length === 0 && healthyShards === shards.length
        ? "healthy"
        : healthyShards > 0
        ? "degraded"
        : "unhealthy";

    return {
      status: overallStatus,
      totalBots: allBots.length,
      connectedBots: connectedBots.length,
      disconnectedBots: disconnectedBots.length,
      totalGuilds,
      shards,
      queueStats: {
        pending: queueStats.pending,
        processing: queueStats.processing,
        deadLetter: queueStats.deadLetter,
      },
      lastCheck: new Date(),
    };
  }

  // ===========================================================================
  // CONNECTION MANAGEMENT (for gateway pods)
  // ===========================================================================

  /**
   * Get connection record by ID.
   */
  async getConnection(connectionId: string): Promise<DiscordBotConnection | null> {
    // Check cache first
    const cacheKey = `discord:bot:${connectionId}`;
    const cached = await cache.get<DiscordBotConnection>(cacheKey);
    if (cached) return cached;

    // Query database
    const connections = await discordBotConnectionsRepository.listByOrganization("");
    const connection = connections.find((c) => c.id === connectionId) ?? null;

    if (connection) {
      await cache.set(cacheKey, connection, CACHE_TTL);
    }

    return connection;
  }

  /**
   * Get bot token for a connection.
   */
  async getBotToken(connectionId: string): Promise<string | null> {
    const connection = await this.getConnection(connectionId);
    if (!connection) return null;

    if (!secretsService.isConfigured) {
      logger.warn("[Discord Gateway] Secrets service not configured");
      return null;
    }

    const secrets = await secretsService.getDecrypted({
      organizationId: connection.organization_id,
      projectId: connectionId,
    });

    return secrets[`discord_bot_token_${connectionId}`] ?? null;
  }

  /**
   * Update connection status (called by gateway pods).
   */
  async updateConnectionStatus(
    connectionId: string,
    status: DiscordConnectionStatus,
    options?: {
      errorMessage?: string;
      sessionId?: string;
      resumeGatewayUrl?: string;
      sequenceNumber?: number;
      gatewayPod?: string;
    }
  ): Promise<void> {
    await discordBotConnectionsRepository.updateStatus(connectionId, status, options);

    // Invalidate cache
    await cache.del(`discord:bot:${connectionId}`);

    logger.info("[Discord Gateway] Connection status updated", {
      connectionId,
      status,
      pod: options?.gatewayPod,
    });
  }

  /**
   * Record heartbeat from gateway pod.
   */
  async recordHeartbeat(connectionId: string, sequenceNumber?: number): Promise<void> {
    await discordBotConnectionsRepository.updateHeartbeat(connectionId, sequenceNumber);
  }

  /**
   * Update guild count.
   */
  async updateGuildCount(connectionId: string, guildCount: number): Promise<void> {
    await discordBotConnectionsRepository.updateGuildCount(connectionId, guildCount);

    // Invalidate cache
    await cache.del(`discord:bot:${connectionId}`);
  }

  /**
   * Increment event counters.
   */
  async incrementEventCounters(
    connectionId: string,
    received: number,
    routed: number
  ): Promise<void> {
    await discordBotConnectionsRepository.incrementEventCounters(connectionId, received, routed);
  }

  /**
   * Get connections that need to be picked up by a pod.
   */
  async getUnassignedConnections(): Promise<DiscordBotConnection[]> {
    return await discordBotConnectionsRepository.listUnassigned();
  }

  /**
   * Assign a pod to handle a connection.
   */
  async assignPod(connectionId: string, podName: string): Promise<boolean> {
    const result = await discordBotConnectionsRepository.assignPod(connectionId, podName);
    if (result) {
      await cache.del(`discord:bot:${connectionId}`);
    }
    return !!result;
  }

  /**
   * Get all connections assigned to a pod.
   */
  async getConnectionsByPod(podName: string): Promise<DiscordBotConnection[]> {
    return await discordBotConnectionsRepository.listByPod(podName);
  }

  // ===========================================================================
  // DISCORD API HELPERS
  // ===========================================================================

  /**
   * Validate a bot token by fetching the current user.
   */
  private async validateBotToken(token: string): Promise<DiscordUser | null> {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        Authorization: `Bot ${token}`,
      },
    });

    if (!response.ok) {
      logger.error("[Discord Gateway] Token validation failed", {
        status: response.status,
      });
      return null;
    }

    const user: DiscordUser = await response.json();

    if (!user.bot) {
      logger.error("[Discord Gateway] Token is not a bot token");
      return null;
    }

    return user;
  }

  /**
   * Get guilds the bot is in (requires valid token).
   */
  async getGuilds(connectionId: string): Promise<DiscordGuild[]> {
    const token = await this.getBotToken(connectionId);
    if (!token) return [];

    const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: {
        Authorization: `Bot ${token}`,
      },
    });

    if (!response.ok) {
      logger.error("[Discord Gateway] Failed to fetch guilds", {
        connectionId,
        status: response.status,
      });
      return [];
    }

    return await response.json();
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private connectionToStatus(conn: DiscordBotConnection): BotStatus {
    return {
      connectionId: conn.id,
      organizationId: conn.organization_id,
      status: conn.status,
      botUserId: conn.bot_user_id,
      botUsername: conn.bot_username,
      guildCount: conn.guild_count ?? 0,
      eventsReceived: Number(conn.events_received ?? 0),
      eventsRouted: Number(conn.events_routed ?? 0),
      lastHeartbeat: conn.last_heartbeat,
      lastEventAt: conn.last_event_at,
      connectedAt: conn.connected_at,
      gatewayPod: conn.gateway_pod,
      shardId: conn.shard_id ?? 0,
      shardCount: conn.shard_count ?? 1,
    };
  }
}

// Export singleton instance
export const discordGatewayService = DiscordGatewayService.getInstance();
