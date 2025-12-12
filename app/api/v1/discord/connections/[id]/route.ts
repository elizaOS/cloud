/**
 * Discord Bot Connection API (Individual)
 *
 * GET    /api/v1/discord/connections/:id - Get connection status
 * DELETE /api/v1/discord/connections/:id - Unregister bot
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordGatewayService } from "@/lib/services/discord-gateway";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/discord/connections/:id
 *
 * Get status of a specific Discord bot connection.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: connectionId } = await params;
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const status = await discordGatewayService.getBotStatusById(connectionId);

  if (!status) {
    return NextResponse.json(
      { success: false, error: "Connection not found" },
      { status: 404 }
    );
  }

  // Verify ownership
  if (status.organizationId !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Connection not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: status,
  });
}

/**
 * DELETE /api/v1/discord/connections/:id
 *
 * Unregister a Discord bot connection.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: connectionId } = await params;
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  // Verify ownership first
  const status = await discordGatewayService.getBotStatusById(connectionId);
  if (!status || status.organizationId !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Connection not found" },
      { status: 404 }
    );
  }

  logger.info("[Discord Connections] Unregistering bot", {
    connectionId,
    organizationId: user.organization_id,
  });

  const success = await discordGatewayService.unregisterBot(connectionId);

  if (!success) {
    return NextResponse.json(
      { success: false, error: "Failed to unregister bot" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Bot connection removed",
  });
}

