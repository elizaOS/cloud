import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordGatewayService } from "@/lib/services/discord-gateway";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const RegisterBotSchema = z.object({
  platformConnectionId: z.string().uuid(),
  applicationId: z.string(),
  botToken: z.string(),
  intents: z.number().optional(),
});

/**
 * GET /api/v1/discord-gateway/connections
 * List all Discord bot connections for the organization.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const botStatuses = await discordGatewayService.getBotStatus(
    user.organization_id!,
  );

  return NextResponse.json({
    connections: botStatuses.map((s) => ({
      id: s.connectionId,
      botUserId: s.botUserId,
      botUsername: s.botUsername,
      shardId: s.shardId,
      shardCount: s.shardCount,
      status: s.status,
      guildCount: s.guildCount,
      eventsReceived: s.eventsReceived,
      eventsRouted: s.eventsRouted,
      lastHeartbeat: s.lastHeartbeat?.toISOString(),
      lastEventAt: s.lastEventAt?.toISOString(),
      connectedAt: s.connectedAt?.toISOString(),
      gatewayPod: s.gatewayPod,
    })),
  });
}

/**
 * POST /api/v1/discord-gateway/connections
 * Register a new Discord bot connection.
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const parsed = RegisterBotSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await discordGatewayService.registerBot({
    organizationId: user.organization_id!,
    platformConnectionId: parsed.data.platformConnectionId,
    applicationId: parsed.data.applicationId,
    botToken: parsed.data.botToken,
    intents: parsed.data.intents,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  logger.info("[Discord Gateway API] Registered bot", {
    connectionId: result.connectionId,
    organizationId: user.organization_id,
  });

  return NextResponse.json(
    {
      id: result.connectionId,
      botUserId: result.botUserId,
      botUsername: result.botUsername,
    },
    { status: 201 },
  );
}
