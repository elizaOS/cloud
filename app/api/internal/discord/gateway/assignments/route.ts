/**
 * Discord Gateway Assignments API
 *
 * Returns bot assignments for a gateway pod.
 * Called by the discord-gateway service to get bots to connect.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateInternalApiKey } from "@/lib/auth/internal-api";
import { discordConnectionsRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = validateInternalApiKey(request);
  if (authError) return authError;

  const podName = request.nextUrl.searchParams.get("pod");
  if (!podName) {
    return NextResponse.json(
      { error: "Pod name required" },
      { status: 400 },
    );
  }

  logger.info("[Gateway Assignments] Fetching assignments", { podName });

  const assignments = await discordConnectionsRepository.getAssignmentsForPod(
    podName,
  );

  logger.info("[Gateway Assignments] Returning assignments", {
    podName,
    count: assignments.length,
  });

  return NextResponse.json({ assignments });
}
