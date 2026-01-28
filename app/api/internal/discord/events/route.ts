/**
 * Discord Events API
 *
 * Receives Discord events forwarded from the gateway service.
 * Routes events to the appropriate Eliza agent for processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateInternalApiKey } from "@/lib/auth/internal-api";
import { routeDiscordEvent } from "@/lib/services/gateway-discord/event-router";
import { logger } from "@/lib/utils/logger";
import {
  DiscordEventPayloadSchema,
  type DiscordEventPayload,
} from "@/lib/services/gateway-discord/schemas";

export const dynamic = "force-dynamic";

/**
 * Validate payload with Zod, falling back to basic validation if Zod fails
 * (Turbopack can have module loading issues with Zod schemas)
 */
function validatePayload(body: unknown): { success: true; data: DiscordEventPayload } | { success: false; error: string } {
  // Try Zod validation first
  try {
    if (DiscordEventPayloadSchema?.safeParse) {
      const parsed = DiscordEventPayloadSchema.safeParse(body);
      if (parsed.success) {
        return { success: true, data: parsed.data };
      }
      return { success: false, error: parsed.error.issues.map((e: { message: string }) => e.message).join(", ") };
    }
  } catch (zodError) {
    logger.warn("[Discord Events] Zod validation unavailable, using fallback", {
      error: zodError instanceof Error ? zodError.message : String(zodError),
    });
  }

  // Fallback to basic validation
  const payload = body as DiscordEventPayload;
  if (!payload?.connection_id || !payload?.event_type || !payload?.data) {
    return {
      success: false,
      error: `Missing required fields: ${[
        !payload?.connection_id && "connection_id",
        !payload?.event_type && "event_type",
        !payload?.data && "data",
      ].filter(Boolean).join(", ")}`,
    };
  }

  return { success: true, data: payload };
}

export async function POST(request: NextRequest) {
  const authError = validateInternalApiKey(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validatePayload(body);
  if (!validation.success) {
    logger.warn("[Discord Events] Invalid payload", { error: validation.error });
    return NextResponse.json(
      { error: "Invalid payload", details: validation.error },
      { status: 400 },
    );
  }

  const payload = validation.data;

  logger.info("[Discord Events] Received event", {
    connectionId: payload.connection_id,
    eventType: payload.event_type,
    eventId: payload.event_id,
    organizationId: payload.organization_id,
    guildId: payload.guild_id,
    channelId: payload.channel_id,
  });

  try {
    const result = await routeDiscordEvent(payload);

    if (!result.processed) {
      logger.warn("[Discord Events] Event not processed", {
        connectionId: payload.connection_id,
        eventType: payload.event_type,
        eventId: payload.event_id,
      });
    }

    return NextResponse.json({
      processed: result.processed,
      hasResponse: !!result.response,
    });
  } catch (error) {
    logger.error("[Discord Events] Error processing event", {
      connectionId: payload.connection_id,
      eventType: payload.event_type,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
