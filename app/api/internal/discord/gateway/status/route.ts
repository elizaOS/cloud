/**
 * Discord Gateway Status API
 *
 * POST /api/internal/discord/gateway/status
 *
 * Updates bot connection status from gateway pods.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { discordGatewayService } from "@/lib/services/discord-gateway";
import { z } from "zod";

export const dynamic = "force-dynamic";

const StatusUpdateSchema = z.object({
  connection_id: z.string().uuid(),
  pod_name: z.string(),
  status: z.enum(["connecting", "connected", "disconnected", "error"]),
  error_message: z.string().optional(),
  guild_count: z.number().optional(),
  session_id: z.string().optional(),
  resume_gateway_url: z.string().optional(),
  sequence_number: z.number().optional(),
});

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

  const body = await request.json();

  const parsed = StatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { connection_id, pod_name, status, error_message, guild_count, session_id, resume_gateway_url, sequence_number } = parsed.data;

  logger.info("[Gateway Status] Status update received", {
    connectionId: connection_id,
    podName: pod_name,
    status,
    guildCount: guild_count,
  });

  // Map gateway status to database status
  const dbStatus = mapStatus(status);

  await discordGatewayService.updateConnectionStatus(connection_id, dbStatus, {
    errorMessage: error_message,
    sessionId: session_id,
    resumeGatewayUrl: resume_gateway_url,
    sequenceNumber: sequence_number,
    gatewayPod: pod_name,
  });

  // Update guild count if provided
  if (guild_count !== undefined) {
    await discordGatewayService.updateGuildCount(connection_id, guild_count);
  }

  return NextResponse.json({ success: true });
}

function mapStatus(status: string): "connecting" | "connected" | "disconnected" | "error" | "resuming" {
  switch (status) {
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "disconnected":
      return "disconnected";
    case "error":
      return "error";
    default:
      return "disconnected";
  }
}
