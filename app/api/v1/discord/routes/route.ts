/**
 * Discord Event Routes API
 *
 * GET  /api/v1/discord/routes - List event routes for organization
 * POST /api/v1/discord/routes - Create a new event route
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordEventRouter } from "@/lib/services/discord-gateway";
import type {
  NewDiscordEventRoute,
  DiscordEventType,
  DiscordRouteType,
} from "@/db/schemas/discord-gateway";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateRouteSchema = z.object({
  platform_connection_id: z.string().uuid(),
  guild_id: z.string().min(17).max(20),
  channel_id: z.string().min(17).max(20).optional(),
  event_type: z.enum([
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
  route_type: z.enum(["a2a", "mcp", "webhook", "container", "internal"]),
  route_target: z.string().min(1).max(500),
  filter_bot_messages: z.boolean().optional().default(true),
  filter_self_messages: z.boolean().optional().default(true),
  mention_only: z.boolean().optional().default(false),
  command_prefix: z.string().max(10).optional(),
  rate_limit_per_minute: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(60),
  rate_limit_burst: z.number().int().min(1).max(100).optional().default(10),
  enabled: z.boolean().optional().default(true),
  priority: z.number().int().min(1).max(1000).optional().default(100),
});

/**
 * GET /api/v1/discord/routes
 *
 * List all event routes for the authenticated organization.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const routes = await discordEventRouter.getRoutes(user.organization_id!);

  return NextResponse.json({
    success: true,
    data: routes.map((route) => ({
      id: route.id,
      platform_connection_id: route.platform_connection_id,
      guild_id: route.guild_id,
      channel_id: route.channel_id,
      event_type: route.event_type,
      route_type: route.route_type,
      route_target: route.route_target,
      filter_bot_messages: route.filter_bot_messages,
      filter_self_messages: route.filter_self_messages,
      mention_only: route.mention_only,
      command_prefix: route.command_prefix,
      rate_limit_per_minute: route.rate_limit_per_minute,
      rate_limit_burst: route.rate_limit_burst,
      enabled: route.enabled,
      priority: route.priority,
      events_matched: route.events_matched,
      events_routed: route.events_routed,
      last_routed_at: route.last_routed_at,
      created_at: route.created_at,
      updated_at: route.updated_at,
    })),
  });
}

/**
 * POST /api/v1/discord/routes
 *
 * Create a new event route.
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();

  const parsed = CreateRouteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request",
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  logger.info("[Discord Routes] Creating route", {
    organizationId: user.organization_id,
    guildId: data.guild_id,
    eventType: data.event_type,
    routeType: data.route_type,
  });

  const routeData: NewDiscordEventRoute = {
    organization_id: user.organization_id!,
    platform_connection_id: data.platform_connection_id,
    guild_id: data.guild_id,
    channel_id: data.channel_id,
    event_type: data.event_type as DiscordEventType,
    route_type: data.route_type as DiscordRouteType,
    route_target: data.route_target,
    filter_bot_messages: data.filter_bot_messages,
    filter_self_messages: data.filter_self_messages,
    mention_only: data.mention_only,
    command_prefix: data.command_prefix,
    rate_limit_per_minute: data.rate_limit_per_minute,
    rate_limit_burst: data.rate_limit_burst,
    enabled: data.enabled,
    priority: data.priority,
  };

  const route = await discordEventRouter.createRoute(routeData);

  return NextResponse.json({
    success: true,
    data: {
      id: route.id,
      guild_id: route.guild_id,
      event_type: route.event_type,
      route_type: route.route_type,
      route_target: route.route_target,
      enabled: route.enabled,
      created_at: route.created_at,
    },
  });
}
