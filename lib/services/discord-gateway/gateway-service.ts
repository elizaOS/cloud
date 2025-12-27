import { logger } from "@/lib/utils/logger";
import {
  discordBotConnectionsRepository,
  discordEventQueueRepository,
} from "@/db/repositories/discord-gateway";
import {
  secretsService,
  loadSecrets,
  isSecretsConfigured,
} from "@/lib/services/secrets";
import { cache } from "@/lib/cache/client";
import { DISCORD_API_BASE, discordBotHeaders } from "@/lib/utils/discord-api";
import {
  DEFAULT_INTENTS,
  type BotRegistrationRequest,
  type BotRegistrationResult,
  type BotStatus,
  type GatewayHealth,
  type ShardStatus,
  type DiscordUser,
  type DiscordGuild,
} from "./types";
import type {
  DiscordBotConnection,
  NewDiscordBotConnection,
  DiscordConnectionStatus,
} from "@/db/schemas/discord-gateway";

const CACHE_TTL = 300;
const CACHE_KEY_PREFIX = "discord:bot:";

export class DiscordGatewayService {
  private static instance: DiscordGatewayService;

  private constructor() {}

  static getInstance(): DiscordGatewayService {
    if (!DiscordGatewayService.instance) {
      DiscordGatewayService.instance = new DiscordGatewayService();
    }
    return DiscordGatewayService.instance;
  }

