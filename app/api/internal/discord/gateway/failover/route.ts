/**
 * Discord Gateway Failover API
 *
 * Handles failover requests when a gateway pod detects a dead pod.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateInternalApiKey } from "@/lib/auth/internal-api";
import { discordConnectionsRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";
import type { FailoverRequest, FailoverResponse } from "@/lib/services/discord-gateway/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = validateInternalApiKey(request);
  if (authError) return authError;

  const body = (await request.json()) as FailoverRequest;

  const { claiming_pod, dead_pod } = body;

  if (!claiming_pod || !dead_pod) {
    return NextResponse.json(
      { error: "claiming_pod and dead_pod required" },
      { status: 400 },
    );
  }

  logger.warn("[Gateway Failover] Processing failover request", {
    claimingPod: claiming_pod,
    deadPod: dead_pod,
  });

  const claimed = await discordConnectionsRepository.reassignFromDeadPod(
    dead_pod,
    claiming_pod,
  );

  logger.info("[Gateway Failover] Failover completed", {
    claimingPod: claiming_pod,
    deadPod: dead_pod,
    claimed,
  });

  const response: FailoverResponse = { claimed };
  return NextResponse.json(response);
}
