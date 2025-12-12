/**
 * Discord Event Route API (Individual)
 *
 * GET    /api/v1/discord/routes/:id - Get route details
 * PATCH  /api/v1/discord/routes/:id - Update route
 * DELETE /api/v1/discord/routes/:id - Delete route
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordEventRouter } from "@/lib/services/discord-gateway";
import type { DiscordRouteType } from "@/db/schemas/discord-gateway";
import { z } from "zod";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UpdateRouteSchema = z.object({
  channel_id: z.string().min(17).max(20).optional().nullable(),
  route_target: z.string().min(1).max(500).optional(),
  filter_bot_messages: z.boolean().optional(),
  filter_self_messages: z.boolean().optional(),
  mention_only: z.boolean().optional(),
  command_prefix: z.string().max(10).optional().nullable(),
  rate_limit_per_minute: z.number().int().min(1).max(1000).optional(),
  rate_limit_burst: z.number().int().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(1000).optional(),
});

/**
 * GET /api/v1/discord/routes/:id
 *
 * Get details of a specific event route.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: routeId } = await params;
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const routes = await discordEventRouter.getRoutes(user.organization_id!);
  const route = routes.find((r) => r.id === routeId);

  if (!route) {
    return NextResponse.json(
      { success: false, error: "Route not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
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
    },
  });
}

/**
 * PATCH /api/v1/discord/routes/:id
 *
 * Update an event route.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: routeId } = await params;
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();

  // Verify ownership
  const routes = await discordEventRouter.getRoutes(user.organization_id!);
  const existingRoute = routes.find((r) => r.id === routeId);

  if (!existingRoute) {
    return NextResponse.json(
      { success: false, error: "Route not found" },
      { status: 404 }
    );
  }

  const parsed = UpdateRouteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  logger.info("[Discord Routes] Updating route", {
    routeId,
    organizationId: user.organization_id,
    updates: Object.keys(parsed.data),
  });

  const route = await discordEventRouter.updateRoute(routeId, parsed.data);

  if (!route) {
    return NextResponse.json(
      { success: false, error: "Failed to update route" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: route.id,
      guild_id: route.guild_id,
      event_type: route.event_type,
      route_type: route.route_type,
      route_target: route.route_target,
      enabled: route.enabled,
      updated_at: route.updated_at,
    },
  });
}

/**
 * DELETE /api/v1/discord/routes/:id
 *
 * Delete an event route.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: routeId } = await params;
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  // Verify ownership
  const routes = await discordEventRouter.getRoutes(user.organization_id!);
  const existingRoute = routes.find((r) => r.id === routeId);

  if (!existingRoute) {
    return NextResponse.json(
      { success: false, error: "Route not found" },
      { status: 404 }
    );
  }

  logger.info("[Discord Routes] Deleting route", {
    routeId,
    organizationId: user.organization_id,
  });

  const success = await discordEventRouter.deleteRoute(routeId);

  if (!success) {
    return NextResponse.json(
      { success: false, error: "Failed to delete route" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Route deleted",
  });
}
