import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { discordGatewayService } from "@/lib/services/discord-gateway";

export const dynamic = "force-dynamic";

function verifyInternalApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-internal-api-key");
  const expectedKey = process.env.INTERNAL_API_KEY;
  if (!expectedKey) return false;
  return apiKey === expectedKey;
}

export async function POST(request: NextRequest) {
  if (!verifyInternalApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { claiming_pod, dead_pod } = (await request.json()) as {
    claiming_pod: string;
    dead_pod: string;
  };

  logger.info("[Gateway Failover] Processing failover", {
    claimingPod: claiming_pod,
    deadPod: dead_pod,
  });

  // Get connections assigned to the dead pod
  const orphanedConnections =
    await discordGatewayService.getConnectionsByPod(dead_pod);

  let claimed = 0;
  for (const conn of orphanedConnections) {
    const success = await discordGatewayService.assignPod(
      conn.id,
      claiming_pod,
    );
    if (success) {
      await discordGatewayService.updateConnectionStatus(
        conn.id,
        "disconnected",
        {
          gatewayPod: claiming_pod,
        },
      );
      claimed++;
    }
  }

  logger.info("[Gateway Failover] Failover complete", {
    claimingPod: claiming_pod,
    deadPod: dead_pod,
    claimed,
  });

  return NextResponse.json({ success: true, claimed });
}
