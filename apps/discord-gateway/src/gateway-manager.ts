/**
 * Gateway Manager
 *
 * Manages multiple Discord bot connections for multi-tenant operation.
 */

import { Client, GatewayIntentBits, Events, Message, type ClientOptions } from "discord.js";
import { Redis } from "@upstash/redis";
import { logger } from "./logger";

interface GatewayConfig {
  podName: string;
  elizaCloudUrl: string;
  internalApiKey: string;
  redisUrl?: string;
  redisToken?: string;
}

interface BotConnection {
  connectionId: string;
  organizationId: string;
  applicationId: string;
  client: Client;
  status: "connecting" | "connected" | "disconnected" | "error";
  guildCount: number;
  eventsReceived: number;
  eventsRouted: number;
  lastHeartbeat: Date;
  connectedAt?: Date;
  error?: string;
}

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  podName: string;
  totalBots: number;
  connectedBots: number;
  disconnectedBots: number;
  totalGuilds: number;
  uptime: number;
}

export class GatewayManager {
  private config: GatewayConfig;
  private redis: Redis | null = null;
  private connections: Map<string, BotConnection> = new Map();
  private startTime: Date = new Date();
  private pollInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config: GatewayConfig) {
    this.config = config;

    if (config.redisUrl && config.redisToken) {
      this.redis = new Redis({ url: config.redisUrl, token: config.redisToken });
    } else if (config.redisUrl) {
      this.redis = Redis.fromEnv();
    }
  }

  async start(): Promise<void> {
    logger.info("Starting gateway manager", { podName: this.config.podName });

    // Start polling for assigned bots
    await this.pollForBots();
    this.pollInterval = setInterval(() => this.pollForBots(), 30000);

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 30000);

    logger.info("Gateway manager started");
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down gateway manager");

    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    // Save session state and disconnect all bots
    for (const [connectionId, conn] of this.connections) {
      await this.saveSessionState(connectionId, conn);
      conn.client.destroy();
      logger.info("Disconnected bot", { connectionId });
    }

    this.connections.clear();
    logger.info("Gateway manager shutdown complete");
  }

  private async pollForBots(): Promise<void> {
    const response = await fetch(
      `${this.config.elizaCloudUrl}/api/internal/discord/gateway/assignments?pod=${this.config.podName}`,
      {
        headers: {
          "X-Internal-API-Key": this.config.internalApiKey,
        },
      }
    );

    if (!response.ok) {
      logger.warn("Failed to poll for bot assignments", { status: response.status });
      return;
    }

    const data = await response.json() as {
      assignments: Array<{
        connectionId: string;
        organizationId: string;
        applicationId: string;
        botToken: string;
        intents: number;
      }>;
    };

    for (const assignment of data.assignments) {
      if (!this.connections.has(assignment.connectionId)) {
        await this.connectBot(assignment);
      }
    }

    // Disconnect bots no longer assigned
    const assignedIds = new Set(data.assignments.map((a) => a.connectionId));
    for (const [connectionId, conn] of this.connections) {
      if (!assignedIds.has(connectionId)) {
        await this.disconnectBot(connectionId);
      }
    }
  }

  private async connectBot(assignment: {
    connectionId: string;
    organizationId: string;
    applicationId: string;
    botToken: string;
    intents: number;
  }): Promise<void> {
    logger.info("Connecting bot", {
      connectionId: assignment.connectionId,
      applicationId: assignment.applicationId,
    });

    const clientOptions: ClientOptions = {
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
      ],
    };

    const client = new Client(clientOptions);
    const conn: BotConnection = {
      connectionId: assignment.connectionId,
      organizationId: assignment.organizationId,
      applicationId: assignment.applicationId,
      client,
      status: "connecting",
      guildCount: 0,
      eventsReceived: 0,
      eventsRouted: 0,
      lastHeartbeat: new Date(),
    };

    this.connections.set(assignment.connectionId, conn);

    client.on(Events.ClientReady, async () => {
      conn.status = "connected";
      conn.connectedAt = new Date();
      conn.guildCount = client.guilds.cache.size;
      logger.info("Bot connected", {
        connectionId: assignment.connectionId,
        guildCount: conn.guildCount,
        username: client.user?.username,
      });
      await this.updateConnectionStatus(assignment.connectionId, "connected");
    });

    client.on(Events.MessageCreate, async (message) => {
      conn.eventsReceived++;
      await this.handleMessage(assignment.connectionId, message);
    });

    client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
      conn.eventsReceived++;
      if (newMessage.partial) return;
      await this.forwardEvent(assignment.connectionId, conn, "MESSAGE_UPDATE", {
        id: newMessage.id,
        channel_id: newMessage.channelId,
        guild_id: newMessage.guildId,
        content: newMessage.content,
        edited_timestamp: newMessage.editedAt?.toISOString(),
        author: newMessage.author ? {
          id: newMessage.author.id,
          username: newMessage.author.username,
          bot: newMessage.author.bot,
        } : undefined,
      });
    });

    client.on(Events.MessageDelete, async (message) => {
      conn.eventsReceived++;
      await this.forwardEvent(assignment.connectionId, conn, "MESSAGE_DELETE", {
        id: message.id,
        channel_id: message.channelId,
        guild_id: message.guildId,
      });
    });

    client.on(Events.MessageReactionAdd, async (reaction, user) => {
      conn.eventsReceived++;
      await this.forwardEvent(assignment.connectionId, conn, "MESSAGE_REACTION_ADD", {
        message_id: reaction.message.id,
        channel_id: reaction.message.channelId,
        guild_id: reaction.message.guildId,
        emoji: { name: reaction.emoji.name, id: reaction.emoji.id },
        user_id: user.id,
      });
    });

    client.on(Events.GuildMemberAdd, async (member) => {
      conn.eventsReceived++;
      await this.forwardEvent(assignment.connectionId, conn, "GUILD_MEMBER_ADD", {
        guild_id: member.guild.id,
        user: {
          id: member.user.id,
          username: member.user.username,
          discriminator: member.user.discriminator,
          avatar: member.user.avatar,
          bot: member.user.bot,
        },
        nick: member.nickname,
        roles: member.roles.cache.map((r) => r.id),
        joined_at: member.joinedAt?.toISOString(),
      });
    });

    client.on(Events.GuildMemberRemove, async (member) => {
      conn.eventsReceived++;
      await this.forwardEvent(assignment.connectionId, conn, "GUILD_MEMBER_REMOVE", {
        guild_id: member.guild.id,
        user: {
          id: member.user.id,
          username: member.user.username,
          bot: member.user.bot,
        },
      });
    });

    client.on(Events.InteractionCreate, async (interaction) => {
      conn.eventsReceived++;
      await this.forwardEvent(assignment.connectionId, conn, "INTERACTION_CREATE", {
        id: interaction.id,
        type: interaction.type,
        channel_id: interaction.channelId,
        guild_id: interaction.guildId,
        user: {
          id: interaction.user.id,
          username: interaction.user.username,
          bot: interaction.user.bot,
        },
        data: "commandName" in interaction ? {
          name: interaction.commandName,
          options: "options" in interaction ? interaction.options.data : undefined,
        } : undefined,
      });
    });

    client.on(Events.Error, async (error) => {
      conn.status = "error";
      conn.error = error.message;
      logger.error("Bot error", { connectionId: assignment.connectionId, error: error.message });
      await this.updateConnectionStatus(assignment.connectionId, "error", error.message);
    });

    client.on(Events.ShardDisconnect, async () => {
      conn.status = "disconnected";
      logger.warn("Bot disconnected", { connectionId: assignment.connectionId });
      await this.updateConnectionStatus(assignment.connectionId, "disconnected");
    });

    client.on(Events.ShardReconnecting, () => {
      conn.status = "connecting";
      logger.info("Bot reconnecting", { connectionId: assignment.connectionId });
    });

    await client.login(assignment.botToken);
  }

  private async disconnectBot(connectionId: string): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    logger.info("Disconnecting bot", { connectionId });
    await this.saveSessionState(connectionId, conn);
    conn.client.destroy();
    this.connections.delete(connectionId);
    await this.updateConnectionStatus(connectionId, "disconnected");
  }

  private async handleMessage(connectionId: string, message: Message): Promise<void> {
    if (message.author.bot) return;

    const conn = this.connections.get(connectionId);
    if (!conn) return;

    await this.forwardEvent(connectionId, conn, "MESSAGE_CREATE", {
      id: message.id,
      channel_id: message.channelId,
      guild_id: message.guildId,
      author: {
        id: message.author.id,
        username: message.author.username,
        discriminator: message.author.discriminator,
        avatar: message.author.avatar,
        bot: message.author.bot,
        global_name: message.author.globalName,
      },
      member: message.member
        ? { nick: message.member.nickname, roles: message.member.roles.cache.map((r) => r.id) }
        : undefined,
      content: message.content,
      timestamp: message.createdAt.toISOString(),
      attachments: message.attachments.map((a) => ({
        id: a.id,
        filename: a.name,
        url: a.url,
        content_type: a.contentType,
        size: a.size,
      })),
      embeds: message.embeds.map((e) => ({
        title: e.title,
        description: e.description,
        url: e.url,
        color: e.color,
      })),
      mentions: message.mentions.users.map((u) => ({ id: u.id, username: u.username, bot: u.bot })),
      referenced_message: message.reference ? { id: message.reference.messageId } : undefined,
    });
  }

  private async forwardEvent(
    connectionId: string,
    conn: BotConnection,
    eventType: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const payload = {
      connection_id: connectionId,
      organization_id: conn.organizationId,
      platform_connection_id: connectionId,
      event_type: eventType,
      event_id: (data.id as string) ?? `${eventType}-${Date.now()}`,
      guild_id: (data.guild_id as string) ?? "",
      channel_id: (data.channel_id as string) ?? "",
      data,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(`${this.config.elizaCloudUrl}/api/internal/discord/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-API-Key": this.config.internalApiKey,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      conn.eventsRouted++;
    } else {
      logger.warn("Failed to forward event", { connectionId, eventType, status: response.status });
    }
  }

  private async updateConnectionStatus(
    connectionId: string,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    await fetch(
      `${this.config.elizaCloudUrl}/api/internal/discord/gateway/status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-API-Key": this.config.internalApiKey,
        },
        body: JSON.stringify({
          connection_id: connectionId,
          pod_name: this.config.podName,
          status,
          error_message: errorMessage,
        }),
      }
    );
  }

  private async saveSessionState(connectionId: string, conn: BotConnection): Promise<void> {
    if (!this.redis) return;

    const state = {
      connectionId,
      organizationId: conn.organizationId,
      applicationId: conn.applicationId,
      podId: this.config.podName,
      guildCount: conn.guildCount,
      eventsReceived: conn.eventsReceived,
      eventsRouted: conn.eventsRouted,
      savedAt: Date.now(),
    };

    await this.redis.setex(`discord:session:${connectionId}`, 3600, JSON.stringify(state));
  }

  private async sendHeartbeat(): Promise<void> {
    for (const [connectionId, conn] of this.connections) {
      conn.lastHeartbeat = new Date();
    }

    if (this.redis) {
      const podState = {
        podId: this.config.podName,
        connections: Array.from(this.connections.keys()),
        lastHeartbeat: Date.now(),
      };
      await this.redis.setex(`discord:pod:${this.config.podName}`, 300, JSON.stringify(podState));
    }
  }

  getHealth(): HealthStatus {
    const totalBots = this.connections.size;
    const connectedBots = Array.from(this.connections.values()).filter(
      (c) => c.status === "connected"
    ).length;
    const disconnectedBots = totalBots - connectedBots;
    const totalGuilds = Array.from(this.connections.values()).reduce(
      (sum, c) => sum + c.guildCount,
      0
    );

    let status: HealthStatus["status"] = "healthy";
    if (totalBots > 0 && connectedBots === 0) {
      status = "unhealthy";
    } else if (disconnectedBots > 0) {
      status = "degraded";
    }

    return {
      status,
      podName: this.config.podName,
      totalBots,
      connectedBots,
      disconnectedBots,
      totalGuilds,
      uptime: Date.now() - this.startTime.getTime(),
    };
  }

  getMetrics(): string {
    const health = this.getHealth();
    const lines: string[] = [
      `# HELP discord_gateway_bots_total Total number of bots managed by this pod`,
      `# TYPE discord_gateway_bots_total gauge`,
      `discord_gateway_bots_total{pod="${this.config.podName}"} ${health.totalBots}`,
      `# HELP discord_gateway_bots_connected Number of connected bots`,
      `# TYPE discord_gateway_bots_connected gauge`,
      `discord_gateway_bots_connected{pod="${this.config.podName}"} ${health.connectedBots}`,
      `# HELP discord_gateway_guilds_total Total number of guilds`,
      `# TYPE discord_gateway_guilds_total gauge`,
      `discord_gateway_guilds_total{pod="${this.config.podName}"} ${health.totalGuilds}`,
      `# HELP discord_gateway_uptime_seconds Gateway uptime in seconds`,
      `# TYPE discord_gateway_uptime_seconds gauge`,
      `discord_gateway_uptime_seconds{pod="${this.config.podName}"} ${Math.floor(health.uptime / 1000)}`,
    ];

    for (const [connectionId, conn] of this.connections) {
      lines.push(
        `# HELP discord_gateway_events_received Total events received`,
        `discord_gateway_events_received{connection="${connectionId}"} ${conn.eventsReceived}`,
        `discord_gateway_events_routed{connection="${connectionId}"} ${conn.eventsRouted}`
      );
    }

    return lines.join("\n");
  }

  getStatus(): Record<string, unknown> {
    return {
      podName: this.config.podName,
      startTime: this.startTime.toISOString(),
      uptime: Date.now() - this.startTime.getTime(),
      connections: Array.from(this.connections.entries()).map(([id, conn]) => ({
        connectionId: id,
        organizationId: conn.organizationId,
        applicationId: conn.applicationId,
        status: conn.status,
        guildCount: conn.guildCount,
        eventsReceived: conn.eventsReceived,
        eventsRouted: conn.eventsRouted,
        lastHeartbeat: conn.lastHeartbeat.toISOString(),
        connectedAt: conn.connectedAt?.toISOString(),
        error: conn.error,
      })),
    };
  }
}

