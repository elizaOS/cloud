/**
 * Discord Events API
 *
 * Receives Discord events forwarded from the gateway service.
 * Routes events to the appropriate Eliza agent for processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateInternalApiKey } from "@/lib/auth/internal-api";
import { routeDiscordEvent } from "@/lib/services/discord-gateway/event-router";
import { logger } from "@/lib/utils/logger";
import type { DiscordEventPayload } from "@/lib/services/discord-gateway/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = validateInternalApiKey(request);
  if (authError) return authError;

  const payload = (await request.json()) as DiscordEventPayload;

  const {
    connection_id,
    event_type,
    event_id,
    organization_id,
    guild_id,
    channel_id,
  } = payload;

  logger.info("[Discord Events] Received event", {
    connectionId: connection_id,
    eventType: event_type,
    eventId: event_id,
    organizationId: organization_id,
    guildId: guild_id,
    channelId: channel_id,
  });

  const result = await routeDiscordEvent(payload);

  if (!result.processed) {
    logger.warn("[Discord Events] Event not processed", {
      connectionId: connection_id,
      eventType: event_type,
      eventId: event_id,
    });
  }

  return NextResponse.json({
    processed: result.processed,
    hasResponse: !!result.response,
  });
}
