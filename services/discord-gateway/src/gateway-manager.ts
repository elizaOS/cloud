import {
  Client,
  GatewayIntentBits,
  Events,
  Message,
  type ClientOptions,
} from "discord.js";
import { Redis } from "@upstash/redis";
import { logger } from "./logger";
import {
  VoiceMessageHandler,
  hasVoiceAttachments,
} from "./voice-message-handler";

// ============================================
// Constants
// ============================================

/** Discord intents: GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT | GUILD_MESSAGE_REACTIONS | DIRECT_MESSAGES */
const DEFAULT_DISCORD_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.DirectMessages,
];

/** Interval between polling for bot assignments (30 seconds) */
const BOT_POLL_INTERVAL_MS = 30_000;

/** Interval between heartbeats to Redis (15 seconds) */
const HEARTBEAT_INTERVAL_MS = 15_000;

/** HTTP request timeout (10 seconds) */
const HTTP_TIMEOUT_MS = 10_000;

/** Redis pod state TTL (5 minutes) */
const POD_STATE_TTL_SECONDS = 300;

/** Redis session state TTL (1 hour) */
const SESSION_STATE_TTL_SECONDS = 3600;

/** Maximum Discord message content length */
const MAX_DISCORD_MESSAGE_LENGTH = 2000;

/**
 * Failover timing configuration.
 *
 * Maximum failover latency = DEAD_POD_THRESHOLD_MS + FAILOVER_CHECK_INTERVAL_MS
 *
 * With defaults (45s threshold + 30s check):
 * - Best case: Pod dies right before check → ~45s failover
 * - Worst case: Pod dies right after check → ~75s failover
 *
 * Tradeoffs:
 * - Lower values = faster failover but more false positives during network blips
 * - Higher values = fewer false positives but longer message gaps
 *
 * The threshold should be at least 2x heartbeat interval to avoid false positives.
 */
const FAILOVER_CHECK_INTERVAL_MS = parseInt(
  process.env.FAILOVER_CHECK_INTERVAL_MS ?? "30000", // 30 seconds
  10,
);

const DEAD_POD_THRESHOLD_MS = parseInt(
  process.env.DEAD_POD_THRESHOLD_MS ?? "45000", // 45 seconds (3 missed heartbeats)
  10,
);

// ============================================
// Types
// ============================================

/**
 * Escape a string for use in Prometheus label values.
 * Escapes backslashes, newlines, and double quotes per Prometheus exposition format.
 */
const escapePrometheusLabel = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');

