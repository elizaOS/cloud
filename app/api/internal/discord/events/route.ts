/**
 * Discord Events API
 *
 * Receives Discord events forwarded from the gateway service.
 * Routes events to the appropriate Eliza agent for processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateInternalApiKey } from "@/lib/auth/internal-api";
import { routeDiscordEvent } from "@/lib/services/discord-gateway/event-router";
import { DiscordEventPayloadSchema } from "@/lib/services/discord-gateway/schemas";
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

  const parsed = DiscordEventPayloadSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("[Discord Events] Invalid payload", {
      errors: parsed.error.errors,
    });
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.errors },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  logger.info("[Discord Events] Received event", {
    connectionId: payload.connection_id,
    eventType: payload.event_type,
    eventId: payload.event_id,
    organizationId: payload.organization_id,
    guildId: payload.guild_id,
    channelId: payload.channel_id,
  });

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
}
