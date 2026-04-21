import { createHash, randomUUID } from "crypto";
import { type MiladySandbox, miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { usersRepository } from "@/db/repositories/users";
import {
  readManagedMiladyDiscordBinding,
  readManagedMiladyDiscordGateway,
} from "@/lib/services/eliza-agent-config";
import {
  type MiladyGatewayRelaySession,
  miladyGatewayRelayService,
} from "@/lib/services/milady-gateway-relay";
import type { BridgeRequest, BridgeResponse } from "@/lib/services/eliza-sandbox";
import { elizaSandboxService } from "@/lib/services/eliza-sandbox";
import { logger } from "@/lib/utils/logger";
import { normalizePhoneNumber } from "@/lib/utils/phone-normalization";

export type MiladyGatewayRouteReason =
  | "not_linked"
  | "unknown_owner"
  | "owner_org_mismatch"
  | "sender_not_guild_owner"
  | "owner_agent_not_running"
  | "ambiguous_target"
  | "bridge_failed";

export interface MiladyGatewaySender {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string | null;
}

export interface MiladyGatewayRouteResult {
  handled: boolean;
  replyText?: string | null;
  reason?: MiladyGatewayRouteReason;
  agentId?: string;
  organizationId?: string;
  userId?: string;
  roomId?: string;
}

interface ResolvedMiladyTarget {
  kind: "sandbox" | "local-session";
  sandbox?: MiladySandbox;
  session?: MiladyGatewayRelaySession;
  sessions?: MiladyGatewayRelaySession[];
}

function asConfigRecord(
  value: MiladySandbox["agent_config"],
): Record<string, unknown> | null | undefined {
  return (value as Record<string, unknown> | null | undefined) ?? null;
}

function isNonGatewayRunningSandbox(sandbox: MiladySandbox): boolean {
  return (
    sandbox.status === "running" &&
    !readManagedMiladyDiscordGateway(asConfigRecord(sandbox.agent_config))
  );
}

function chooseSingleSandboxTarget(sandboxes: MiladySandbox[]): {
  target?: ResolvedMiladyTarget;
  reason?: MiladyGatewayRouteReason;
  agentId?: string;
} {
  const running = sandboxes.filter(isNonGatewayRunningSandbox);
  if (running.length === 1) {
    return {
      target: {
        kind: "sandbox",
        sandbox: running[0]!,
      },
    };
  }

  if (running.length > 1) {
    return {
      reason: "ambiguous_target",
    };
  }

  if (sandboxes.length > 0) {
    return {
      reason: "owner_agent_not_running",
      agentId: sandboxes[0]?.id,
    };
  }

  return {
    reason: "owner_agent_not_running",
  };
}

function hashToUuid(input: string): string {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 32);
  const chars = hex.split("");
  chars[12] = "4";
  chars[16] = ((Number.parseInt(chars[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return [
    chars.slice(0, 8).join(""),
    chars.slice(8, 12).join(""),
    chars.slice(12, 16).join(""),
    chars.slice(16, 20).join(""),
    chars.slice(20, 32).join(""),
  ].join("-");
}

function buildDirectConversationRoomId(
  agentId: string,
  platform: string,
  a: string,
  b: string,
): string {
  const normalized = [normalizePhoneNumber(a), normalizePhoneNumber(b)].sort().join("-");
  return hashToUuid(`room:${agentId}:${platform}:${normalized}`);
}

function buildDirectConversationRoomIdFromIds(
  agentId: string,
  platform: string,
  a: string,
  b: string,
): string {
  const normalized = [a.trim(), b.trim()].sort().join("-");
  return hashToUuid(`room:${agentId}:${platform}:${normalized}`);
}

function buildMediaAttachments(
  mediaUrls?: string[],
): Array<{ type: "image"; url: string }> | undefined {
  if (!mediaUrls?.length) {
    return undefined;
  }
  return mediaUrls.map((url) => ({
    type: "image" as const,
    url,
  }));
}

function extractReplyText(response: BridgeResponse): string | null {
  if (
    response.result &&
    typeof response.result === "object" &&
    typeof response.result.text === "string"
  ) {
    return response.result.text;
  }

  return null;
}

function extractRoomId(rpc: BridgeRequest): string | undefined {
  const params = rpc.params;
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const roomId = (params as Record<string, unknown>).roomId;
  return typeof roomId === "string" && roomId.trim() ? roomId.trim() : undefined;
}

export class MiladyGatewayRouterService {
  private async listOwnedSandboxes(orgId: string, userId: string): Promise<MiladySandbox[]> {
    const sandboxes = await miladySandboxesRepository.listByOrganization(orgId);
    return sandboxes.filter((sandbox) => sandbox.user_id === userId);
  }

  private async resolveOwnedRuntimeTarget(
    organizationId: string,
    userId: string,
    sandboxes?: MiladySandbox[],
  ): Promise<{
    target?: ResolvedMiladyTarget;
    reason?: MiladyGatewayRouteReason;
    agentId?: string;
    userId?: string;
  }> {
    const localSessions = await miladyGatewayRelayService.listOwnerSessions(organizationId, userId);
    if (localSessions.length >= 1) {
      return {
        target: {
          kind: "local-session",
          session: localSessions[0],
          sessions: localSessions,
        },
        userId,
      };
    }

    const ownedSandboxes = sandboxes ?? (await this.listOwnedSandboxes(organizationId, userId));
    const resolved = chooseSingleSandboxTarget(ownedSandboxes);
    return {
      ...resolved,
      userId,
    };
  }

  private async resolveDiscordTarget(args: {
    guildId?: string | null;
    senderDiscordUserId: string;
  }): Promise<{
    target?: ResolvedMiladyTarget;
    reason?: MiladyGatewayRouteReason;
    agentId?: string;
    userId?: string;
  }> {
    const senderDiscordUserId = args.senderDiscordUserId.trim();

    if (args.guildId?.trim()) {
      const linkedSandboxes = await miladySandboxesRepository.findByManagedDiscordGuildId(
        args.guildId.trim(),
      );
      const ownedLinkedSandboxes = linkedSandboxes.filter((sandbox) => {
        const binding = readManagedMiladyDiscordBinding(asConfigRecord(sandbox.agent_config));
        return binding?.adminDiscordUserId === senderDiscordUserId;
      });

      if (ownedLinkedSandboxes.length === 0) {
        return {
          reason: linkedSandboxes.length > 0 ? "sender_not_guild_owner" : "not_linked",
        };
      }

      const directlyBoundSandboxes = ownedLinkedSandboxes.filter(
        (sandbox) => !readManagedMiladyDiscordGateway(asConfigRecord(sandbox.agent_config)),
      );
      if (directlyBoundSandboxes.length > 0) {
        return chooseSingleSandboxTarget(directlyBoundSandboxes);
      }

      const owner = await usersRepository.findByDiscordIdWithOrganization(senderDiscordUserId);
      if (!owner?.organization_id) {
        return {
          reason: "unknown_owner",
        };
      }

      return this.resolveOwnedRuntimeTarget(owner.organization_id, owner.id);
    }

    const owner = await usersRepository.findByDiscordIdWithOrganization(senderDiscordUserId);
    if (!owner) {
      return {
        reason: "unknown_owner",
      };
    }

    if (!owner.organization_id) {
      return {
        reason: "unknown_owner",
      };
    }

    const sandboxes = await this.listOwnedSandboxes(owner.organization_id, owner.id);
    const exactBoundMatches = sandboxes.filter((sandbox) => {
      const binding = readManagedMiladyDiscordBinding(asConfigRecord(sandbox.agent_config));
      return binding?.adminDiscordUserId === senderDiscordUserId;
    });

    const preferred = exactBoundMatches.length > 0 ? exactBoundMatches : sandboxes;
    return this.resolveOwnedRuntimeTarget(owner.organization_id, owner.id, preferred);
  }

  private async resolvePhoneTarget(args: { organizationId: string; senderId: string }): Promise<{
    target?: ResolvedMiladyTarget;
    reason?: MiladyGatewayRouteReason;
    agentId?: string;
    userId?: string;
  }> {
    const senderId = args.senderId.trim();
    if (!senderId) {
      return {
        reason: "unknown_owner",
      };
    }

    const owner = senderId.includes("@")
      ? await usersRepository.findByEmailWithOrganization(senderId.toLowerCase())
      : await usersRepository.findByPhoneNumberWithOrganization(normalizePhoneNumber(senderId));

    if (!owner) {
      return {
        reason: "unknown_owner",
      };
    }

    if (!owner.organization_id || owner.organization_id !== args.organizationId) {
      return {
        reason: "owner_org_mismatch",
      };
    }

    return this.resolveOwnedRuntimeTarget(owner.organization_id, owner.id);
  }

  private async routeToTarget(
    target: ResolvedMiladyTarget,
    rpc: BridgeRequest,
  ): Promise<MiladyGatewayRouteResult> {
    if (target.kind === "local-session" && target.session) {
      const sessions = target.sessions ?? [target.session];
      const responses = await Promise.all(
        sessions.map(async (session) => ({
          session,
          response: await miladyGatewayRelayService.routeToSession(session, rpc),
        })),
      );

      const successful = responses.filter((entry) => !entry.response.error);
      for (const entry of responses) {
        if (!entry.response.error) {
          continue;
        }
        logger.warn("[milady-gateway] Local relay rejected inbound message", {
          agentId: entry.session.runtimeAgentId,
          organizationId: entry.session.organizationId,
          method: rpc.method,
          error: entry.response.error.message,
        });
      }

      if (successful.length === 0) {
        return {
          handled: false,
          reason: "bridge_failed",
          agentId: sessions[0]?.runtimeAgentId,
          organizationId: sessions[0]?.organizationId,
          roomId: extractRoomId(rpc),
        };
      }

      const primary =
        successful.find((entry) => extractReplyText(entry.response) !== null) ?? successful[0]!;

      return {
        handled: true,
        replyText: extractReplyText(primary.response),
        agentId: primary.session.runtimeAgentId,
        organizationId: primary.session.organizationId,
        roomId: extractRoomId(rpc),
      };
    }

    if (!target.sandbox) {
      return {
        handled: false,
        reason: "bridge_failed",
        roomId: extractRoomId(rpc),
      };
    }

    const response = await elizaSandboxService.bridge(
      target.sandbox.id,
      target.sandbox.organization_id,
      rpc,
    );

    if (response.error) {
      logger.warn("[milady-gateway] Sandbox bridge rejected inbound message", {
        agentId: target.sandbox.id,
        organizationId: target.sandbox.organization_id,
        method: rpc.method,
        error: response.error.message,
      });
      return {
        handled: false,
        reason: "bridge_failed",
        agentId: target.sandbox.id,
        organizationId: target.sandbox.organization_id,
        roomId: extractRoomId(rpc),
      };
    }

    return {
      handled: true,
      replyText: extractReplyText(response),
      agentId: target.sandbox.id,
      organizationId: target.sandbox.organization_id,
      roomId: extractRoomId(rpc),
    };
  }

  async routeDiscordMessage(args: {
    guildId?: string | null;
    channelId: string;
    messageId: string;
    content: string;
    sender: MiladyGatewaySender;
  }): Promise<MiladyGatewayRouteResult> {
    const resolved = await this.resolveDiscordTarget({
      guildId: args.guildId ?? null,
      senderDiscordUserId: args.sender.id,
    });

    if (!resolved.target) {
      return {
        handled: false,
        reason: resolved.reason,
        agentId: resolved.agentId,
        userId: resolved.userId,
      };
    }

    const rpcRequest: BridgeRequest = {
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "message.send",
      params: {
        text: args.content,
        roomId: args.guildId?.trim()
          ? `discord-guild:${args.guildId.trim()}:channel:${args.channelId}`
          : `discord-dm:${args.sender.id}:channel:${args.channelId}`,
        channelType: args.guildId?.trim() ? "GROUP" : "DM",
        source: "discord",
        sender: {
          id: args.sender.id,
          username: args.sender.username,
          ...(args.sender.displayName ? { displayName: args.sender.displayName } : {}),
          metadata: {
            discord: {
              userId: args.sender.id,
              username: args.sender.username,
              ...(args.sender.displayName ? { globalName: args.sender.displayName } : {}),
              ...(args.sender.avatar ? { avatar: args.sender.avatar } : {}),
            },
          },
        },
        metadata: {
          discord: {
            ...(args.guildId?.trim() ? { guildId: args.guildId.trim() } : {}),
            channelId: args.channelId,
            messageId: args.messageId,
          },
        },
      },
    };

    const routed = await this.routeToTarget(resolved.target, rpcRequest);
    return {
      ...routed,
      userId: resolved.userId,
    };
  }

  async routePhoneMessage(args: {
    organizationId: string;
    provider: "twilio" | "blooio";
    from: string;
    to: string;
    body: string;
    providerMessageId?: string;
    mediaUrls?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<MiladyGatewayRouteResult> {
    const resolved = await this.resolvePhoneTarget({
      organizationId: args.organizationId,
      senderId: args.from,
    });

    if (!resolved.target) {
      return {
        handled: false,
        reason: resolved.reason,
        agentId: resolved.agentId,
      };
    }

    const targetAgentId =
      resolved.target.kind === "local-session" && resolved.target.session
        ? resolved.target.session.runtimeAgentId
        : (resolved.target.sandbox?.id ?? "unknown-agent");
    const normalizedFrom = normalizePhoneNumber(args.from);
    const normalizedTo = normalizePhoneNumber(args.to);
    const attachments = buildMediaAttachments(args.mediaUrls);
    const rpcRequest: BridgeRequest = {
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "message.send",
      params: {
        text: args.body,
        roomId: buildDirectConversationRoomId(
          targetAgentId,
          args.provider,
          normalizedFrom,
          normalizedTo,
        ),
        channelType: "DM",
        source: args.provider,
        sender: {
          id: normalizedFrom,
          username: normalizedFrom,
          metadata: {
            [args.provider]: {
              sender: normalizedFrom,
              recipient: normalizedTo,
            },
          },
        },
        ...(attachments ? { attachments } : {}),
        metadata: {
          provider: args.provider,
          from: normalizedFrom,
          to: normalizedTo,
          ...(args.providerMessageId ? { providerMessageId: args.providerMessageId } : {}),
          ...(args.metadata ? args.metadata : {}),
        },
      },
    };

    const routed = await this.routeToTarget(resolved.target, rpcRequest);
    return {
      ...routed,
      userId: resolved.userId,
    };
  }

  async routeTelegramMessage(args: {
    organizationId: string;
    chatId: string;
    messageId: string;
    content: string;
    sender: MiladyGatewaySender;
  }): Promise<MiladyGatewayRouteResult> {
    const senderTelegramId = args.sender.id.trim();
    const owner = await usersRepository.findByTelegramIdWithOrganization(senderTelegramId);

    if (!owner) {
      return {
        handled: false,
        reason: "unknown_owner",
      };
    }

    if (!owner.organization_id || owner.organization_id !== args.organizationId) {
      return {
        handled: false,
        reason: "owner_org_mismatch",
      };
    }

    const resolved = await this.resolveOwnedRuntimeTarget(owner.organization_id, owner.id);
    if (!resolved.target) {
      return {
        handled: false,
        reason: resolved.reason,
        agentId: resolved.agentId,
        userId: owner.id,
      };
    }

    const targetAgentId =
      resolved.target.kind === "local-session" && resolved.target.session
        ? resolved.target.session.runtimeAgentId
        : (resolved.target.sandbox?.id ?? owner.id);
    const roomId = buildDirectConversationRoomIdFromIds(
      targetAgentId,
      "telegram",
      senderTelegramId,
      args.chatId,
    );
    const rpcRequest: BridgeRequest = {
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "message.send",
      params: {
        text: args.content,
        roomId,
        channelType: "DM",
        source: "telegram",
        sender: {
          id: senderTelegramId,
          username: args.sender.username,
          ...(args.sender.displayName ? { displayName: args.sender.displayName } : {}),
          metadata: {
            telegram: {
              userId: senderTelegramId,
              username: args.sender.username,
              ...(args.sender.displayName ? { displayName: args.sender.displayName } : {}),
            },
          },
        },
        metadata: {
          telegram: {
            chatId: args.chatId,
            messageId: args.messageId,
          },
        },
      },
    };

    const routed = await this.routeToTarget(resolved.target, rpcRequest);
    return {
      ...routed,
      userId: owner.id,
    };
  }

  async routeWhatsAppMessage(args: {
    organizationId: string;
    from: string;
    to: string;
    body: string;
    providerMessageId?: string;
    mediaUrls?: string[];
    metadata?: Record<string, unknown>;
    senderName?: string;
  }): Promise<MiladyGatewayRouteResult> {
    const senderWhatsAppId = args.from.trim();
    const normalizedPhone = normalizePhoneNumber(senderWhatsAppId);
    const owner =
      (await usersRepository.findByWhatsAppIdWithOrganization(senderWhatsAppId)) ??
      (normalizedPhone
        ? await usersRepository.findByPhoneNumberWithOrganization(normalizedPhone)
        : undefined);

    if (!owner) {
      return {
        handled: false,
        reason: "unknown_owner",
      };
    }

    if (!owner.organization_id || owner.organization_id !== args.organizationId) {
      return {
        handled: false,
        reason: "owner_org_mismatch",
      };
    }

    const resolved = await this.resolveOwnedRuntimeTarget(owner.organization_id, owner.id);
    if (!resolved.target) {
      return {
        handled: false,
        reason: resolved.reason,
        agentId: resolved.agentId,
        userId: owner.id,
      };
    }

    const targetAgentId =
      resolved.target.kind === "local-session" && resolved.target.session
        ? resolved.target.session.runtimeAgentId
        : (resolved.target.sandbox?.id ?? owner.id);
    const roomId = buildDirectConversationRoomIdFromIds(
      targetAgentId,
      "whatsapp",
      normalizedPhone || senderWhatsAppId,
      args.to.trim(),
    );
    const attachments = buildMediaAttachments(args.mediaUrls);
    const rpcRequest: BridgeRequest = {
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "message.send",
      params: {
        text: args.body,
        roomId,
        channelType: "DM",
        source: "whatsapp",
        sender: {
          id: normalizedPhone || senderWhatsAppId,
          username: normalizedPhone || senderWhatsAppId,
          ...(args.senderName ? { displayName: args.senderName } : {}),
          metadata: {
            whatsapp: {
              sender: normalizedPhone || senderWhatsAppId,
              recipient: args.to.trim(),
            },
          },
        },
        ...(attachments ? { attachments } : {}),
        metadata: {
          provider: "whatsapp",
          from: normalizedPhone || senderWhatsAppId,
          to: args.to.trim(),
          ...(args.providerMessageId ? { providerMessageId: args.providerMessageId } : {}),
          ...(args.metadata ? args.metadata : {}),
        },
      },
    };

    const routed = await this.routeToTarget(resolved.target, rpcRequest);
    return {
      ...routed,
      userId: owner.id,
    };
  }
}

export const miladyGatewayRouterService = new MiladyGatewayRouterService();
