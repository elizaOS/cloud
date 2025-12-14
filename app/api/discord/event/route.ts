/**
 * Discord Event Handler for Containers
 *
 * POST /api/discord/event
 *
 * Receives Discord events forwarded from the gateway and processes them
 * through the appropriate Eliza runtime. This endpoint is called by the
 * Discord event router when using "container" route type.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { discordMessageSender } from "@/lib/services/discord-gateway";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DiscordEventSchema = z.object({
  event_type: z.string(),
  connection_id: z.string().uuid(),
  guild_id: z.string(),
  channel_id: z.string().optional(),
  data: z.record(z.unknown()),
  timestamp: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const organizationId = request.headers.get("x-organization-id");
  const connectionId = request.headers.get("x-discord-connection-id");

  if (!organizationId) {
    return NextResponse.json({ error: "Missing organization ID" }, { status: 400 });
  }

  const body = await request.json();

  const parsed = DiscordEventSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("[Discord Event] Invalid payload", { errors: parsed.error.issues });
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const event = parsed.data;

  logger.info("[Discord Event] Processing event", {
    eventType: event.event_type,
    guildId: event.guild_id,
    channelId: event.channel_id,
    connectionId: event.connection_id,
  });

  // Only process MESSAGE_CREATE events for now
  if (event.event_type !== "MESSAGE_CREATE") {
    logger.debug("[Discord Event] Skipping non-message event", { eventType: event.event_type });
    return NextResponse.json({ success: true, processed: false, reason: "Not a message event" });
  }

  const data = event.data;
  const content = data.content as string | undefined;
  const authorId = (data.author as { id?: string })?.id;
  const authorBot = (data.author as { bot?: boolean })?.bot;

  // Skip bot messages
  if (authorBot) {
    return NextResponse.json({ success: true, processed: false, reason: "Bot message" });
  }

  if (!content || !event.channel_id) {
    return NextResponse.json({ success: true, processed: false, reason: "No content or channel" });
  }

  // Create a room ID based on the Discord channel
  const roomId = `discord:${event.guild_id}:${event.channel_id}`;

  // Process message through Eliza runtime
  const result = await agentRuntime.handleMessage(
    roomId,
    { text: content },
    undefined, // Use default character or configure per-connection
    {
      userId: authorId ?? "discord-user",
      metadata: {
        source: "discord",
        connection_id: event.connection_id,
        guild_id: event.guild_id,
        channel_id: event.channel_id,
        message_id: data.id as string,
      },
    }
  );

  // Send response back to Discord
  const responseText =
    typeof result.message.content === "string"
      ? result.message.content
      : result.message.content?.text;

  if (responseText && event.channel_id) {
    const sendResult = await discordMessageSender.sendMessage(event.connection_id, {
      channelId: event.channel_id,
      content: responseText,
      replyTo: data.id as string | undefined,
    });

    if (!sendResult.success) {
      logger.error("[Discord Event] Failed to send response", {
        connectionId: event.connection_id,
        channelId: event.channel_id,
        error: sendResult.error,
      });
    } else {
      logger.info("[Discord Event] Response sent", {
        connectionId: event.connection_id,
        channelId: event.channel_id,
        messageId: sendResult.messageId,
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: true,
    response: responseText ? { length: responseText.length } : null,
  });
}
