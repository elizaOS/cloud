import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordEventRouter } from "@/lib/services/discord-gateway";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UpdateRouteSchema = z.object({
  channelId: z.string().optional(),
  routeTarget: z.string().optional(),
  filterBotMessages: z.boolean().optional(),
  filterSelfMessages: z.boolean().optional(),
  mentionOnly: z.boolean().optional(),
  commandPrefix: z.string().nullable().optional(),
  rateLimitPerMinute: z.number().optional(),
  rateLimitBurst: z.number().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().optional(),
});

/**
 * GET /api/v1/discord-gateway/routes/[id]
 * Get a specific Discord event route.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const routes = await discordEventRouter.getRoutes(user.organization_id!);
  const route = routes.find((r) => r.id === id);

  if (!route) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: route.id,
    platformConnectionId: route.platform_connection_id,
    guildId: route.guild_id,
    channelId: route.channel_id,
    eventType: route.event_type,
    routeType: route.route_type,
    routeTarget: route.route_target,
    filterBotMessages: route.filter_bot_messages,
    filterSelfMessages: route.filter_self_messages,
    mentionOnly: route.mention_only,
    commandPrefix: route.command_prefix,
    rateLimitPerMinute: route.rate_limit_per_minute,
    rateLimitBurst: route.rate_limit_burst,
    enabled: route.enabled,
    priority: route.priority,
    eventsMatched: Number(route.events_matched),
    eventsRouted: Number(route.events_routed),
    lastRoutedAt: route.last_routed_at?.toISOString(),
    createdAt: route.created_at.toISOString(),
    updatedAt: route.updated_at.toISOString(),
  });
}

/**
 * PATCH /api/v1/discord-gateway/routes/[id]
 * Update a Discord event route.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  // Verify ownership
  const routes = await discordEventRouter.getRoutes(user.organization_id!);
  const route = routes.find((r) => r.id === id);

  if (!route) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = UpdateRouteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await discordEventRouter.updateRoute(id, {
    channel_id: parsed.data.channelId,
    route_target: parsed.data.routeTarget,
    filter_bot_messages: parsed.data.filterBotMessages,
    filter_self_messages: parsed.data.filterSelfMessages,
    mention_only: parsed.data.mentionOnly,
    command_prefix: parsed.data.commandPrefix ?? undefined,
    rate_limit_per_minute: parsed.data.rateLimitPerMinute,
    rate_limit_burst: parsed.data.rateLimitBurst,
    enabled: parsed.data.enabled,
    priority: parsed.data.priority,
  });

  if (!updated) {
    return NextResponse.json(
      { error: "Failed to update route" },
      { status: 500 }
    );
  }

  logger.info("[Discord Gateway API] Updated route", { routeId: id });

  return NextResponse.json({
    id: updated.id,
    enabled: updated.enabled,
    priority: updated.priority,
    updatedAt: updated.updated_at.toISOString(),
  });
}

/**
 * DELETE /api/v1/discord-gateway/routes/[id]
 * Delete a Discord event route.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  // Verify ownership
  const routes = await discordEventRouter.getRoutes(user.organization_id!);
  const route = routes.find((r) => r.id === id);

  if (!route) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  const deleted = await discordEventRouter.deleteRoute(id);

  if (!deleted) {
    return NextResponse.json(
      { error: "Failed to delete route" },
      { status: 500 }
    );
  }

  logger.info("[Discord Gateway API] Deleted route", {
    routeId: id,
    organizationId: user.organization_id,
  });

  return NextResponse.json({ success: true });
}
