/**
 * MCP Tools for Discord Gateway management
 *
 * Provides tools for managing Discord bot connections, event routes,
 * and sending messages via the multi-tenant Discord gateway.
 */

import { z } from "zod";
import {
  discordGatewayService,
  discordEventRouter,
  discordMessageSender,
} from "@/lib/services/discord-gateway";
import type { AuthResultWithOrg, ToolResponse } from "./types";
import { successResponse, errorResponse } from "./types";
import type {
  NewDiscordEventRoute,
  DiscordEventType,
  DiscordRouteType,
} from "@/db/schemas/discord-gateway";

// =============================================================================
// SCHEMAS
// =============================================================================

const listConnectionsSchema = z.object({});

const getConnectionSchema = z.object({
  connectionId: z.string().uuid().describe("The connection ID"),
});

const listRoutesSchema = z.object({
  guildId: z.string().optional().describe("Filter by guild ID"),
});

const createRouteSchema = z.object({
  platformConnectionId: z.string().uuid().describe("Platform connection ID"),
  guildId: z.string().describe("Discord guild ID"),
  channelId: z
    .string()
    .optional()
    .describe("Discord channel ID (optional, null = all channels)"),
  eventType: z
    .enum([
      "MESSAGE_CREATE",
      "MESSAGE_UPDATE",
      "MESSAGE_DELETE",
      "MESSAGE_REACTION_ADD",
      "MESSAGE_REACTION_REMOVE",
      "GUILD_MEMBER_ADD",
      "GUILD_MEMBER_REMOVE",
      "GUILD_MEMBER_UPDATE",
      "INTERACTION_CREATE",
      "VOICE_STATE_UPDATE",
      "PRESENCE_UPDATE",
      "TYPING_START",
      "CHANNEL_CREATE",
      "CHANNEL_UPDATE",
      "CHANNEL_DELETE",
      "THREAD_CREATE",
      "THREAD_UPDATE",
      "THREAD_DELETE",
    ])
    .describe("Discord event type to route"),
  routeType: z
    .enum(["a2a", "mcp", "webhook", "container", "internal"])
    .describe(
      "Where to route events (a2a = A2A endpoint, mcp = MCP endpoint, webhook = custom URL, container = agent container)",
    ),
  routeTarget: z.string().describe("Target agent ID, URL, or container ID"),
  mentionOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe("Only route when bot is @mentioned"),
  commandPrefix: z
    .string()
    .optional()
    .describe("Only route messages starting with this prefix"),
  filterBotMessages: z
    .boolean()
    .optional()
    .default(true)
    .describe("Filter out messages from other bots"),
});

const updateRouteSchema = z.object({
  routeId: z.string().uuid().describe("Route ID to update"),
  enabled: z.boolean().optional().describe("Enable/disable the route"),
  mentionOnly: z.boolean().optional().describe("Only route when bot mentioned"),
  commandPrefix: z.string().optional().describe("Command prefix filter"),
  priority: z
    .number()
    .optional()
    .describe("Route priority (higher = checked first)"),
  rateLimitPerMinute: z
    .number()
    .optional()
    .describe("Rate limit (requests per minute)"),
});

const deleteRouteSchema = z.object({
  routeId: z.string().uuid().describe("Route ID to delete"),
});

const getHealthSchema = z.object({});

// Message sending schemas
const sendMessageSchema = z.object({
  connectionId: z.string().uuid().describe("Discord bot connection ID"),
  channelId: z.string().describe("Discord channel ID to send to"),
  content: z
    .string()
    .max(2000)
    .optional()
    .describe("Message text content (max 2000 chars)"),
  embeds: z
    .array(
      z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        color: z.number().optional(),
        url: z.string().optional(),
        fields: z
          .array(
            z.object({
              name: z.string(),
              value: z.string(),
              inline: z.boolean().optional(),
            }),
          )
          .optional(),
        footer: z.object({ text: z.string() }).optional(),
        image: z.object({ url: z.string() }).optional(),
        thumbnail: z.object({ url: z.string() }).optional(),
      }),
    )
    .optional()
    .describe("Rich embed objects"),
  replyTo: z.string().optional().describe("Message ID to reply to"),
});

const editMessageSchema = z.object({
  connectionId: z.string().uuid().describe("Discord bot connection ID"),
  channelId: z.string().describe("Discord channel ID"),
  messageId: z.string().describe("Message ID to edit"),
  content: z.string().max(2000).optional().describe("New message content"),
});

