/**
 * Discord Gateway Assignments API
 *
 * GET /api/internal/discord/gateway/assignments
 *
 * Returns bot assignments for a specific gateway pod.
 */

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

export async function GET(request: NextRequest) {
  if (!verifyInternalApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const podName = request.nextUrl.searchParams.get("pod");

  if (!podName) {
    return NextResponse.json({ error: "Missing pod parameter" }, { status: 400 });
  }

  logger.info("[Gateway Assignments] Fetching assignments", { podName });

  // Get unassigned connections and assign to this pod
  const unassigned = await discordGatewayService.getUnassignedConnections();
  const assignments: Array<{
    connectionId: string;
    organizationId: string;
    applicationId: string;
    botToken: string;
    intents: number;
  }> = [];

  // Assign up to 10 bots per poll
  const toAssign = unassigned.slice(0, 10);

  for (const conn of toAssign) {
    const assigned = await discordGatewayService.assignPod(conn.id, podName);
    if (assigned) {
      const token = await discordGatewayService.getBotToken(conn.id);
      if (token) {
        assignments.push({
          connectionId: conn.id,
          organizationId: conn.organization_id,
          applicationId: conn.application_id,
          botToken: token,
          intents: conn.intents ?? 3276799,
        });
      }
    }
  }

  // Also get already assigned connections for this pod
  const existing = await discordGatewayService.getConnectionsByPod(podName);
  for (const conn of existing) {
    if (!assignments.find((a) => a.connectionId === conn.id)) {
      const token = await discordGatewayService.getBotToken(conn.id);
      if (token) {
        assignments.push({
          connectionId: conn.id,
          organizationId: conn.organization_id,
          applicationId: conn.application_id,
          botToken: token,
          intents: conn.intents ?? 3276799,
        });
      }
    }
  }

  logger.info("[Gateway Assignments] Returning assignments", {
    podName,
    count: assignments.length,
  });

  return NextResponse.json({ assignments });
}
