/**
 * Individual Bot API
 *
 * GET    /api/v1/bots/[botId] - Get bot details
 * DELETE /api/v1/bots/[botId] - Disconnect bot
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { botsService } from "@/lib/services/bots";
import { logger } from "@/lib/utils/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { botId } = await params;

  const connection = await botsService.getConnection(botId);
  if (!connection || connection.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  const servers = await botsService.getServers(botId);

  return NextResponse.json({
    bot: {
      id: connection.id,
      platform: connection.platform,
      botId: connection.platform_bot_id,
      botUsername: connection.platform_bot_username,
      botName: connection.platform_bot_name,
      status: connection.status,
      errorMessage: connection.error_message,
      connectedAt: connection.connected_at?.toISOString(),
      lastHealthCheck: connection.last_health_check?.toISOString(),
    },
    servers: servers.map((s) => ({
      id: s.id,
      serverId: s.server_id,
      serverName: s.server_name,
      serverIcon: s.server_icon,
      memberCount: s.member_count,
      enabled: s.enabled,
      enabledAgents: s.enabled_agents,
    })),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { botId } = await params;

  const connection = await botsService.getConnection(botId);
  if (!connection || connection.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  await botsService.disconnect(botId, user.organization_id);
  logger.info("[Bots] Disconnected", { botId, platform: connection.platform });

  return NextResponse.json({ success: true });
}
