/**
 * Discord Gateway Health API
 *
 * GET /api/v1/discord/health - Get gateway service health status
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordGatewayService } from "@/lib/services/discord-gateway";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/discord/health
 *
 * Get the health status of the Discord gateway service.
 */
export async function GET(request: NextRequest) {
  // Allow unauthenticated access for basic health check
  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");

  // If no auth provided, return basic status
  if (!authHeader && !apiKeyHeader) {
    const health = await discordGatewayService.getHealth();

    return NextResponse.json({
      status: health.status,
      timestamp: health.lastCheck.toISOString(),
    });
  }

  // With auth, return full details
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const health = await discordGatewayService.getHealth();
  const orgBots = await discordGatewayService.getBotStatus(user.organization_id!);

  return NextResponse.json({
    success: true,
    data: {
      service: {
        status: health.status,
        total_bots: health.totalBots,
        connected_bots: health.connectedBots,
        disconnected_bots: health.disconnectedBots,
        total_guilds: health.totalGuilds,
        shards: health.shards.map((s) => ({
          shard_id: s.shardId,
          pod_name: s.podName,
          bots_count: s.botsCount,
          guilds_count: s.guildsCount,
          status: s.status,
          last_heartbeat: s.lastHeartbeat?.toISOString(),
        })),
        queue: health.queueStats,
        last_check: health.lastCheck.toISOString(),
      },
      organization: {
        bots: orgBots.map((b) => ({
          connection_id: b.connectionId,
          status: b.status,
          bot_username: b.botUsername,
          guild_count: b.guildCount,
          events_received: b.eventsReceived,
          events_routed: b.eventsRouted,
          last_heartbeat: b.lastHeartbeat?.toISOString(),
          connected_at: b.connectedAt?.toISOString(),
        })),
      },
    },
  });
}

