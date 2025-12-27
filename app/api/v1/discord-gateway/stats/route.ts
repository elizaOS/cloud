import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordGatewayService } from "@/lib/services/discord-gateway";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/discord-gateway/stats
 * Get Discord gateway health and statistics.
 */
export async function GET(_request: NextRequest) {
  await requireAuthOrApiKeyWithOrg(_request);

  const health = await discordGatewayService.getHealth();

  return NextResponse.json({
    status: health.status,
    connections: {
      totalBots: health.totalBots,
      connectedBots: health.connectedBots,
      disconnectedBots: health.disconnectedBots,
      totalGuilds: health.totalGuilds,
    },
    queue: health.queueStats,
    shards: health.shards,
    lastCheck: health.lastCheck.toISOString(),
  });
}
