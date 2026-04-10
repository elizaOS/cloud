import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withInternalAuth } from "@/lib/auth/internal-api";
import { miladyGatewayRouterService } from "@/lib/services/milady-gateway-router";

export const dynamic = "force-dynamic";

const senderSchema = z.object({
  id: z.string().trim().min(1),
  username: z.string().trim().min(1),
  displayName: z.string().trim().optional(),
  avatar: z.string().trim().nullable().optional(),
});

const requestSchema = z.object({
  guildId: z.string().trim().min(1).optional(),
  channelId: z.string().trim().min(1),
  messageId: z.string().trim().min(1),
  content: z.string().trim().min(1),
  sender: senderSchema,
});

type ManagedDiscordRouteResponse = {
  handled: boolean;
  replyText?: string | null;
  reason?: string;
  agentId?: string;
};

export const POST = withInternalAuth(async (request: NextRequest) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { guildId, channelId, messageId, content, sender } = parsed.data;

  const routed = await miladyGatewayRouterService.routeDiscordMessage({
    guildId: guildId ?? null,
    channelId,
    messageId,
    content,
    sender,
  });

  return NextResponse.json<ManagedDiscordRouteResponse>(routed);
});
