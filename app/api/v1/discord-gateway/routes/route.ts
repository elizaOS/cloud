import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordEventRouter } from "@/lib/services/discord-gateway";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const CreateRouteSchema = z.object({
  platformConnectionId: z.string().uuid(),
  guildId: z.string(),
  channelId: z.string().optional(),
  eventType: z.enum([
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
  ]),
  routeType: z.enum(["a2a", "mcp", "webhook", "container", "internal"]),
  routeTarget: z.string(),
  filterBotMessages: z.boolean().optional().default(true),
  filterSelfMessages: z.boolean().optional().default(true),
  mentionOnly: z.boolean().optional().default(false),
  commandPrefix: z.string().optional(),
  rateLimitPerMinute: z.number().optional().default(60),
  rateLimitBurst: z.number().optional().default(10),
  enabled: z.boolean().optional().default(true),
  priority: z.number().optional().default(100),
});

/**
 * GET /api/v1/discord-gateway/routes
 * List all Discord event routes for the organization.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const routes = await discordEventRouter.getRoutes(user.organization_id!);

  return NextResponse.json({
    routes: routes.map((r) => ({
      id: r.id,
      platformConnectionId: r.platform_connection_id,
      guildId: r.guild_id,
      channelId: r.channel_id,
      eventType: r.event_type,
      routeType: r.route_type,
      routeTarget: r.route_target,
      filterBotMessages: r.filter_bot_messages,
      filterSelfMessages: r.filter_self_messages,
      mentionOnly: r.mention_only,
      commandPrefix: r.command_prefix,
      rateLimitPerMinute: r.rate_limit_per_minute,
      rateLimitBurst: r.rate_limit_burst,
      enabled: r.enabled,
      priority: r.priority,
      eventsMatched: Number(r.events_matched),
      eventsRouted: Number(r.events_routed),
      lastRoutedAt: r.last_routed_at?.toISOString(),
      createdAt: r.created_at.toISOString(),
    })),
  });
}

/**
 * POST /api/v1/discord-gateway/routes
 * Create a new Discord event route.
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const parsed = CreateRouteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const route = await discordEventRouter.createRoute({
    organization_id: user.organization_id!,
    platform_connection_id: parsed.data.platformConnectionId,
    guild_id: parsed.data.guildId,
    channel_id: parsed.data.channelId,
    event_type: parsed.data.eventType,
    route_type: parsed.data.routeType,
    route_target: parsed.data.routeTarget,
    filter_bot_messages: parsed.data.filterBotMessages,
    filter_self_messages: parsed.data.filterSelfMessages,
    mention_only: parsed.data.mentionOnly,
    command_prefix: parsed.data.commandPrefix,
    rate_limit_per_minute: parsed.data.rateLimitPerMinute,
    rate_limit_burst: parsed.data.rateLimitBurst,
    enabled: parsed.data.enabled,
    priority: parsed.data.priority,
  });

  logger.info("[Discord Gateway API] Created route", {
    routeId: route.id,
    guildId: route.guild_id,
    eventType: route.event_type,
  });

  return NextResponse.json(
    {
      id: route.id,
      guildId: route.guild_id,
      eventType: route.event_type,
      routeType: route.route_type,
      routeTarget: route.route_target,
      enabled: route.enabled,
      createdAt: route.created_at.toISOString(),
    },
    { status: 201 },
  );
}