  async registerBot(
    request: BotRegistrationRequest,
  ): Promise<BotRegistrationResult> {
    const {
      organizationId,
      platformConnectionId,
      botToken,
      applicationId,
      intents,
    } = request;

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
    const existing =
      await discordBotConnectionsRepository.getByPlatformConnection(
        platformConnectionId,
      );

    if (existing) {
      logger.info("[Discord Gateway] Updating existing bot connection", {
        connectionId: existing.id,
      });

      // Update existing connection
      await discordBotConnectionsRepository.updateStatus(
        existing.id,
        "disconnected",
        {
          errorMessage: undefined,
        },
      );

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
      intents: intents ?? DEFAULT_INTENTS,
    };

    const connection =
      await discordBotConnectionsRepository.create(newConnection);

    // Store bot token in secrets service
    if (isSecretsConfigured()) {
      await secretsService.create(
        {
          organizationId,
          name: `discord_bot_token_${connection.id}`,
          value: botToken,
          scope: "project",
          projectId: connection.id,
          projectType: "mcp", // Using mcp as closest match for discord connections
          createdBy: "discord-gateway",
        },
        { actorType: "system", actorId: "discord-gateway", source: "discord" },
      );
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

  async unregisterBot(connectionId: string): Promise<boolean> {
    logger.info("[Discord Gateway] Unregistering bot", { connectionId });

    const connection = await this.getConnection(connectionId);
    if (!connection) {
      return false;
    }

    // Delete bot token from secrets
    if (isSecretsConfigured()) {
      const secrets = await secretsService.list(connection.organization_id);
      const tokenSecret = secrets.find(
        (s) => s.name === `discord_bot_token_${connectionId}`,
      );
      if (tokenSecret) {
        await secretsService.delete(
          tokenSecret.id,
          connection.organization_id,
          {
            actorType: "system",
            actorId: "discord-gateway",
            source: "discord",
          },
        );
      }
    }

    // Delete connection record
    await discordBotConnectionsRepository.delete(connectionId);

    // Invalidate cache
    await this.invalidateConnectionCache(connectionId);

    logger.info("[Discord Gateway] Bot unregistered", { connectionId });
    return true;
  }

  async getBotStatus(organizationId: string): Promise<BotStatus[]> {
    const connections =
      await discordBotConnectionsRepository.listByOrganization(organizationId);

    return connections.map((conn) => this.connectionToStatus(conn));
  }

  async getBotStatusById(connectionId: string): Promise<BotStatus | null> {
    const connection = await this.getConnection(connectionId);
    if (!connection) return null;
    return this.connectionToStatus(connection);
  }

  async getHealth(): Promise<GatewayHealth> {
    const [
      connectedBots,
      disconnectedBots,
      startingBots,
      reconnectingBots,
      errorBots,
      queueStats,
    ] = await Promise.all([
      discordBotConnectionsRepository.listByStatus("connected"),
      discordBotConnectionsRepository.listByStatus("disconnected"),
      discordBotConnectionsRepository.listByStatus("starting"),
      discordBotConnectionsRepository.listByStatus("reconnecting"),
      discordBotConnectionsRepository.listByStatus("error"),
      discordEventQueueRepository.getStats(),
    ]);

    const allBots = [
      ...connectedBots,
      ...disconnectedBots,
      ...startingBots,
      ...reconnectingBots,
      ...errorBots,
    ];
    const notConnectedCount =
      disconnectedBots.length +
      startingBots.length +
      reconnectingBots.length +
      errorBots.length;
    const totalGuilds = allBots.reduce(
      (sum, b) => sum + (b.guild_count ?? 0),
      0,
    );

    // Group connected bots by pod
    const podMap = Map.groupBy(
      connectedBots.filter((b) => b.gateway_pod),
      (b) => b.gateway_pod!,
    );

    const shards: ShardStatus[] = [...podMap.entries()].map(
      ([podName, bots]) => {
        const guildsCount = bots.reduce(
          (sum, b) => sum + (b.guild_count ?? 0),
          0,
        );
        const heartbeats = bots
          .map((b) => b.last_heartbeat)
          .filter(Boolean) as Date[];
        const oldestHeartbeat = heartbeats.length
          ? new Date(Math.min(...heartbeats.map((d) => d.getTime())))
          : null;
        const heartbeatAge = oldestHeartbeat
          ? Date.now() - oldestHeartbeat.getTime()
          : Infinity;

        return {
          shardId: bots[0]?.shard_id ?? 0,
          podName,
          botsCount: bots.length,
          guildsCount,
          status:
            heartbeatAge < 60000
              ? "healthy"
              : heartbeatAge < 300000
                ? "degraded"
                : "unhealthy",
          lastHeartbeat: oldestHeartbeat,
        };
      },
    );

    const healthyShards = shards.filter((s) => s.status === "healthy").length;
    const status: GatewayHealth["status"] =
      notConnectedCount === 0 && healthyShards === shards.length
        ? "healthy"
        : healthyShards > 0
          ? "degraded"
          : "unhealthy";

    return {
      status,
      totalBots: allBots.length,
      connectedBots: connectedBots.length,
      disconnectedBots: notConnectedCount,
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

  private async invalidateConnectionCache(connectionId: string): Promise<void> {
    await cache.del(`${CACHE_KEY_PREFIX}${connectionId}`);
  }

  async getConnection(
    connectionId: string,
  ): Promise<DiscordBotConnection | null> {
    const cacheKey = `${CACHE_KEY_PREFIX}${connectionId}`;
    const cached = await cache.get<DiscordBotConnection>(cacheKey);
    if (cached) return cached;

    const connection =
      await discordBotConnectionsRepository.getById(connectionId);
    if (connection) {
      await cache.set(cacheKey, connection, CACHE_TTL);
    }
    return connection;
  }

  async getBotToken(connectionId: string): Promise<string | null> {
    const connection = await this.getConnection(connectionId);
    if (!connection) {
      logger.warn("[Discord Gateway] Cannot get token - connection not found", {
        connectionId,
      });
      return null;
    }

    if (!isSecretsConfigured()) {
      logger.warn(
        "[Discord Gateway] Cannot get token - secrets service not configured",
        { connectionId },
      );
      return null;
    }

    const secrets = await loadSecrets({
      organizationId: connection.organization_id,
      projectId: connectionId,
      projectType: "mcp", // Match the projectType used when storing the token
    });

    const token = secrets[`discord_bot_token_${connectionId}`];
    if (!token) {
      logger.warn("[Discord Gateway] Bot token not found in secrets", {
        connectionId,
      });
      return null;
    }

    return token;
  }

  async updateConnectionStatus(
    connectionId: string,
    status: DiscordConnectionStatus,
    options?: {
      errorMessage?: string;
      sessionId?: string;
      resumeGatewayUrl?: string;
      sequenceNumber?: number;
      gatewayPod?: string;
    },
  ): Promise<void> {
    await discordBotConnectionsRepository.updateStatus(
      connectionId,
      status,
      options,
    );

    // Invalidate cache
    await this.invalidateConnectionCache(connectionId);

    logger.info("[Discord Gateway] Connection status updated", {
      connectionId,
      status,
      pod: options?.gatewayPod,
    });
  }

  async recordHeartbeat(
    connectionId: string,
    sequenceNumber?: number,
  ): Promise<void> {
    await discordBotConnectionsRepository.updateHeartbeat(
      connectionId,
      sequenceNumber,
    );
  }

  async updateGuildCount(
    connectionId: string,
    guildCount: number,
  ): Promise<void> {
    await discordBotConnectionsRepository.updateGuildCount(
      connectionId,
      guildCount,
    );

    // Invalidate cache
    await this.invalidateConnectionCache(connectionId);
  }

  async incrementEventCounters(
    connectionId: string,
    received: number,
    routed: number,
  ): Promise<void> {
    await discordBotConnectionsRepository.incrementEventCounters(
      connectionId,
      received,
      routed,
    );
  }

  async getUnassignedConnections(): Promise<DiscordBotConnection[]> {
    return await discordBotConnectionsRepository.listUnassigned();
  }

  async assignPod(connectionId: string, podName: string): Promise<boolean> {
    const result = await discordBotConnectionsRepository.assignPod(
      connectionId,
      podName,
    );
    if (result) {
      await this.invalidateConnectionCache(connectionId);
    }
    return !!result;
  }

  async getConnectionsByPod(podName: string): Promise<DiscordBotConnection[]> {
    return await discordBotConnectionsRepository.listByPod(podName);
  }

  private async validateBotToken(token: string): Promise<DiscordUser | null> {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: discordBotHeaders(token),
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

  async getGuilds(connectionId: string): Promise<DiscordGuild[]> {
    const token = await this.getBotToken(connectionId);
    if (!token) return [];

    const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: discordBotHeaders(token),
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

export const discordGatewayService = DiscordGatewayService.getInstance();