const deleteMessageSchema = z.object({
  connectionId: z.string().uuid().describe("Discord bot connection ID"),
  channelId: z.string().describe("Discord channel ID"),
  messageId: z.string().describe("Message ID to delete"),
});

const addReactionSchema = z.object({
  connectionId: z.string().uuid().describe("Discord bot connection ID"),
  channelId: z.string().describe("Discord channel ID"),
  messageId: z.string().describe("Message ID to react to"),
  emoji: z
    .string()
    .describe("Emoji to add (e.g., '👍' or custom emoji format)"),
});

const getMessagesSchema = z.object({
  connectionId: z.string().uuid().describe("Discord bot connection ID"),
  channelId: z.string().describe("Discord channel ID"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe("Number of messages to fetch"),
  before: z.string().optional().describe("Get messages before this message ID"),
});

const createThreadSchema = z.object({
  connectionId: z.string().uuid().describe("Discord bot connection ID"),
  channelId: z.string().describe("Discord channel ID"),
  messageId: z.string().describe("Message ID to create thread from"),
  name: z.string().max(100).describe("Thread name"),
  autoArchiveDuration: z
    .enum(["60", "1440", "4320", "10080"])
    .optional()
    .describe("Auto-archive after minutes of inactivity"),
});

// =============================================================================
// HANDLERS
// =============================================================================

async function handleListConnections(
  _args: z.infer<typeof listConnectionsSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  const connections = await discordGatewayService.getBotStatus(
    auth.user.organization_id,
  );

  return successResponse({
    connections: connections.map((c) => ({
      id: c.connectionId,
      botUsername: c.botUsername,
      status: c.status,
      guildCount: c.guildCount,
      eventsReceived: c.eventsReceived,
      eventsRouted: c.eventsRouted,
      lastHeartbeat: c.lastHeartbeat?.toISOString(),
      connectedAt: c.connectedAt?.toISOString(),
      gatewayPod: c.gatewayPod,
    })),
  });
}

async function handleGetConnection(
  args: z.infer<typeof getConnectionSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  const status = await discordGatewayService.getBotStatusById(
    args.connectionId,
  );

  if (!status || status.organizationId !== auth.user.organization_id) {
    return errorResponse(new Error("Connection not found"));
  }

  return successResponse({
    id: status.connectionId,
    botUserId: status.botUserId,
    botUsername: status.botUsername,
    status: status.status,
    guildCount: status.guildCount,
    eventsReceived: status.eventsReceived,
    eventsRouted: status.eventsRouted,
    lastHeartbeat: status.lastHeartbeat?.toISOString(),
    lastEventAt: status.lastEventAt?.toISOString(),
    connectedAt: status.connectedAt?.toISOString(),
    gatewayPod: status.gatewayPod,
    shardId: status.shardId,
    shardCount: status.shardCount,
  });
}

async function handleListRoutes(
  args: z.infer<typeof listRoutesSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  let routes = await discordEventRouter.getRoutes(auth.user.organization_id);

  if (args.guildId) {
    routes = routes.filter((r) => r.guild_id === args.guildId);
  }

  return successResponse({
    routes: routes.map((r) => ({
      id: r.id,
      guildId: r.guild_id,
      channelId: r.channel_id,
      eventType: r.event_type,
      routeType: r.route_type,
      routeTarget: r.route_target,
      enabled: r.enabled,
      mentionOnly: r.mention_only,
      commandPrefix: r.command_prefix,
      priority: r.priority,
      rateLimitPerMinute: r.rate_limit_per_minute,
      eventsMatched: Number(r.events_matched),
      eventsRouted: Number(r.events_routed),
      lastRoutedAt: r.last_routed_at?.toISOString(),
    })),
  });
}

async function handleCreateRoute(
  args: z.infer<typeof createRouteSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  const routeData: NewDiscordEventRoute = {
    organization_id: auth.user.organization_id,
    platform_connection_id: args.platformConnectionId,
    guild_id: args.guildId,
    channel_id: args.channelId,
    event_type: args.eventType as DiscordEventType,
    route_type: args.routeType as DiscordRouteType,
    route_target: args.routeTarget,
    mention_only: args.mentionOnly,
    command_prefix: args.commandPrefix,
    filter_bot_messages: args.filterBotMessages,
  };

  const route = await discordEventRouter.createRoute(routeData);

  return successResponse({
    id: route.id,
    guildId: route.guild_id,
    eventType: route.event_type,
    routeType: route.route_type,
    routeTarget: route.route_target,
    enabled: route.enabled,
    createdAt: route.created_at.toISOString(),
  });
}

async function handleUpdateRoute(
  args: z.infer<typeof updateRouteSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  // Verify ownership
  const routes = await discordEventRouter.getRoutes(auth.user.organization_id);
  const existingRoute = routes.find((r) => r.id === args.routeId);

  if (!existingRoute) {
    return errorResponse(new Error("Route not found"));
  }

  const updated = await discordEventRouter.updateRoute(args.routeId, {
    enabled: args.enabled,
    mention_only: args.mentionOnly,
    command_prefix: args.commandPrefix,
    priority: args.priority,
    rate_limit_per_minute: args.rateLimitPerMinute,
  });

  if (!updated) {
    return errorResponse(new Error("Failed to update route"));
  }

  return successResponse({
    id: updated.id,
    enabled: updated.enabled,
    priority: updated.priority,
    updatedAt: updated.updated_at.toISOString(),
  });
}

async function handleDeleteRoute(
  args: z.infer<typeof deleteRouteSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  // Verify ownership
  const routes = await discordEventRouter.getRoutes(auth.user.organization_id);
  const existingRoute = routes.find((r) => r.id === args.routeId);

  if (!existingRoute) {
    return errorResponse(new Error("Route not found"));
  }

  const deleted = await discordEventRouter.deleteRoute(args.routeId);

  if (!deleted) {
    return errorResponse(new Error("Failed to delete route"));
  }

  return successResponse({ success: true, deletedRouteId: args.routeId });
}

async function handleGetHealth(
  _args: z.infer<typeof getHealthSchema>,
  _auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  const health = await discordGatewayService.getHealth();

  return successResponse({
    status: health.status,
    totalBots: health.totalBots,
    connectedBots: health.connectedBots,
    disconnectedBots: health.disconnectedBots,
    totalGuilds: health.totalGuilds,
    queue: health.queueStats,
    shards: health.shards.map((s) => ({
      shardId: s.shardId,
      podName: s.podName,
      botsCount: s.botsCount,
      guildsCount: s.guildsCount,
      status: s.status,
    })),
    lastCheck: health.lastCheck.toISOString(),
  });
}

// Message sending handlers
async function handleSendMessage(
  args: z.infer<typeof sendMessageSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  // Verify ownership
  const status = await discordGatewayService.getBotStatusById(
    args.connectionId,
  );
  if (!status || status.organizationId !== auth.user.organization_id) {
    return errorResponse(new Error("Connection not found"));
  }

  const result = await discordMessageSender.sendMessage(args.connectionId, {
    channelId: args.channelId,
    content: args.content,
    embeds: args.embeds,
    replyTo: args.replyTo,
  });

  if (!result.success) {
    return errorResponse(new Error(result.error ?? "Failed to send message"));
  }

  return successResponse({
    messageId: result.messageId,
    channelId: result.channelId,
  });
}

async function handleEditMessage(
  args: z.infer<typeof editMessageSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  const status = await discordGatewayService.getBotStatusById(
    args.connectionId,
  );
  if (!status || status.organizationId !== auth.user.organization_id) {
    return errorResponse(new Error("Connection not found"));
  }

  const result = await discordMessageSender.editMessage(
    args.connectionId,
    args.channelId,
    args.messageId,
    args.content,
  );

  if (!result.success) {
    return errorResponse(new Error(result.error ?? "Failed to edit message"));
  }

  return successResponse({ messageId: result.messageId, edited: true });
}

async function handleDeleteMessage(
  args: z.infer<typeof deleteMessageSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  const status = await discordGatewayService.getBotStatusById(
    args.connectionId,
  );
  if (!status || status.organizationId !== auth.user.organization_id) {
    return errorResponse(new Error("Connection not found"));
  }

  const success = await discordMessageSender.deleteMessage(
    args.connectionId,
    args.channelId,
    args.messageId,
  );

  if (!success) {
    return errorResponse(new Error("Failed to delete message"));
  }

  return successResponse({ deleted: true, messageId: args.messageId });
}

async function handleAddReaction(
  args: z.infer<typeof addReactionSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  const status = await discordGatewayService.getBotStatusById(
    args.connectionId,
  );
  if (!status || status.organizationId !== auth.user.organization_id) {
    return errorResponse(new Error("Connection not found"));
  }

  const success = await discordMessageSender.addReaction(
    args.connectionId,
    args.channelId,
    args.messageId,
    args.emoji,
  );

  if (!success) {
    return errorResponse(new Error("Failed to add reaction"));
  }

  return successResponse({ added: true, emoji: args.emoji });
}

async function handleGetMessages(
  args: z.infer<typeof getMessagesSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  const status = await discordGatewayService.getBotStatusById(
    args.connectionId,
  );
  if (!status || status.organizationId !== auth.user.organization_id) {
    return errorResponse(new Error("Connection not found"));
  }

  const messages = await discordMessageSender.getMessages(
    args.connectionId,
    args.channelId,
    {
      limit: args.limit,
      before: args.before,
    },
  );

  return successResponse({
    messages: messages.map((m) => ({
      id: m.id,
      content: m.content,
      author: {
        id: m.author.id,
        username: m.author.username,
        bot: m.author.bot,
      },
      timestamp: m.timestamp,
      attachments: m.attachments.map((a) => ({
        url: a.url,
        filename: a.filename,
        contentType: a.content_type,
      })),
      embeds: m.embeds.length,
      replyTo: m.referenced_message?.id,
    })),
    count: messages.length,
  });
}

async function handleCreateThread(
  args: z.infer<typeof createThreadSchema>,
  auth: AuthResultWithOrg,
): Promise<ToolResponse> {
  const status = await discordGatewayService.getBotStatusById(
    args.connectionId,
  );
  if (!status || status.organizationId !== auth.user.organization_id) {
    return errorResponse(new Error("Connection not found"));
  }

  const duration = args.autoArchiveDuration
    ? (parseInt(args.autoArchiveDuration) as 60 | 1440 | 4320 | 10080)
    : undefined;

  const result = await discordMessageSender.createThread(
    args.connectionId,
    args.channelId,
    args.messageId,
    args.name,
    duration,
  );

  if (!result.success) {
    return errorResponse(new Error(result.error ?? "Failed to create thread"));
  }

  return successResponse({ threadId: result.threadId, name: args.name });
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const discordGatewayTools = {
  // Connection management
  discord_list_connections: {
    description: "List all Discord bot connections for the organization",
    schema: listConnectionsSchema,
    handler: handleListConnections,
  },
  discord_get_connection: {
    description:
      "Get details of a specific Discord bot connection including status, guild count, and event stats",
    schema: getConnectionSchema,
    handler: handleGetConnection,
  },

  // Route management
  discord_list_routes: {
    description:
      "List Discord event routes that determine how messages are forwarded to agents",
    schema: listRoutesSchema,
    handler: handleListRoutes,
  },
  discord_create_route: {
    description:
      "Create a new Discord event route to forward messages/events to an agent via A2A, MCP, webhook, or container",
    schema: createRouteSchema,
    handler: handleCreateRoute,
  },
  discord_update_route: {
    description:
      "Update a Discord event route configuration (enable/disable, filters, priority)",
    schema: updateRouteSchema,
    handler: handleUpdateRoute,
  },
  discord_delete_route: {
    description: "Delete a Discord event route",
    schema: deleteRouteSchema,
    handler: handleDeleteRoute,
  },

  // Health & monitoring
  discord_gateway_health: {
    description:
      "Get Discord gateway service health status including connected bots, queue stats, and shard information",
    schema: getHealthSchema,
    handler: handleGetHealth,
  },

  // Message operations
  discord_send_message: {
    description:
      "Send a message to a Discord channel. Supports text content, rich embeds, and replies",
    schema: sendMessageSchema,
    handler: handleSendMessage,
  },
  discord_edit_message: {
    description: "Edit a previously sent message in a Discord channel",
    schema: editMessageSchema,
    handler: handleEditMessage,
  },
  discord_delete_message: {
    description:
      "Delete a message from a Discord channel (requires bot permissions)",
    schema: deleteMessageSchema,
    handler: handleDeleteMessage,
  },
  discord_add_reaction: {
    description: "Add a reaction emoji to a Discord message",
    schema: addReactionSchema,
    handler: handleAddReaction,
  },
  discord_get_messages: {
    description: "Fetch recent messages from a Discord channel for context",
    schema: getMessagesSchema,
    handler: handleGetMessages,
  },
  discord_create_thread: {
    description: "Create a thread from a message in a Discord channel",
    schema: createThreadSchema,
    handler: handleCreateThread,
  },
};
