import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { withInternalAuth } from "@/lib/auth/internal-api";
import type { BridgeRequest } from "@/lib/services/milady-sandbox";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const senderSchema = z.object({
  id: z.string().trim().min(1),
  username: z.string().trim().min(1),
  displayName: z.string().trim().optional(),
  avatar: z.string().trim().nullable().optional(),
});

const requestSchema = z.object({
  guildId: z.string().trim().min(1),
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

  const linkedSandboxes = await miladySandboxesRepository.findByManagedDiscordGuildId(guildId);
  if (linkedSandboxes.length === 0) {
    return NextResponse.json<ManagedDiscordRouteResponse>({
      handled: false,
      reason: "not_linked",
    });
  }

  if (linkedSandboxes.length > 1) {
    logger.warn("[managed-discord] Multiple Milady agents linked to the same guild", {
      guildId,
      agentIds: linkedSandboxes.map((sandbox) => sandbox.id),
    });
    return NextResponse.json<ManagedDiscordRouteResponse>({
      handled: false,
      reason: "ambiguous_guild_link",
    });
  }

  const sandbox = linkedSandboxes[0];
  if (!sandbox) {
    return NextResponse.json<ManagedDiscordRouteResponse>({
      handled: false,
      reason: "not_linked",
    });
  }

  if (sandbox.status !== "running") {
    return NextResponse.json<ManagedDiscordRouteResponse>({
      handled: false,
      reason: "agent_not_running",
      agentId: sandbox.id,
    });
  }

  const rpcRequest: BridgeRequest = {
    jsonrpc: "2.0",
    id: randomUUID(),
    method: "message.send",
    params: {
      text: content,
      roomId: `discord-guild:${guildId}:channel:${channelId}`,
      channelType: "GROUP",
      source: "discord",
      sender: {
        id: sender.id,
        username: sender.username,
        ...(sender.displayName ? { displayName: sender.displayName } : {}),
        metadata: {
          discord: {
            userId: sender.id,
            username: sender.username,
            ...(sender.displayName ? { globalName: sender.displayName } : {}),
            ...(sender.avatar ? { avatar: sender.avatar } : {}),
          },
        },
      },
      metadata: {
        discord: {
          guildId,
          channelId,
          messageId,
        },
      },
    },
  };

  const bridgeResponse = await miladySandboxService.bridge(
    sandbox.id,
    sandbox.organization_id,
    rpcRequest,
  );

  if (bridgeResponse.error) {
    logger.warn("[managed-discord] Sandbox bridge rejected Discord message", {
      guildId,
      agentId: sandbox.id,
      error: bridgeResponse.error.message,
    });
    return NextResponse.json<ManagedDiscordRouteResponse>({
      handled: false,
      reason: "bridge_failed",
      agentId: sandbox.id,
    });
  }

  const replyText =
    bridgeResponse.result &&
    typeof bridgeResponse.result === "object" &&
    typeof bridgeResponse.result.text === "string"
      ? bridgeResponse.result.text
      : null;

  return NextResponse.json<ManagedDiscordRouteResponse>({
    handled: true,
    replyText,
    agentId: sandbox.id,
  });
});
