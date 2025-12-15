/**
 * Internal Discord Events Endpoint
 *
 * POST /api/internal/discord/events
 *
 * Receives events from Discord gateway pods and routes them to agents.
 * This endpoint is for internal use only and requires the internal API key.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { discordEventRouter } from "@/lib/services/discord-gateway";
import type {
  RoutableEvent,
  DiscordEventType,
  DiscordMessage,
} from "@/lib/services/discord-gateway";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const EventPayloadSchema = z.object({
  connection_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  platform_connection_id: z.string().uuid(),
  event_type: z.string(),
  event_id: z.string(),
  guild_id: z.string(),
  channel_id: z.string().optional(),
  data: z.record(z.unknown()),
  timestamp: z.string().optional(),
});

type EventPayload = z.infer<typeof EventPayloadSchema>;

/**
 * Verify internal API key.
 */
function verifyInternalApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-internal-api-key");
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    logger.error("[Discord Events] INTERNAL_API_KEY not configured");
    return false;
  }

  return apiKey === expectedKey;
}

/**
 * POST /api/internal/discord/events
 *
 * Receive and route Discord events from gateway pods.
 */
export async function POST(request: NextRequest) {
  // Verify internal API key
  if (!verifyInternalApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Validate payload
  const parsed = EventPayloadSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("[Discord Events] Invalid payload", {
      errors: parsed.error.issues,
    });
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  logger.info("[Discord Events] Received event", {
    eventType: payload.event_type,
    guildId: payload.guild_id,
    channelId: payload.channel_id,
    organizationId: payload.organization_id,
  });

  // Build routable event
  const routableEvent: RoutableEvent = {
    eventType: payload.event_type as DiscordEventType,
    eventId: payload.event_id,
    guildId: payload.guild_id,
    channelId: payload.channel_id,
    organizationId: payload.organization_id,
    platformConnectionId: payload.platform_connection_id,
    data: {
      message: extractMessage(payload),
      raw: payload.data,
    },
    timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
  };

  // Check for social feed reply before routing
  if (
    routableEvent.eventType === "MESSAGE_CREATE" &&
    routableEvent.data.message?.referenced_message
  ) {
    const message = routableEvent.data.message;
    const referencedMessage = message.referenced_message;

    if (referencedMessage && message.content) {
      const { replyRouterService } =
        await import("@/lib/services/social-feed/reply-router");

      const replyResult = await replyRouterService.processIncomingReply({
        platform: "discord",
        channelId: message.channel_id,
        serverId: message.guild_id,
        messageId: message.id,
        replyToMessageId: referencedMessage.id,
        userId: message.author.id,
        username: message.author.username,
        displayName:
          message.member?.nick ??
          message.author.global_name ??
          message.author.username,
        content: message.content,
      });

      if (replyResult) {
        // This was a reply to a social notification - confirmation prompt was sent
        logger.info("[Discord Events] Social feed reply processed", {
          channelId: message.channel_id,
          confirmationId: replyResult.confirmationId,
          success: replyResult.success,
        });
        // Continue with normal routing as well
      }
    }
  }

  // Route the event
  const results = await discordEventRouter.routeEvent(routableEvent);

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    success: true,
    routed: results.length,
    successful,
    failed,
    results: results.map((r) => ({
      routeId: r.routeId,
      routeType: r.routeType,
      success: r.success,
      responseTime: r.responseTime,
      error: r.error,
    })),
  });
}

/**
 * Extract Discord message from event data.
 */
function extractMessage(payload: EventPayload): DiscordMessage | undefined {
  if (payload.event_type !== "MESSAGE_CREATE") {
    return undefined;
  }

  const data = payload.data as Record<string, unknown>;

  if (!data.id || !data.content || !data.author) {
    return undefined;
  }

  return {
    id: data.id as string,
    channel_id: data.channel_id as string,
    guild_id: data.guild_id as string | undefined,
    author: data.author as DiscordMessage["author"],
    member: data.member as DiscordMessage["member"],
    content: data.content as string,
    timestamp: data.timestamp as string,
    edited_timestamp: data.edited_timestamp as string | null,
    tts: data.tts as boolean,
    mention_everyone: data.mention_everyone as boolean,
    mentions: (data.mentions as DiscordMessage["mentions"]) ?? [],
    mention_roles: (data.mention_roles as string[]) ?? [],
    attachments: (data.attachments as DiscordMessage["attachments"]) ?? [],
    embeds: (data.embeds as DiscordMessage["embeds"]) ?? [],
    pinned: data.pinned as boolean,
    type: data.type as number,
    referenced_message: data.referenced_message as
      | DiscordMessage
      | null
      | undefined,
  };
}

/**
 * GET /api/internal/discord/events
 *
 * Health check for the events endpoint.
 */
export async function GET(request: NextRequest) {
  if (!verifyInternalApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "ok",
    service: "discord-events",
    timestamp: new Date().toISOString(),
  });
}
