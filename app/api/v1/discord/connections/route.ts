/**
 * Discord Bot Connections API
 *
 * GET  /api/v1/discord/connections - List bot connections for organization
 * POST /api/v1/discord/connections - Register a new Discord bot
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordGatewayService } from "@/lib/services/discord-gateway";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RegisterBotSchema = z.object({
  platform_connection_id: z.string().uuid(),
  bot_token: z.string().min(50).max(100),
  application_id: z.string().min(17).max(20),
  intents: z.number().int().optional(),
});

/**
 * GET /api/v1/discord/connections
 *
 * List all Discord bot connections for the authenticated organization.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const statuses = await discordGatewayService.getBotStatus(user.organization_id!);

  return NextResponse.json({
    success: true,
    data: statuses,
  });
}

/**
 * POST /api/v1/discord/connections
 *
 * Register a new Discord bot for the organization.
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();

  const parsed = RegisterBotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { platform_connection_id, bot_token, application_id, intents } = parsed.data;

  logger.info("[Discord Connections] Registering bot", {
    organizationId: user.organization_id,
    applicationId: application_id,
  });

  const result = await discordGatewayService.registerBot({
    organizationId: user.organization_id!,
    platformConnectionId: platform_connection_id,
    botToken: bot_token,
    applicationId: application_id,
    intents,
  });

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      connection_id: result.connectionId,
      bot_user_id: result.botUserId,
      bot_username: result.botUsername,
    },
  });
}

