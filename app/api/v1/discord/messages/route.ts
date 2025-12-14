import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordMessageSender, discordGatewayService } from "@/lib/services/discord-gateway";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SendMessageSchema = z.object({
  connection_id: z.string().uuid(),
  channel_id: z.string(),
  content: z.string().max(2000).optional(),
  embeds: z.array(z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    url: z.string().url().optional(),
    color: z.number().int().optional(),
    fields: z.array(z.object({
      name: z.string(),
      value: z.string(),
      inline: z.boolean().optional(),
    })).optional(),
  })).max(10).optional(),
  reply_to: z.string().optional(),
});

const EditMessageSchema = z.object({
  connection_id: z.string().uuid(),
  channel_id: z.string(),
  message_id: z.string(),
  content: z.string().max(2000).optional(),
  embeds: z.array(z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    url: z.string().url().optional(),
    color: z.number().int().optional(),
  })).max(10).optional(),
});

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();

  const parsed = SendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { connection_id, channel_id, content, embeds, reply_to } = parsed.data;

  // Verify connection belongs to organization
  const connection = await discordGatewayService.getConnection(connection_id);
  if (!connection || connection.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Connection not found" },
      { status: 404 }
    );
  }

  // Require content or embeds
  if (!content && (!embeds || embeds.length === 0)) {
    return NextResponse.json(
      { success: false, error: "Message must have content or embeds" },
      { status: 400 }
    );
  }

  logger.info("[Discord Messages] Sending message", {
    organizationId: user.organization_id,
    connectionId: connection_id,
    channelId: channel_id,
  });

  const result = await discordMessageSender.sendMessage(connection_id, {
    channelId: channel_id,
    content,
    embeds,
    replyTo: reply_to,
  });

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      message_id: result.messageId,
      channel_id: result.channelId,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();

  const parsed = EditMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { connection_id, channel_id, message_id, content, embeds } = parsed.data;

  // Verify connection belongs to organization
  const connection = await discordGatewayService.getConnection(connection_id);
  if (!connection || connection.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Connection not found" },
      { status: 404 }
    );
  }

  logger.info("[Discord Messages] Editing message", {
    organizationId: user.organization_id,
    connectionId: connection_id,
    channelId: channel_id,
    messageId: message_id,
  });

  const result = await discordMessageSender.editMessage(
    connection_id,
    channel_id,
    message_id,
    content,
    embeds
  );

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      message_id: result.messageId,
      channel_id: result.channelId,
    },
  });
}
