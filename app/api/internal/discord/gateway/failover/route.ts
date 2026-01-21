/**
 * Discord Gateway Failover API
 *
 * Handles failover requests when a gateway pod detects a dead pod.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateInternalApiKey } from "@/lib/auth/internal-api";
import { discordConnectionsRepository } from "@/db/repositories";
import { FailoverRequestSchema } from "@/lib/services/discord-gateway/schemas";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = validateInternalApiKey(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = FailoverRequestSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("[Gateway Failover] Invalid payload", {
      errors: parsed.error.errors,
    });
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.errors },
      { status: 400 },
    );
  }

  const { claiming_pod, dead_pod } = parsed.data;

  // Prevent self-claiming (could cause data inconsistency)
  if (claiming_pod === dead_pod) {
    logger.warn("[Gateway Failover] Rejected self-claim attempt", {
      pod: claiming_pod,
    });
    return NextResponse.json(
      { error: "Cannot claim connections from self" },
      { status: 400 },
    );
  }

  // Verify the dead pod hasn't had a recent heartbeat (prevent false failovers)
  const DEAD_POD_THRESHOLD_MS = 45_000; // Should match gateway-manager constant
  const recentHeartbeat =
    await discordConnectionsRepository.hasRecentHeartbeat(
      dead_pod,
      DEAD_POD_THRESHOLD_MS,
    );

  if (recentHeartbeat) {
    logger.warn("[Gateway Failover] Rejected claim - pod has recent heartbeat", {
      claimingPod: claiming_pod,
      deadPod: dead_pod,
    });
    return NextResponse.json(
      { error: "Pod is not dead - has recent heartbeat" },
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

  return NextResponse.json({ claimed });
}
