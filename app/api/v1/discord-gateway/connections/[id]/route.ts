import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordGatewayService } from "@/lib/services/discord-gateway";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UpdateConnectionSchema = z.object({
  status: z
    .enum(["connected", "disconnected", "reconnecting", "error", "starting"])
    .optional(),
  errorMessage: z.string().optional(),
  sessionId: z.string().optional(),
  resumeGatewayUrl: z.string().optional(),
  sequenceNumber: z.number().optional(),
  gatewayPod: z.string().optional(),
});

/**
 * GET /api/v1/discord-gateway/connections/[id]
 * Get a specific Discord bot connection.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const status = await discordGatewayService.getBotStatusById(id);

  if (!status || status.organizationId !== user.organization_id) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: status.connectionId,
    botUserId: status.botUserId,
    botUsername: status.botUsername,
    shardId: status.shardId,
    shardCount: status.shardCount,
    gatewayPod: status.gatewayPod,
    status: status.status,
    guildCount: status.guildCount,
    eventsReceived: status.eventsReceived,
    eventsRouted: status.eventsRouted,
    lastHeartbeat: status.lastHeartbeat?.toISOString(),
    lastEventAt: status.lastEventAt?.toISOString(),
    connectedAt: status.connectedAt?.toISOString(),
  });
}

/**
 * PATCH /api/v1/discord-gateway/connections/[id]
 * Update a Discord bot connection status (internal use by gateway pods).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  // Verify ownership
  const status = await discordGatewayService.getBotStatusById(id);

  if (!status || status.organizationId !== user.organization_id) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 },
    );
  }

  const body = await request.json();
  const parsed = UpdateConnectionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!parsed.data.status) {
    return NextResponse.json({ error: "Status is required" }, { status: 400 });
  }

  await discordGatewayService.updateConnectionStatus(id, parsed.data.status, {
    errorMessage: parsed.data.errorMessage,
    sessionId: parsed.data.sessionId,
    resumeGatewayUrl: parsed.data.resumeGatewayUrl,
    sequenceNumber: parsed.data.sequenceNumber,
    gatewayPod: parsed.data.gatewayPod,
  });

  logger.info("[Discord Gateway API] Updated connection", {
    connectionId: id,
    status: parsed.data.status,
  });

  return NextResponse.json({
    id,
    status: parsed.data.status,
  });
}

/**
 * DELETE /api/v1/discord-gateway/connections/[id]
 * Unregister a Discord bot connection.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  // Verify ownership
  const status = await discordGatewayService.getBotStatusById(id);

  if (!status || status.organizationId !== user.organization_id) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 },
    );
  }

  const deleted = await discordGatewayService.unregisterBot(id);

  if (!deleted) {
    return NextResponse.json(
      { error: "Failed to unregister bot" },
      { status: 500 },
    );
  }

  logger.info("[Discord Gateway API] Unregistered bot", {
    connectionId: id,
    organizationId: user.organization_id,
  });

  return NextResponse.json({ success: true });
}
