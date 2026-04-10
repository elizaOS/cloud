import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHash } from "crypto";
import { miladyGatewayRelayService as actualMiladyGatewayRelayService } from "../../lib/services/milady-gateway-relay";

const mockListByOrganization = mock();
const mockFindByManagedDiscordGuildId = mock();
const mockFindByDiscordIdWithOrganization = mock();
const mockFindByPhoneNumberWithOrganization = mock();
const mockFindByEmailWithOrganization = mock();
const mockBridge = mock();
const mockListOwnerSessions = mock();
const mockRouteToSession = mock();

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: {
    listByOrganization: mockListByOrganization,
    findByManagedDiscordGuildId: mockFindByManagedDiscordGuildId,
  },
}));

mock.module("@/db/repositories/users", () => ({
  usersRepository: {
    findByDiscordIdWithOrganization: mockFindByDiscordIdWithOrganization,
    findByPhoneNumberWithOrganization: mockFindByPhoneNumberWithOrganization,
    findByEmailWithOrganization: mockFindByEmailWithOrganization,
  },
}));

mock.module("@/lib/services/milady-sandbox", () => ({
  miladySandboxService: {
    bridge: mockBridge,
  },
}));

mock.module("@/lib/services/milady-gateway-relay", () => ({
  miladyGatewayRelayService: actualMiladyGatewayRelayService,
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

let miladyGatewayRouterService: typeof import("../../lib/services/milady-gateway-router").miladyGatewayRouterService;

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

function buildPhoneRoomId(agentId: string, provider: string, from: string, to: string): string {
  const normalized = [from, to].sort().join("-");
  return hashToUuid(`room:${agentId}:${provider}:${normalized}`);
}

function makeSandbox(overrides: Record<string, unknown> = {}) {
  return {
    id: "agent-1",
    organization_id: "org-1",
    user_id: "user-1",
    agent_name: "Milady Agent",
    agent_config: {},
    environment_vars: {},
    status: "running",
    database_status: "ready",
    created_at: "2026-04-09T00:00:00.000Z",
    updated_at: "2026-04-09T00:00:00.000Z",
    container_name: null,
    sandbox_id: null,
    headscale_ip: null,
    bridge_url: "https://bridge.example.com",
    health_url: "https://bridge.example.com/health",
    web_ui_port: null,
    bridge_port: null,
    error_message: null,
    last_heartbeat_at: null,
    ...overrides,
  } as any;
}

describe("miladyGatewayRouterService", () => {
  beforeAll(async () => {
    Object.assign(actualMiladyGatewayRelayService, {
      listOwnerSessions: mockListOwnerSessions,
      routeToSession: mockRouteToSession,
    });
    ({ miladyGatewayRouterService } = await import("../../lib/services/milady-gateway-router"));
  });

  afterAll(() => {
    delete (actualMiladyGatewayRelayService as { listOwnerSessions?: unknown }).listOwnerSessions;
    delete (actualMiladyGatewayRelayService as { routeToSession?: unknown }).routeToSession;
    mock.restore();
  });

  beforeEach(() => {
    mockListByOrganization.mockReset();
    mockFindByManagedDiscordGuildId.mockReset();
    mockFindByDiscordIdWithOrganization.mockReset();
    mockFindByPhoneNumberWithOrganization.mockReset();
    mockFindByEmailWithOrganization.mockReset();
    mockBridge.mockReset();
    mockListOwnerSessions.mockReset();
    mockRouteToSession.mockReset();
  });

  test("routes a managed Discord guild message to the owning running Milady", async () => {
    mockFindByManagedDiscordGuildId.mockResolvedValue([
      makeSandbox({
        agent_config: {
          __miladyManagedDiscord: {
            mode: "cloud-managed",
            guildId: "guild-1",
            guildName: "Guild One",
            adminDiscordUserId: "discord-user-1",
            adminDiscordUsername: "owner",
            adminElizaUserId: "user-1",
            connectedAt: "2026-04-09T00:00:00.000Z",
          },
        },
      }),
    ]);
    mockBridge.mockResolvedValue({
      jsonrpc: "2.0",
      id: "rpc-1",
      result: { text: "hello from agent" },
    });

    const result = await miladyGatewayRouterService.routeDiscordMessage({
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "message-1",
      content: "hello bot",
      sender: {
        id: "discord-user-1",
        username: "owner",
        displayName: "Owner Person",
      },
    });

    expect(result).toEqual({
      handled: true,
      replyText: "hello from agent",
      agentId: "agent-1",
      organizationId: "org-1",
    });
    expect(mockBridge).toHaveBeenCalledWith(
      "agent-1",
      "org-1",
      expect.objectContaining({
        method: "message.send",
        params: expect.objectContaining({
          roomId: "discord-guild:guild-1:channel:channel-1",
          channelType: "GROUP",
          source: "discord",
          metadata: {
            discord: {
              guildId: "guild-1",
              channelId: "channel-1",
              messageId: "message-1",
            },
          },
        }),
      }),
    );
  });

  test("rejects a managed Discord guild message when the sender is not the bound server owner", async () => {
    mockFindByManagedDiscordGuildId.mockResolvedValue([
      makeSandbox({
        agent_config: {
          __miladyManagedDiscord: {
            mode: "cloud-managed",
            guildId: "guild-1",
            guildName: "Guild One",
            adminDiscordUserId: "discord-user-2",
            adminDiscordUsername: "other-owner",
            adminElizaUserId: "user-2",
            connectedAt: "2026-04-09T00:00:00.000Z",
          },
        },
      }),
    ]);

    const result = await miladyGatewayRouterService.routeDiscordMessage({
      guildId: "guild-1",
      channelId: "channel-1",
      messageId: "message-1",
      content: "hello bot",
      sender: {
        id: "discord-user-1",
        username: "owner",
      },
    });

    expect(result).toEqual({
      handled: false,
      reason: "sender_not_guild_owner",
      agentId: undefined,
    });
    expect(mockBridge).not.toHaveBeenCalled();
  });

  test("routes Discord DMs to the sender's owned running Milady and skips the shared gateway sandbox", async () => {
    mockFindByDiscordIdWithOrganization.mockResolvedValue({
      id: "user-1",
      organization_id: "org-1",
      organization: null,
    });
    mockListByOrganization.mockResolvedValue([
      makeSandbox({
        id: "gateway-agent",
        agent_name: "Milady Discord Gateway",
        agent_config: {
          __miladyManagedDiscordGateway: {
            mode: "shared-gateway",
            createdAt: "2026-04-09T00:00:00.000Z",
          },
        },
      }),
      makeSandbox({
        id: "owner-agent",
      }),
    ]);
    mockBridge.mockResolvedValue({
      jsonrpc: "2.0",
      id: "rpc-2",
      result: { text: "dm reply" },
    });
    mockListOwnerSessions.mockResolvedValue([]);

    const result = await miladyGatewayRouterService.routeDiscordMessage({
      channelId: "dm-1",
      messageId: "message-2",
      content: "hello from dm",
      sender: {
        id: "discord-user-1",
        username: "owner",
      },
    });

    expect(result).toEqual({
      handled: true,
      replyText: "dm reply",
      agentId: "owner-agent",
      organizationId: "org-1",
    });
    expect(mockBridge).toHaveBeenCalledWith(
      "owner-agent",
      "org-1",
      expect.objectContaining({
        method: "message.send",
        params: expect.objectContaining({
          roomId: "discord-dm:discord-user-1:channel:dm-1",
          channelType: "DM",
        }),
      }),
    );
  });

  test("routes Discord DMs to a single live local session before falling back to sandboxes", async () => {
    mockFindByDiscordIdWithOrganization.mockResolvedValue({
      id: "user-1",
      organization_id: "org-1",
      organization: null,
    });
    mockListByOrganization.mockResolvedValue([
      makeSandbox({
        id: "owner-agent",
      }),
    ]);
    mockListOwnerSessions.mockResolvedValue([
      {
        id: "session-1",
        organizationId: "org-1",
        userId: "user-1",
        runtimeAgentId: "local-agent-1",
        agentName: "Local Milady",
        platform: "local-runtime",
        createdAt: "2026-04-09T00:00:00.000Z",
        lastSeenAt: "2026-04-10T00:00:00.000Z",
      },
    ]);
    mockRouteToSession.mockResolvedValue({
      jsonrpc: "2.0",
      id: "rpc-local-dm",
      result: { text: "local relay reply" },
    });

    const result = await miladyGatewayRouterService.routeDiscordMessage({
      channelId: "dm-2",
      messageId: "message-local",
      content: "hello local dm",
      sender: {
        id: "discord-user-1",
        username: "owner",
      },
    });

    expect(result).toEqual({
      handled: true,
      replyText: "local relay reply",
      agentId: "local-agent-1",
      organizationId: "org-1",
    });
    expect(mockRouteToSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-1",
        runtimeAgentId: "local-agent-1",
      }),
      expect.objectContaining({
        method: "message.send",
        params: expect.objectContaining({
          roomId: "discord-dm:discord-user-1:channel:dm-2",
          channelType: "DM",
        }),
      }),
    );
    expect(mockBridge).not.toHaveBeenCalled();
  });

  test("routes Twilio messages to the sender's owned running Milady in the same organization", async () => {
    mockFindByPhoneNumberWithOrganization.mockResolvedValue({
      id: "user-1",
      organization_id: "org-1",
      organization: null,
    });
    mockListByOrganization.mockResolvedValue([
      makeSandbox({
        id: "agent-1",
      }),
    ]);
    mockListOwnerSessions.mockResolvedValue([]);
    mockBridge.mockResolvedValue({
      jsonrpc: "2.0",
      id: "rpc-3",
      result: { text: "sms reply" },
    });

    const result = await miladyGatewayRouterService.routePhoneMessage({
      organizationId: "org-1",
      provider: "twilio",
      from: "+1 (555) 123-4567",
      to: "+1 (800) 555-1234",
      body: "hello via sms",
      providerMessageId: "SM123",
      mediaUrls: ["https://api.twilio.com/media/image.jpg"],
      metadata: {
        fromCity: "Los Angeles",
      },
    });

    expect(result).toEqual({
      handled: true,
      replyText: "sms reply",
      agentId: "agent-1",
      organizationId: "org-1",
    });
    expect(mockBridge).toHaveBeenCalledWith(
      "agent-1",
      "org-1",
      expect.objectContaining({
        method: "message.send",
        params: expect.objectContaining({
          roomId: buildPhoneRoomId("agent-1", "twilio", "+15551234567", "+18005551234"),
          channelType: "DM",
          source: "twilio",
          attachments: [{ type: "image", url: "https://api.twilio.com/media/image.jpg" }],
          metadata: {
            provider: "twilio",
            from: "+15551234567",
            to: "+18005551234",
            providerMessageId: "SM123",
            fromCity: "Los Angeles",
          },
        }),
      }),
    );
  });

  test("routes a managed Discord guild message through a live local session when only the shared gateway is linked", async () => {
    mockFindByManagedDiscordGuildId.mockResolvedValue([
      makeSandbox({
        id: "gateway-agent",
        agent_name: "Milady Discord Gateway",
        agent_config: {
          __miladyManagedDiscordGateway: {
            mode: "shared-gateway",
            createdAt: "2026-04-09T00:00:00.000Z",
          },
          __miladyManagedDiscord: {
            mode: "cloud-managed",
            guildId: "guild-shared",
            guildName: "Shared Guild",
            adminDiscordUserId: "discord-user-1",
            adminDiscordUsername: "owner",
            adminElizaUserId: "user-1",
            connectedAt: "2026-04-09T00:00:00.000Z",
          },
        },
      }),
    ]);
    mockFindByDiscordIdWithOrganization.mockResolvedValue({
      id: "user-1",
      organization_id: "org-1",
      organization: null,
    });
    mockListOwnerSessions.mockResolvedValue([
      {
        id: "session-guild",
        organizationId: "org-1",
        userId: "user-1",
        runtimeAgentId: "local-agent-1",
        agentName: "Local Milady",
        platform: "local-runtime",
        createdAt: "2026-04-09T00:00:00.000Z",
        lastSeenAt: "2026-04-10T00:00:00.000Z",
      },
    ]);
    mockRouteToSession.mockResolvedValue({
      jsonrpc: "2.0",
      id: "rpc-guild-local",
      result: { text: "guild relay reply" },
    });

    const result = await miladyGatewayRouterService.routeDiscordMessage({
      guildId: "guild-shared",
      channelId: "channel-shared",
      messageId: "message-shared",
      content: "hello local guild",
      sender: {
        id: "discord-user-1",
        username: "owner",
      },
    });

    expect(result).toEqual({
      handled: true,
      replyText: "guild relay reply",
      agentId: "local-agent-1",
      organizationId: "org-1",
    });
    expect(mockRouteToSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-guild",
      }),
      expect.objectContaining({
        method: "message.send",
        params: expect.objectContaining({
          roomId: "discord-guild:guild-shared:channel:channel-shared",
          channelType: "GROUP",
        }),
      }),
    );
    expect(mockBridge).not.toHaveBeenCalled();
  });

  test("rejects Blooio messages when the sender identity belongs to another organization", async () => {
    mockFindByEmailWithOrganization.mockResolvedValue({
      id: "user-2",
      organization_id: "org-2",
      organization: null,
    });

    const result = await miladyGatewayRouterService.routePhoneMessage({
      organizationId: "org-1",
      provider: "blooio",
      from: "Owner@Example.com",
      to: "+18005551234",
      body: "hello via imessage",
    });

    expect(result).toEqual({
      handled: false,
      reason: "owner_org_mismatch",
      agentId: undefined,
    });
    expect(mockBridge).not.toHaveBeenCalled();
  });

  test("refuses to pick an arbitrary sandbox when the owner has multiple running Miladys", async () => {
    mockFindByPhoneNumberWithOrganization.mockResolvedValue({
      id: "user-1",
      organization_id: "org-1",
      organization: null,
    });
    mockListByOrganization.mockResolvedValue([
      makeSandbox({ id: "agent-1" }),
      makeSandbox({ id: "agent-2" }),
    ]);
    mockListOwnerSessions.mockResolvedValue([]);

    const result = await miladyGatewayRouterService.routePhoneMessage({
      organizationId: "org-1",
      provider: "twilio",
      from: "+15551234567",
      to: "+18005551234",
      body: "hello",
    });

    expect(result).toEqual({
      handled: false,
      reason: "ambiguous_target",
      agentId: undefined,
    });
    expect(mockBridge).not.toHaveBeenCalled();
  });

  test("routes Twilio messages to a single live local session before any sandbox fallback", async () => {
    mockFindByPhoneNumberWithOrganization.mockResolvedValue({
      id: "user-1",
      organization_id: "org-1",
      organization: null,
    });
    mockListOwnerSessions.mockResolvedValue([
      {
        id: "session-phone",
        organizationId: "org-1",
        userId: "user-1",
        runtimeAgentId: "local-agent-phone",
        agentName: "Local Milady",
        platform: "local-runtime",
        createdAt: "2026-04-09T00:00:00.000Z",
        lastSeenAt: "2026-04-10T00:00:00.000Z",
      },
    ]);
    mockRouteToSession.mockResolvedValue({
      jsonrpc: "2.0",
      id: "rpc-phone-local",
      result: { text: "local sms reply" },
    });

    const result = await miladyGatewayRouterService.routePhoneMessage({
      organizationId: "org-1",
      provider: "twilio",
      from: "+15551234567",
      to: "+18005551234",
      body: "hello from twilio",
    });

    expect(result).toEqual({
      handled: true,
      replyText: "local sms reply",
      agentId: "local-agent-phone",
      organizationId: "org-1",
    });
    expect(mockRouteToSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-phone",
        runtimeAgentId: "local-agent-phone",
      }),
      expect.objectContaining({
        method: "message.send",
        params: expect.objectContaining({
          roomId: buildPhoneRoomId("local-agent-phone", "twilio", "+15551234567", "+18005551234"),
          channelType: "DM",
          source: "twilio",
        }),
      }),
    );
    expect(mockBridge).not.toHaveBeenCalled();
  });

  test("routes to all live local sessions when the owner has multiple active local Miladys", async () => {
    mockFindByDiscordIdWithOrganization.mockResolvedValue({
      id: "user-1",
      organization_id: "org-1",
      organization: null,
    });
    mockListByOrganization.mockResolvedValue([]);
    mockListOwnerSessions.mockResolvedValue([
      {
        id: "session-1",
        organizationId: "org-1",
        userId: "user-1",
        runtimeAgentId: "local-agent-1",
        agentName: "Local Milady",
        platform: "local-runtime",
        createdAt: "2026-04-09T00:00:00.000Z",
        lastSeenAt: "2026-04-10T00:00:00.000Z",
      },
      {
        id: "session-2",
        organizationId: "org-1",
        userId: "user-1",
        runtimeAgentId: "local-agent-2",
        agentName: "Other Local Milady",
        platform: "local-runtime",
        createdAt: "2026-04-09T00:00:00.000Z",
        lastSeenAt: "2026-04-10T00:01:00.000Z",
      },
    ]);
    mockRouteToSession
      .mockResolvedValueOnce({
        jsonrpc: "2.0",
        id: "rpc-multi-1",
        result: { text: "reply from local 1" },
      })
      .mockResolvedValueOnce({
        jsonrpc: "2.0",
        id: "rpc-multi-2",
        result: { text: "reply from local 2" },
      });

    const result = await miladyGatewayRouterService.routeDiscordMessage({
      channelId: "dm-ambiguous",
      messageId: "message-ambiguous",
      content: "hello",
      sender: {
        id: "discord-user-1",
        username: "owner",
      },
    });

    expect(result).toEqual({
      handled: true,
      replyText: "reply from local 1",
      agentId: "local-agent-1",
      organizationId: "org-1",
    });
    expect(mockRouteToSession).toHaveBeenCalledTimes(2);
    expect(mockRouteToSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: "session-1",
        runtimeAgentId: "local-agent-1",
      }),
      expect.objectContaining({
        method: "message.send",
        params: expect.objectContaining({
          roomId: "discord-dm:discord-user-1:channel:dm-ambiguous",
          channelType: "DM",
        }),
      }),
    );
    expect(mockRouteToSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: "session-2",
        runtimeAgentId: "local-agent-2",
      }),
      expect.objectContaining({
        method: "message.send",
        params: expect.objectContaining({
          roomId: "discord-dm:discord-user-1:channel:dm-ambiguous",
          channelType: "DM",
        }),
      }),
    );
    expect(mockBridge).not.toHaveBeenCalled();
  });
});
