import { logger } from "@/lib/utils/logger";
import {
  discordBotConnectionsRepository,
  discordEventRoutesRepository,
  discordEventQueueRepository,
} from "@/db/repositories/discord-gateway";
import { cache } from "@/lib/cache/client";
import { checkRateLimitRedis } from "@/lib/middleware/rate-limit-redis";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import type {
  RoutableEvent,
  RouteMatch,
  EventRoutingResult,
  A2ACallbackRequest,
  WebhookCallbackRequest,
  DiscordMessage,
} from "./types";
import type {
  DiscordEventRoute,
  NewDiscordEventRoute,
  NewDiscordEventQueueItem,
} from "@/db/schemas/discord-gateway";

const ROUTE_CACHE_TTL = 60;

export class DiscordEventRouter {
  private static instance: DiscordEventRouter;

  private constructor() {}

  static getInstance(): DiscordEventRouter {
    if (!DiscordEventRouter.instance) {
      DiscordEventRouter.instance = new DiscordEventRouter();
    }
    return DiscordEventRouter.instance;
  }

  async createRoute(data: NewDiscordEventRoute): Promise<DiscordEventRoute> {
    const route = await discordEventRoutesRepository.create(data);

    // Invalidate route cache
    await this.invalidateRouteCache(data.platform_connection_id, data.guild_id);

    logger.info("[Discord Event Router] Route created", {
      routeId: route.id,
      guildId: data.guild_id,
      eventType: data.event_type,
      routeType: data.route_type,
    });

    return route;
  }

  async updateRoute(
    routeId: string,
    data: Partial<NewDiscordEventRoute>,
  ): Promise<DiscordEventRoute | null> {
    const route = await discordEventRoutesRepository.update(routeId, data);

    if (route) {
      await this.invalidateRouteCache(
        route.platform_connection_id,
        route.guild_id,
      );
    }

    return route;
  }

  async deleteRoute(routeId: string): Promise<boolean> {
    const allRoutes = await discordEventRoutesRepository.listByOrganization("");
    const route = allRoutes.find((r) => r.id === routeId);
    if (!route) return false;

    const deleted = await discordEventRoutesRepository.delete(routeId);
    if (deleted) {
      await this.invalidateRouteCache(
        route.platform_connection_id,
        route.guild_id,
      );
    }
    return deleted;
  }

  async getRoutes(organizationId: string): Promise<DiscordEventRoute[]> {
    return discordEventRoutesRepository.listByOrganization(organizationId);
  }

  async setRouteEnabled(
    routeId: string,
    enabled: boolean,
  ): Promise<DiscordEventRoute | null> {
    const route = await discordEventRoutesRepository.setEnabled(
      routeId,
      enabled,
    );

    if (route) {
      await this.invalidateRouteCache(
        route.platform_connection_id,
        route.guild_id,
      );
    }

    return route;
  }

  async routeEvent(event: RoutableEvent): Promise<EventRoutingResult[]> {
    const startTime = Date.now();

    logger.debug("[Discord Event Router] Routing event", {
      eventType: event.eventType,
      guildId: event.guildId,
      channelId: event.channelId,
    });

    // Check for social notification replies before regular routing
    if (
      event.eventType === "MESSAGE_CREATE" &&
      event.data.message?.referenced_message
    ) {
      const handled = await this.handleSocialFeedReply(event);
      if (handled) {
        return [
          {
            success: true,
            routeId: "social_feed_reply",
            routeType: "internal",
            routeTarget: "social_feed",
            responseTime: Date.now() - startTime,
          },
        ];
      }
    }

    // Find matching routes
    const routes = await this.findMatchingRoutes(event);

    if (routes.length === 0) {
      logger.debug("[Discord Event Router] No matching routes found", {
        eventType: event.eventType,
        guildId: event.guildId,
      });
      return [];
    }

    // Apply filters and check which routes should fire
    const matchResults = await Promise.all(
      routes.map((route) => this.evaluateRoute(route, event)),
    );

    const routesToFire = matchResults.filter((m) => m.shouldRoute);

    if (routesToFire.length === 0) {
      logger.debug("[Discord Event Router] All routes filtered out", {
        eventType: event.eventType,
        totalRoutes: routes.length,
      });
      return [];
    }

    // Dispatch to all matching routes
    const results = await Promise.all(
      routesToFire.map((match) => this.dispatchToRoute(match.route, event)),
    );

    const successCount = results.filter((r) => r.success).length;

    logger.info("[Discord Event Router] Event routed", {
      eventType: event.eventType,
      totalRoutes: routesToFire.length,
      successful: successCount,
      duration: Date.now() - startTime,
    });

    return results;
  }

