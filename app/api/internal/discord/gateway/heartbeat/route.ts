/**
 * Discord Gateway Heartbeat API
 *
 * Receives heartbeat updates from gateway pods to update last_heartbeat
 * in the database for failover detection.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateInternalApiKey } from "@/lib/auth/internal-api";
import { discordConnectionsRepository } from "@/db/repositories";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const HeartbeatSchema = z.object({
  pod_name: z.string().min(1),
  connection_ids: z.array(z.string().uuid()),
});

export async function POST(request: NextRequest) {
  const authError = validateInternalApiKey(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = HeartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.errors },
      { status: 400 },
    );
  }

  const { pod_name, connection_ids } = parsed.data;

  if (connection_ids.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  try {
    const updated = await discordConnectionsRepository.updateHeartbeatBatch(
      pod_name,
      connection_ids,
    );

    logger.debug("[Gateway Heartbeat] Updated heartbeats", {
      podName: pod_name,
      requestedCount: connection_ids.length,
      updatedCount: updated,
    });

    return NextResponse.json({ updated });
  } catch (error) {
    logger.error("[Gateway Heartbeat] Failed to update heartbeats", {
      podName: pod_name,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to update heartbeats" },
      { status: 500 },
    );
  }
}
