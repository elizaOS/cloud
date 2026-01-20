/**
 * Discord Gateway Status API
 *
 * Receives connection status updates from gateway pods.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateInternalApiKey } from "@/lib/auth/internal-api";
import { discordConnectionsRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";
import type { ConnectionStatusUpdate } from "@/lib/services/discord-gateway/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = validateInternalApiKey(request);
  if (authError) return authError;

  const body = (await request.json()) as ConnectionStatusUpdate;

  const { connection_id, pod_name, status, error_message } = body;

  if (!connection_id || !status) {
    return NextResponse.json(
      { error: "connection_id and status required" },
      { status: 400 },
    );
  }

  logger.info("[Gateway Status] Updating connection status", {
    connectionId: connection_id,
    podName: pod_name,
    status,
    hasError: !!error_message,
  });

  const updated = await discordConnectionsRepository.updateStatus(
    connection_id,
    status,
    error_message,
  );

  if (!updated) {
    return NextResponse.json(
      { error: "Connection not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