  async queueEvent(event: RoutableEvent, routeId?: string): Promise<string> {
    const queueItem: NewDiscordEventQueueItem = {
      organization_id: event.organizationId,
      route_id: routeId,
      event_type: event.eventType,
      event_id: event.eventId,
      guild_id: event.guildId,
      channel_id: event.channelId,
      payload: {
        type: event.eventType,
        d: event.data.raw as Record<string, unknown>,
        t: event.eventType,
      },
      status: "pending",
      process_after: new Date(),
    };

    const item = await discordEventQueueRepository.enqueue(queueItem);
    return item.id;
  }

  async processQueue(
    limit = 100,
  ): Promise<{ processed: number; failed: number }> {
    const items = await discordEventQueueRepository.getPending(limit);
    let processed = 0;
    let failed = 0;

    for (const item of items) {
      await discordEventQueueRepository.markProcessing(item.id);

      // Look up platform_connection_id from route if available
      let platformConnectionId = "";
      if (item.route_id) {
        const routes = await discordEventRoutesRepository.listByOrganization(
          item.organization_id,
        );
        const route = routes.find((r) => r.id === item.route_id);
        if (route) {
          platformConnectionId = route.platform_connection_id;
        }
      }

      if (!platformConnectionId) {
        logger.warn(
          "[Discord Event Router] Queue item missing platform_connection_id",
          {
            queueId: item.id,
            routeId: item.route_id,
          },
        );
      }

      const event: RoutableEvent = {
        eventType: item.event_type,
        eventId: item.event_id,
        guildId: item.guild_id,
        channelId: item.channel_id ?? undefined,
        organizationId: item.organization_id,
        platformConnectionId,
        data: {
          raw: item.payload.d,
        },
        timestamp: item.created_at,
      };

      const results = await this.routeEvent(event);
      const allSuccessful =
        results.length === 0 || results.every((r) => r.success);

      if (allSuccessful) {
        await discordEventQueueRepository.markCompleted(item.id);
        processed++;
      } else {
        const errors = results
          .filter((r) => !r.success)
          .map((r) => r.error)
          .join("; ");
        await discordEventQueueRepository.markFailed(item.id, errors);
        failed++;
      }
    }

    return { processed, failed };
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Find routes matching an event.
   */
  private async findMatchingRoutes(
    event: RoutableEvent,
  ): Promise<DiscordEventRoute[]> {
    const cacheKey = `discord:routes:${event.platformConnectionId}:${event.guildId}:${event.eventType}`;

    // Check cache
    const cached = await cache.get<DiscordEventRoute[]>(cacheKey);
    if (cached) return cached;

    // Query database
    const routes = await discordEventRoutesRepository.findMatchingRoutes({
      platformConnectionId: event.platformConnectionId,
      guildId: event.guildId,
      channelId: event.channelId,
      eventType: event.eventType,
    });

    // Cache result
    await cache.set(cacheKey, routes, ROUTE_CACHE_TTL);

    return routes;
  }

  /**
   * Evaluate if a route should fire for an event.
   */
  private async evaluateRoute(
    route: DiscordEventRoute,
    event: RoutableEvent,
  ): Promise<RouteMatch> {
    if (!route.enabled) {
      return { route, shouldRoute: false, reason: "Route disabled" };
    }

    const rateLimitKey = `discord:rate:${route.id}`;
    const rateLimit = await checkRateLimitRedis(
      rateLimitKey,
      60000,
      route.rate_limit_per_minute ?? 60,
    );
    if (!rateLimit.allowed) {
      return { route, shouldRoute: false, reason: "Rate limited" };
    }

    if (event.eventType === "MESSAGE_CREATE" && event.data.message) {
      const message = event.data.message;

      if (route.filter_bot_messages && message.author.bot) {
        return { route, shouldRoute: false, reason: "Bot message filtered" };
      }

      if (route.filter_self_messages) {
        const connection =
          await discordBotConnectionsRepository.getByPlatformConnection(
            event.platformConnectionId,
          );
        if (
          connection?.bot_user_id &&
          message.author.id === connection.bot_user_id
        ) {
          return { route, shouldRoute: false, reason: "Self message filtered" };
        }
      }

      if (route.mention_only) {
        const mentionsBot = await this.messageContainsBotMention(
          message,
          event.platformConnectionId,
        );
        if (!mentionsBot) {
          return { route, shouldRoute: false, reason: "Not mentioned" };
        }
      }

      if (route.command_prefix) {
        if (!message.content.startsWith(route.command_prefix)) {
          return { route, shouldRoute: false, reason: "No command prefix" };
        }
      }
    }

    return { route, shouldRoute: true };
  }

  private async dispatchToRoute(
    route: DiscordEventRoute,
    event: RoutableEvent,
  ): Promise<EventRoutingResult> {
    const startTime = Date.now();

    const result: EventRoutingResult = {
      success: false,
      routeId: route.id,
      routeType: route.route_type,
      routeTarget: route.route_target,
      responseTime: 0,
    };

    switch (route.route_type) {
      case "a2a":
        result.success = await this.dispatchToA2A(route, event);
        break;
      case "mcp":
        result.success = await this.dispatchToMCP(route, event);
        break;
      case "webhook":
        result.success = await this.dispatchToWebhook(route, event);
        break;
      case "container":
        result.success = await this.dispatchToContainer(route, event);
        break;
      case "internal":
        result.success = await this.dispatchToInternal(route, event);
        break;
      default:
        result.error = `Unknown route type: ${route.route_type}`;
    }

    result.responseTime = Date.now() - startTime;

    // Update route counters
    await discordEventRoutesRepository.incrementCounters(
      route.id,
      1, // matched
      result.success ? 1 : 0, // routed
    );

    return result;
  }

  private async dispatchToA2A(
    route: DiscordEventRoute,
    event: RoutableEvent,
  ): Promise<boolean> {
    const message = event.data.message;
    if (!message && event.eventType === "MESSAGE_CREATE") {
      return false;
    }

    // Build A2A request - include connection_id so agent can respond
    const a2aRequest: A2ACallbackRequest = {
      jsonrpc: "2.0",
      method: "message/send",
      params: {
        message: {
          role: "user",
          content: message?.content ?? JSON.stringify(event.data.raw),
          metadata: {
            source: "discord",
            connection_id: event.platformConnectionId,
            guild_id: event.guildId,
            channel_id: event.channelId ?? "",
            message_id: message?.id ?? event.eventId,
            author_id: message?.author.id ?? "",
            author_username: message?.author.username ?? "",
            mentions_bot: await this.messageContainsBotMention(
              message,
              event.platformConnectionId,
            ),
            reply_to: message?.referenced_message?.id,
            attachments: message?.attachments.map((a) => ({
              url: a.url,
              filename: a.filename,
              content_type: a.content_type,
            })),
            voice_attachments: message?.voice_attachments?.map((v) => ({
              url: v.url,
              filename: v.filename,
              content_type: v.content_type,
              expires_at: v.expires_at,
              size: v.size,
            })),
          },
        },
      },
      id: uuidv4(),
    };

    // route_target should be the A2A endpoint URL or agent ID
    const targetUrl = route.route_target.startsWith("http")
      ? route.route_target
      : `${process.env.NEXTAUTH_URL ?? "https://elizacloud.ai"}/api/a2a`;

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.INTERNAL_API_KEY ?? "",
        "X-Organization-Id": event.organizationId,
        "X-Discord-Event": event.eventType,
      },
      body: JSON.stringify(a2aRequest),
    });

    if (!response.ok) {
      logger.error("[Discord Event Router] A2A dispatch failed", {
        routeId: route.id,
        status: response.status,
      });
      return false;
    }

    return true;
  }

  private async dispatchToMCP(
    route: DiscordEventRoute,
    event: RoutableEvent,
  ): Promise<boolean> {
    const targetUrl = route.route_target.startsWith("http")
      ? route.route_target
      : `${process.env.NEXTAUTH_URL ?? "https://elizacloud.ai"}/api/mcp`;

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.INTERNAL_API_KEY ?? "",
        "X-Organization-Id": event.organizationId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "discord_message_received",
          arguments: {
            connection_id: event.platformConnectionId,
            event_type: event.eventType,
            guild_id: event.guildId,
            channel_id: event.channelId,
            message_id: event.data.message?.id,
            content: event.data.message?.content,
            author: event.data.message?.author,
            attachments: event.data.message?.attachments,
            voice_attachments: event.data.message?.voice_attachments,
            raw: event.data.raw,
          },
        },
        id: uuidv4(),
      }),
    });

    if (!response.ok) {
      logger.error("[Discord Event Router] MCP dispatch failed", {
        routeId: route.id,
        status: response.status,
      });
      return false;
    }

    return true;
  }

  private async dispatchToWebhook(
    route: DiscordEventRoute,
    event: RoutableEvent,
  ): Promise<boolean> {
    // Generate signature for webhook verification
    const timestamp = new Date().toISOString();
    const payload = JSON.stringify({
      event_type: event.eventType,
      timestamp,
      organization_id: event.organizationId,
      guild_id: event.guildId,
      channel_id: event.channelId,
      data: event.data.raw,
    });

    const signature = crypto
      .createHmac("sha256", process.env.WEBHOOK_SECRET ?? "")
      .update(payload)
      .digest("hex");

    const webhookRequest: WebhookCallbackRequest = {
      event_type: event.eventType,
      timestamp,
      organization_id: event.organizationId,
      connection_id: event.platformConnectionId,
      guild_id: event.guildId,
      channel_id: event.channelId,
      data: event.data.raw,
      signature,
    };

    const response = await fetch(route.route_target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Discord-Event": event.eventType,
        "X-Discord-Signature": signature,
        "X-Discord-Timestamp": timestamp,
      },
      body: JSON.stringify(webhookRequest),
    });

    if (!response.ok) {
      logger.error("[Discord Event Router] Webhook dispatch failed", {
        routeId: route.id,
        target: route.route_target,
        status: response.status,
      });
      return false;
    }

    return true;
  }

  private async dispatchToContainer(
    route: DiscordEventRoute,
    event: RoutableEvent,
  ): Promise<boolean> {
    // route_target should be container ID or URL
    const containerBaseUrl =
      process.env.CONTAINER_BASE_URL ?? "https://{id}.containers.elizacloud.ai";
    const containerUrl = route.route_target.startsWith("http")
      ? route.route_target
      : containerBaseUrl.replace("{id}", route.route_target);

    const response = await fetch(`${containerUrl}/api/discord/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Organization-Id": event.organizationId,
        "X-Discord-Event": event.eventType,
        "X-Discord-Connection-Id": event.platformConnectionId,
      },
      body: JSON.stringify({
        event_type: event.eventType,
        connection_id: event.platformConnectionId,
        guild_id: event.guildId,
        channel_id: event.channelId,
        data: event.data.raw,
        timestamp: event.timestamp.toISOString(),
      }),
    });

    if (!response.ok) {
      logger.error("[Discord Event Router] Container dispatch failed", {
        routeId: route.id,
        containerUrl,
        status: response.status,
      });
      return false;
    }

    return true;
  }

  private async dispatchToInternal(
    route: DiscordEventRoute,
    event: RoutableEvent,
  ): Promise<boolean> {
    // Queue the event for internal processing
    const queueId = await this.queueEvent(event, route.id);

    logger.info("[Discord Event Router] Internal dispatch queued", {
      routeId: route.id,
      routeTarget: route.route_target,
      eventType: event.eventType,
      guildId: event.guildId,
      queueId,
    });

    return true;
  }

  private async handleSocialFeedReply(event: RoutableEvent): Promise<boolean> {
    const message = event.data.message;
    if (!message?.referenced_message) return false;

    const replyToMessageId = message.referenced_message.id;
    const channelId = event.channelId;

    if (!channelId) return false;

    const { replyRouterService } =
      await import("@/lib/services/social-feed/reply-router");

    const result = await replyRouterService.processIncomingReply({
      platform: "discord",
      channelId,
      serverId: event.guildId,
      messageId: message.id,
      replyToMessageId,
      userId: message.author.id,
      username: message.author.username,
      displayName: message.author.global_name ?? message.author.username,
      content: message.content,
    });

    if (result) {
      logger.info("[Discord Event Router] Social feed reply processed", {
        channelId,
        messageId: message.id,
        confirmationId: result.confirmationId,
        success: result.success,
      });
      return true;
    }

    return false;
  }

  private async messageContainsBotMention(
    message: DiscordMessage | undefined,
    platformConnectionId: string,
  ): Promise<boolean> {
    if (!message) return false;

    // Look up the bot's user ID from the connection
    const connection =
      await discordBotConnectionsRepository.getByPlatformConnection(
        platformConnectionId,
      );
    if (connection?.bot_user_id) {
      // Check if the specific bot is mentioned
      return message.mentions.some((m) => m.id === connection.bot_user_id);
    }

    // Fallback: check if any bot is mentioned (less accurate but works without connection data)
    logger.warn(
      "[Discord Event Router] No bot_user_id found, using fallback bot mention check",
      {
        platformConnectionId,
      },
    );
    return message.mentions.some((m) => m.bot);
  }

  private async invalidateRouteCache(
    platformConnectionId: string,
    guildId: string,
  ): Promise<void> {
    await cache.delPattern(
      `discord:routes:${platformConnectionId}:${guildId}:*`,
    );
  }
}

export const discordEventRouter = DiscordEventRouter.getInstance();