const metric = (
  name: string,
  type: string,
  help: string,
  pod: string,
  value: number,
): string => {
  const escapedPod = escapePrometheusLabel(pod);
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name}{pod="${escapedPod}"} ${value}`;
};

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
  eventsFailed: number;
  consecutiveFailures: number;
  lastHeartbeat: Date;
  connectedAt?: Date;
  error?: string;
  // Store listener references for cleanup
  listeners: Map<string, (...args: unknown[]) => void>;
}

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  podName: string;
  totalBots: number;
  connectedBots: number;
  disconnectedBots: number;
  totalGuilds: number;
  uptime: number;
  controlPlane: {
    consecutiveFailures: number;
    lastSuccessfulPoll: string | null;
    healthy: boolean;
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Fetch with timeout support.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = HTTP_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// Gateway Manager
// ============================================

export class GatewayManager {
  private config: GatewayConfig;
  private redis: Redis | null = null;
  private connections: Map<string, BotConnection> = new Map();
  private startTime: Date = new Date();
  private pollInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private failoverInterval: NodeJS.Timeout | null = null;
  private voiceHandler: VoiceMessageHandler;
  private consecutivePollFailures: number = 0;
  private lastSuccessfulPoll: Date | null = null;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.voiceHandler = new VoiceMessageHandler();

    // Initialize Redis for failover coordination
    // Requires both URL and token, or falls back to environment variables
    if (config.redisUrl && config.redisToken) {
      this.redis = new Redis({
        url: config.redisUrl,
        token: config.redisToken,
      });
    } else if (
      process.env.KV_REST_API_URL &&
      process.env.KV_REST_API_TOKEN
    ) {
      // Fall back to environment variables if explicit config not provided
      this.redis = Redis.fromEnv();
    } else if (config.redisUrl) {
      // URL provided but no token - log warning and skip Redis
      logger.warn(
        "Redis URL provided without token - failover disabled. Set KV_REST_API_TOKEN or redisToken.",
      );
    }
  }

  async start(): Promise<void> {
    logger.info("Starting gateway manager", { podName: this.config.podName });

    // Start polling for assigned bots
    await this.pollForBots();
    this.pollInterval = setInterval(() => {
      this.pollForBots().catch((error) => {
        logger.error("Error in pollForBots interval", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, BOT_POLL_INTERVAL_MS);

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat().catch((error) => {
        logger.error("Error in sendHeartbeat interval", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, HEARTBEAT_INTERVAL_MS);

    // Start failover check (claim orphaned connections from dead pods)
    if (this.redis) {
      this.failoverInterval = setInterval(() => {
        this.checkForDeadPods().catch((error) => {
          logger.error("Error in checkForDeadPods interval", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }, FAILOVER_CHECK_INTERVAL_MS);
      logger.info("Failover monitoring enabled", {
        intervalMs: FAILOVER_CHECK_INTERVAL_MS,
      });
    }

    // Start voice message cleanup job
    const voiceMessageEnabled = process.env.VOICE_MESSAGE_ENABLED !== "false";
    if (voiceMessageEnabled) {
      this.voiceHandler.startCleanupJob();
      logger.info("Voice message handling enabled");
    }

    logger.info("Gateway manager started");
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down gateway manager");

    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.failoverInterval) clearInterval(this.failoverInterval);
    this.voiceHandler.stopCleanupJob();

    // Save session state and disconnect all bots
    for (const [connectionId, conn] of this.connections) {
      await this.saveSessionState(connectionId, conn);
      this.removeAllListeners(conn);
      conn.client.destroy();
      logger.info("Disconnected bot", { connectionId });
    }

    // Clear pod heartbeat from Redis
    if (this.redis) {
      await this.redis.del(`discord:pod:${this.config.podName}`);
      await this.redis.srem("discord:active_pods", this.config.podName);
    }

    this.connections.clear();
    logger.info("Gateway manager shutdown complete");
  }

  private removeAllListeners(conn: BotConnection): void {
    for (const [event, listener] of conn.listeners) {
      conn.client.removeListener(event, listener);
    }
    conn.listeners.clear();
  }

  private async pollForBots(): Promise<void> {
    try {
      const response = await fetchWithTimeout(
        `${this.config.elizaCloudUrl}/api/internal/discord/gateway/assignments?pod=${this.config.podName}`,
        {
          headers: {
            "X-Internal-API-Key": this.config.internalApiKey,
          },
        },
      );

      if (!response.ok) {
        this.consecutivePollFailures++;
        logger.warn("Failed to poll for bot assignments", {
          status: response.status,
          consecutiveFailures: this.consecutivePollFailures,
        });
        this.logControlPlaneHealth();
        return;
      }

      // Success - reset failure counter
      this.consecutivePollFailures = 0;
      this.lastSuccessfulPoll = new Date();

      const data = (await response.json()) as {
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
      for (const [connectionId] of this.connections) {
        if (!assignedIds.has(connectionId)) {
          await this.disconnectBot(connectionId);
        }
      }
    } catch (error) {
      this.consecutivePollFailures++;
      logger.error("Error polling for bots", {
        error: error instanceof Error ? error.message : String(error),
        consecutiveFailures: this.consecutivePollFailures,
      });
      this.logControlPlaneHealth();
    }
  }

  private logControlPlaneHealth(): void {
    const CRITICAL_FAILURE_THRESHOLD = 5;
    if (this.consecutivePollFailures >= CRITICAL_FAILURE_THRESHOLD) {
      logger.error("CRITICAL: Lost connection to control plane", {
        consecutiveFailures: this.consecutivePollFailures,
        lastSuccessfulPoll: this.lastSuccessfulPoll?.toISOString() ?? "never",
        controlPlaneUrl: this.config.elizaCloudUrl,
      });
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
      intents: assignment.intents || DEFAULT_DISCORD_INTENTS,
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
      eventsFailed: 0,
      consecutiveFailures: 0,
      lastHeartbeat: new Date(),
      listeners: new Map(),
    };

    this.connections.set(assignment.connectionId, conn);

    // Create wrapped handlers with error boundaries
    const createHandler = <T extends unknown[]>(
      eventName: string,
      handler: (...args: T) => Promise<void>,
    ) => {
      const wrappedHandler = async (...args: T) => {
        try {
          await handler(...args);
        } catch (error) {
          logger.error(`Error in ${eventName} handler`, {
            connectionId: assignment.connectionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      };
      conn.listeners.set(eventName, wrappedHandler as (...args: unknown[]) => void);
      return wrappedHandler;
    };

    client.on(
      Events.ClientReady,
      createHandler(Events.ClientReady, async () => {
        conn.status = "connected";
        conn.connectedAt = new Date();
        conn.guildCount = client.guilds.cache.size;
        logger.info("Bot connected", {
          connectionId: assignment.connectionId,
          guildCount: conn.guildCount,
          username: client.user?.username,
        });
        await this.updateConnectionStatus(assignment.connectionId, "connected");
      }),
    );

    client.on(
      Events.MessageCreate,
      createHandler(Events.MessageCreate, async (message: Message) => {
        conn.eventsReceived++;
        await this.handleMessage(assignment.connectionId, message);
      }),
    );

    client.on(
      Events.MessageUpdate,
      createHandler(Events.MessageUpdate, async (_oldMessage, newMessage) => {
        conn.eventsReceived++;
        if (newMessage.partial) return;
        await this.forwardEvent(
          assignment.connectionId,
          conn,
          "MESSAGE_UPDATE",
          {
            id: newMessage.id,
            channel_id: newMessage.channelId,
            guild_id: newMessage.guildId,
            content: newMessage.content,
            edited_timestamp: newMessage.editedAt?.toISOString(),
            author: newMessage.author
              ? {
                  id: newMessage.author.id,
                  username: newMessage.author.username,
                  bot: newMessage.author.bot,
                }
              : undefined,
          },
        );
      }),
    );

    client.on(
      Events.MessageDelete,
      createHandler(Events.MessageDelete, async (message) => {
        conn.eventsReceived++;
        await this.forwardEvent(
          assignment.connectionId,
          conn,
          "MESSAGE_DELETE",
          {
            id: message.id,
            channel_id: message.channelId,
            guild_id: message.guildId,
          },
        );
      }),
    );

    client.on(
      Events.MessageReactionAdd,
      createHandler(Events.MessageReactionAdd, async (reaction, user) => {
        conn.eventsReceived++;
        await this.forwardEvent(
          assignment.connectionId,
          conn,
          "MESSAGE_REACTION_ADD",
          {
            message_id: reaction.message.id,
            channel_id: reaction.message.channelId,
            guild_id: reaction.message.guildId,
            emoji: { name: reaction.emoji.name, id: reaction.emoji.id },
            user_id: user.id,
          },
        );
      }),
    );

    client.on(
      Events.GuildMemberAdd,
      createHandler(Events.GuildMemberAdd, async (member) => {
        conn.eventsReceived++;
        await this.forwardEvent(
          assignment.connectionId,
          conn,
          "GUILD_MEMBER_ADD",
          {
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
          },
        );
      }),
    );

    client.on(
      Events.GuildMemberRemove,
      createHandler(Events.GuildMemberRemove, async (member) => {
        conn.eventsReceived++;
        await this.forwardEvent(
          assignment.connectionId,
          conn,
          "GUILD_MEMBER_REMOVE",
          {
            guild_id: member.guild.id,
            user: {
              id: member.user.id,
              username: member.user.username,
              bot: member.user.bot,
            },
          },
        );
      }),
    );

    client.on(
      Events.InteractionCreate,
      createHandler(Events.InteractionCreate, async (interaction) => {
        conn.eventsReceived++;
        await this.forwardEvent(
          assignment.connectionId,
          conn,
          "INTERACTION_CREATE",
          {
            id: interaction.id,
            type: interaction.type,
            channel_id: interaction.channelId,
            guild_id: interaction.guildId,
            user: {
              id: interaction.user.id,
              username: interaction.user.username,
              bot: interaction.user.bot,
            },
            data:
              "commandName" in interaction
                ? {
                    name: interaction.commandName,
                    options:
                      "options" in interaction
                        ? interaction.options.data
                        : undefined,
                  }
                : undefined,
          },
        );
      }),
    );

    client.on(
      Events.Error,
      createHandler(Events.Error, async (error: Error) => {
        conn.status = "error";
        conn.error = error.message;
        logger.error("Bot error", {
          connectionId: assignment.connectionId,
          error: error.message,
        });
        await this.updateConnectionStatus(
          assignment.connectionId,
          "error",
          error.message,
        );
      }),
    );

    client.on(
      Events.ShardDisconnect,
      createHandler(Events.ShardDisconnect, async () => {
        conn.status = "disconnected";
        logger.warn("Bot disconnected", {
          connectionId: assignment.connectionId,
        });
        await this.updateConnectionStatus(
          assignment.connectionId,
          "disconnected",
        );
      }),
    );

    client.on(
      Events.ShardReconnecting,
      createHandler(Events.ShardReconnecting, async () => {
        conn.status = "connecting";
        logger.info("Bot reconnecting", {
          connectionId: assignment.connectionId,
        });
      }),
    );

    try {
      await client.login(assignment.botToken);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to login bot", {
        connectionId: assignment.connectionId,
        error: errorMessage,
      });

      // Clean up the failed connection so it can be retried
      this.removeAllListeners(conn);
      client.destroy();
      this.connections.delete(assignment.connectionId);

      // Update status in database - will allow reassignment on next poll
      await this.updateConnectionStatus(
        assignment.connectionId,
        "error",
        errorMessage,
      );
    }
  }

  private async disconnectBot(connectionId: string): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    logger.info("Disconnecting bot", { connectionId });
    await this.saveSessionState(connectionId, conn);
    this.removeAllListeners(conn);
    conn.client.destroy();
    this.connections.delete(connectionId);
    await this.updateConnectionStatus(connectionId, "disconnected");
  }

  private async handleMessage(
    connectionId: string,
    message: Message,
  ): Promise<void> {
    if (message.author.bot) return;

    const conn = this.connections.get(connectionId);
    if (!conn) return;

    const eventData: Record<string, unknown> = {
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
        ? {
            nick: message.member.nickname,
            roles: message.member.roles.cache.map((r) => r.id),
          }
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
      mentions: message.mentions.users.map((u) => ({
        id: u.id,
        username: u.username,
        bot: u.bot,
      })),
      referenced_message: message.reference
        ? { id: message.reference.messageId }
        : undefined,
    };

    if (
      process.env.VOICE_MESSAGE_ENABLED !== "false" &&
      hasVoiceAttachments(message.attachments, message.flags)
    ) {
      try {
        const voiceAttachments = await this.voiceHandler.processVoiceAttachments(
          message.attachments,
          connectionId,
          message.id,
          message.flags,
        );

        if (voiceAttachments.length > 0) {
          eventData.voice_attachments = voiceAttachments;
          logger.info("Processed voice attachments", {
            connectionId,
            messageId: message.id,
            count: voiceAttachments.length,
          });
        } else {
          logger.warn(
            "Voice attachments detected but none processed successfully",
            {
              connectionId,
              messageId: message.id,
              attachmentCount: message.attachments.size,
            },
          );
        }
      } catch (error) {
        logger.error("Failed to process voice attachments", {
          connectionId,
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.forwardEvent(connectionId, conn, "MESSAGE_CREATE", eventData);
  }

  private async forwardEvent(
    connectionId: string,
    conn: BotConnection,
    eventType: string,
    data: Record<string, unknown>,
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

    try {
      const response = await fetchWithTimeout(
        `${this.config.elizaCloudUrl}/api/internal/discord/events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-API-Key": this.config.internalApiKey,
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok) {
        conn.eventsRouted++;
        conn.consecutiveFailures = 0;
      } else {
        conn.eventsFailed++;
        conn.consecutiveFailures++;
        logger.warn("Failed to forward event", {
          connectionId,
          eventType,
          status: response.status,
          totalFailed: conn.eventsFailed,
          consecutiveFailures: conn.consecutiveFailures,
        });
      }
    } catch (error) {
      conn.eventsFailed++;
      conn.consecutiveFailures++;
      logger.error("Error forwarding event", {
        connectionId,
        eventType,
        error: error instanceof Error ? error.message : String(error),
        totalFailed: conn.eventsFailed,
        consecutiveFailures: conn.consecutiveFailures,
      });
    }
  }

  private async updateConnectionStatus(
    connectionId: string,
    status: string,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await fetchWithTimeout(
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
        },
      );
    } catch (error) {
      logger.error("Failed to update connection status", {
        connectionId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async saveSessionState(
    connectionId: string,
    conn: BotConnection,
  ): Promise<void> {
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

    try {
      await this.redis.setex(
        `discord:session:${connectionId}`,
        SESSION_STATE_TTL_SECONDS,
        JSON.stringify(state),
      );
    } catch (error) {
      logger.error("Failed to save session state", {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async sendHeartbeat(): Promise<void> {
    for (const [, conn] of this.connections) {
      conn.lastHeartbeat = new Date();
    }

    if (this.redis) {
      try {
        const podState = {
          podId: this.config.podName,
          connections: Array.from(this.connections.keys()),
          lastHeartbeat: Date.now(),
        };
        await this.redis.setex(
          `discord:pod:${this.config.podName}`,
          POD_STATE_TTL_SECONDS,
          JSON.stringify(podState),
        );
        await this.redis.sadd("discord:active_pods", this.config.podName);
      } catch (error) {
        logger.error("Failed to send heartbeat", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async checkForDeadPods(): Promise<void> {
    if (!this.redis) return;

    try {
      const activePods = await this.redis.smembers("discord:active_pods");
      if (!activePods || activePods.length === 0) return;

      for (const podId of activePods) {
        if (podId === this.config.podName) continue;

        const podState = await this.redis.get<string>(`discord:pod:${podId}`);
        if (!podState) {
          // Pod state expired, it's dead
          await this.claimOrphanedConnections(podId);
          continue;
        }

        const state =
          typeof podState === "string" ? JSON.parse(podState) : podState;
        const timeSinceHeartbeat = Date.now() - state.lastHeartbeat;

        if (timeSinceHeartbeat > DEAD_POD_THRESHOLD_MS) {
          logger.warn("Dead pod detected", { podId, timeSinceHeartbeat });
          await this.claimOrphanedConnections(podId);
        }
      }
    } catch (error) {
      logger.error("Error checking for dead pods", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async claimOrphanedConnections(deadPodId: string): Promise<void> {
    if (!this.redis) return;

    logger.info("Claiming orphaned connections from dead pod", { deadPodId });

    try {
      // Report to backend that this pod is taking over orphaned connections
      const response = await fetchWithTimeout(
        `${this.config.elizaCloudUrl}/api/internal/discord/gateway/failover`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-API-Key": this.config.internalApiKey,
          },
          body: JSON.stringify({
            claiming_pod: this.config.podName,
            dead_pod: deadPodId,
          }),
        },
      );

      if (response.ok) {
        const data = (await response.json()) as { claimed: number };
        logger.info("Claimed orphaned connections", {
          deadPodId,
          claimed: data.claimed,
        });
      } else {
        logger.error("Failed to claim orphaned connections", {
          deadPodId,
          status: response.status,
        });
      }

      // Clean up dead pod's Redis state
      await this.redis.srem("discord:active_pods", deadPodId);
      await this.redis.del(`discord:pod:${deadPodId}`);
    } catch (error) {
      logger.error("Error claiming orphaned connections", {
        deadPodId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  getHealth(): HealthStatus {
    const bots = [...this.connections.values()];
    const connectedBots = bots.filter((c) => c.status === "connected").length;
    const totalBots = bots.length;
    const disconnectedBots = totalBots - connectedBots;
    const totalGuilds = bots.reduce((sum, c) => sum + c.guildCount, 0);

    // Control plane connectivity affects health
    const CRITICAL_FAILURE_THRESHOLD = 5;
    const controlPlaneLost =
      this.consecutivePollFailures >= CRITICAL_FAILURE_THRESHOLD;

    const status: HealthStatus["status"] = controlPlaneLost
      ? "unhealthy"
      : totalBots > 0 && connectedBots === 0
        ? "unhealthy"
        : disconnectedBots > 0
          ? "degraded"
          : "healthy";

    return {
      status,
      podName: this.config.podName,
      totalBots,
      connectedBots,
      disconnectedBots,
      totalGuilds,
      uptime: Date.now() - this.startTime.getTime(),
      controlPlane: {
        consecutiveFailures: this.consecutivePollFailures,
        lastSuccessfulPoll: this.lastSuccessfulPoll?.toISOString() ?? null,
        healthy: !controlPlaneLost,
      },
    };
  }

  getMetrics(): string {
    const h = this.getHealth();
    const pod = this.config.podName;

    const metrics = [
      metric(
        "discord_gateway_bots_total",
        "gauge",
        "Total bots managed",
        pod,
        h.totalBots,
      ),
      metric(
        "discord_gateway_bots_connected",
        "gauge",
        "Connected bots",
        pod,
        h.connectedBots,
      ),
      metric(
        "discord_gateway_guilds_total",
        "gauge",
        "Total guilds",
        pod,
        h.totalGuilds,
      ),
      metric(
        "discord_gateway_uptime_seconds",
        "gauge",
        "Uptime in seconds",
        pod,
        Math.floor(h.uptime / 1000),
      ),
      metric(
        "discord_gateway_control_plane_failures",
        "gauge",
        "Consecutive control plane poll failures",
        pod,
        h.controlPlane.consecutiveFailures,
      ),
      metric(
        "discord_gateway_control_plane_healthy",
        "gauge",
        "Control plane connectivity (1=healthy, 0=unhealthy)",
        pod,
        h.controlPlane.healthy ? 1 : 0,
      ),
    ];

    for (const [id, conn] of this.connections) {
      const escapedId = escapePrometheusLabel(id);
      metrics.push(
        `discord_gateway_events_received{connection="${escapedId}"} ${conn.eventsReceived}`,
      );
      metrics.push(
        `discord_gateway_events_routed{connection="${escapedId}"} ${conn.eventsRouted}`,
      );
      metrics.push(
        `discord_gateway_events_failed{connection="${escapedId}"} ${conn.eventsFailed}`,
      );
    }

    return metrics.join("\n");
  }

  getStatus(): Record<string, unknown> {
    return {
      podName: this.config.podName,
      startTime: this.startTime.toISOString(),
      uptime: Date.now() - this.startTime.getTime(),
      controlPlane: {
        consecutiveFailures: this.consecutivePollFailures,
        lastSuccessfulPoll: this.lastSuccessfulPoll?.toISOString() ?? null,
      },
      connections: [...this.connections.entries()].map(([id, c]) => ({
        connectionId: id,
        organizationId: c.organizationId,
        applicationId: c.applicationId,
        status: c.status,
        guildCount: c.guildCount,
        eventsReceived: c.eventsReceived,
        eventsRouted: c.eventsRouted,
        eventsFailed: c.eventsFailed,
        consecutiveFailures: c.consecutiveFailures,
        lastHeartbeat: c.lastHeartbeat.toISOString(),
        connectedAt: c.connectedAt?.toISOString(),
        error: c.error,
      })),
    };
  }
}
