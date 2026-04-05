import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { jsonRequest, routeParams } from "./api/route-test-helpers";

afterAll(() => {
  mock.restore();
});

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockGetAgent = mock();
const mockGetStatus = mock();
const mockDisconnectAgent = mock();
const mockConnectAgent = mock();
const mockIsOAuthConfigured = mock();
const mockGetApplicationId = mock();
const mockGenerateOAuthUrl = mock();
const mockDecodeOAuthState = mock();
const mockHandleBotOAuthCallback = mock();

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/services/milady-sandbox", () => ({
  miladySandboxService: {
    getAgent: mockGetAgent,
  },
}));

mock.module("@/lib/services/milady-managed-discord", () => ({
  managedMiladyDiscordService: {
    getStatus: mockGetStatus,
    disconnectAgent: mockDisconnectAgent,
    connectAgent: mockConnectAgent,
  },
}));

mock.module("@/lib/services/discord-automation", () => ({
  discordAutomationService: {
    isOAuthConfigured: mockIsOAuthConfigured,
    getApplicationId: mockGetApplicationId,
    generateOAuthUrl: mockGenerateOAuthUrl,
    decodeOAuthState: mockDecodeOAuthState,
    handleBotOAuthCallback: mockHandleBotOAuthCallback,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}));

import { GET as discordCallbackGet } from "@/app/api/v1/discord/callback/route";
import { POST as postManagedDiscordOauth } from "@/app/api/v1/milady/agents/[agentId]/discord/oauth/route";
import {
  DELETE as deleteManagedDiscord,
  GET as getManagedDiscord,
} from "@/app/api/v1/milady/agents/[agentId]/discord/route";

describe("managed Milady Discord routes", () => {
  beforeEach(() => {
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockGetAgent.mockReset();
    mockGetStatus.mockReset();
    mockDisconnectAgent.mockReset();
    mockConnectAgent.mockReset();
    mockIsOAuthConfigured.mockReset();
    mockGetApplicationId.mockReset();
    mockGenerateOAuthUrl.mockReset();
    mockDecodeOAuthState.mockReset();
    mockHandleBotOAuthCallback.mockReset();

    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: {
        id: "user-1",
        organization_id: "org-1",
      },
    });
    mockIsOAuthConfigured.mockReturnValue(true);
    mockGetApplicationId.mockReturnValue("discord-app-1");
  });

  test("POST /api/v1/milady/agents/[agentId]/discord/oauth returns an authorize URL for loopback Milady redirects", async () => {
    mockGetAgent.mockResolvedValue({
      id: "agent-1",
      agent_name: "Chen",
    });
    mockGenerateOAuthUrl.mockReturnValue("https://discord.com/oauth2/authorize?mock=1");

    const response = await postManagedDiscordOauth(
      jsonRequest("https://example.com/api/v1/milady/agents/agent-1/discord/oauth", "POST", {
        returnUrl: "http://127.0.0.1:31337/cloud?tab=agents",
        botNickname: "Milady Chen",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        authorizeUrl: "https://discord.com/oauth2/authorize?mock=1",
        applicationId: "discord-app-1",
      },
    });
    expect(mockGenerateOAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        flow: "milady-managed",
        botNickname: "Milady Chen",
        organizationId: "org-1",
        returnUrl: "http://127.0.0.1:31337/cloud?tab=agents",
        userId: "user-1",
      }),
    );
  });

  test("GET /api/v1/milady/agents/[agentId]/discord returns managed Discord status", async () => {
    mockGetStatus.mockResolvedValue({
      applicationId: "discord-app-1",
      configured: true,
      connected: true,
      developerPortalUrl: "https://discord.com/developers/applications",
      guildId: "guild-1",
      guildName: "Guild One",
      adminDiscordUserId: "discord-user-1",
      adminDiscordUsername: "owner",
      adminDiscordDisplayName: "Owner",
      adminElizaUserId: "user-1",
      botNickname: "Milady",
      connectedAt: "2026-04-04T16:00:00.000Z",
    });

    const response = await getManagedDiscord(
      new NextRequest("https://example.com/api/v1/milady/agents/agent-1/discord"),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        applicationId: "discord-app-1",
        configured: true,
        connected: true,
        developerPortalUrl: "https://discord.com/developers/applications",
        guildId: "guild-1",
        guildName: "Guild One",
        adminDiscordUserId: "discord-user-1",
        adminDiscordUsername: "owner",
        adminDiscordDisplayName: "Owner",
        adminElizaUserId: "user-1",
        botNickname: "Milady",
        connectedAt: "2026-04-04T16:00:00.000Z",
      },
    });
  });

  test("GET /api/v1/discord/callback links managed Discord installs back to the Milady agent", async () => {
    mockDecodeOAuthState.mockReturnValue({
      flow: "milady-managed",
      agentId: "agent-1",
      organizationId: "org-1",
      userId: "user-1",
      returnUrl: "http://127.0.0.1:31337/cloud?tab=agents",
      botNickname: "Milady Chen",
    });
    mockHandleBotOAuthCallback.mockResolvedValue({
      success: true,
      guildId: "guild-1",
      guildName: "Guild One",
      discordUser: {
        id: "discord-user-1",
        username: "owner",
        globalName: "Owner Person",
        avatar: null,
      },
    });
    mockConnectAgent.mockResolvedValue({
      restarted: true,
      status: {
        connected: true,
      },
    });

    const response = await discordCallbackGet(
      new NextRequest(
        "https://example.com/api/v1/discord/callback?code=oauth-code&state=signed-state&guild_id=guild-1",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("http://127.0.0.1:31337/cloud?tab=agents");
    expect(response.headers.get("location")).toContain("managed=1");
    expect(response.headers.get("location")).toContain("agentId=agent-1");
    expect(response.headers.get("location")).toContain("guildId=guild-1");
    expect(response.headers.get("location")).toContain("restarted=1");
    expect(mockConnectAgent).toHaveBeenCalledWith({
      agentId: "agent-1",
      organizationId: "org-1",
      binding: {
        mode: "cloud-managed",
        applicationId: "discord-app-1",
        guildId: "guild-1",
        guildName: "Guild One",
        adminDiscordUserId: "discord-user-1",
        adminDiscordUsername: "owner",
        adminDiscordDisplayName: "Owner Person",
        adminElizaUserId: "user-1",
        botNickname: "Milady Chen",
        connectedAt: expect.any(String),
      },
    });
  });

  test("DELETE /api/v1/milady/agents/[agentId]/discord disconnects managed Discord", async () => {
    mockDisconnectAgent.mockResolvedValue({
      restarted: false,
      status: {
        applicationId: "discord-app-1",
        configured: true,
        connected: false,
        developerPortalUrl: "https://discord.com/developers/applications",
        guildId: null,
        guildName: null,
        adminDiscordUserId: null,
        adminDiscordUsername: null,
        adminDiscordDisplayName: null,
        adminElizaUserId: null,
        botNickname: null,
        connectedAt: null,
      },
    });

    const response = await deleteManagedDiscord(
      new NextRequest("https://example.com/api/v1/milady/agents/agent-1/discord", {
        method: "DELETE",
      }),
      routeParams({ agentId: "agent-1" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        applicationId: "discord-app-1",
        configured: true,
        connected: false,
        developerPortalUrl: "https://discord.com/developers/applications",
        guildId: null,
        guildName: null,
        adminDiscordUserId: null,
        adminDiscordUsername: null,
        adminDiscordDisplayName: null,
        adminElizaUserId: null,
        botNickname: null,
        connectedAt: null,
        restarted: false,
      },
    });
  });
});
