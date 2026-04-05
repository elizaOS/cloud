import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

afterAll(() => {
  mock.restore();
});

const mockDiscordGuildUpsert = mock();
const mockDiscordChannelUpsert = mock();
const mockLogger = {
  info: mock(),
  warn: mock(),
  error: mock(),
  debug: mock(),
};

mock.module("@/db/repositories/discord-guilds", () => ({
  discordGuildsRepository: {
    upsert: mockDiscordGuildUpsert,
  },
}));

mock.module("@/db/repositories/discord-channels", () => ({
  discordChannelsRepository: {
    upsert: mockDiscordChannelUpsert,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: mockLogger,
}));

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

let discordAutomationService: typeof import("@/lib/services/discord-automation").discordAutomationService;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

describe("discordAutomationService.handleBotOAuthCallback", () => {
  beforeAll(async () => {
    process.env.DISCORD_CLIENT_ID = "discord-app-1";
    process.env.DISCORD_CLIENT_SECRET = "discord-secret";
    process.env.DISCORD_BOT_TOKEN = "discord-bot-token";
    process.env.NEXT_PUBLIC_APP_URL = "https://cloud.example";

    ({ discordAutomationService } = await import("@/lib/services/discord-automation"));
  });

  beforeEach(() => {
    mockDiscordGuildUpsert.mockReset();
    mockDiscordChannelUpsert.mockReset();
    mockLogger.info.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.error.mockReset();
    mockLogger.debug.mockReset();
  });

  afterAll(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  test("rejects managed installs when the Discord user does not own the target server", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/oauth2/token")) {
        return jsonResponse({ access_token: "oauth-access-token" });
      }
      if (url.endsWith("/users/@me")) {
        return jsonResponse({
          id: "discord-user-1",
          username: "owner",
          global_name: "Owner Person",
          avatar: null,
        });
      }
      if (url.endsWith("/users/@me/guilds")) {
        return jsonResponse([
          {
            id: "guild-1",
            name: "Guild One",
            icon: null,
            owner: false,
            permissions: "8",
            features: [],
          },
        ]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await discordAutomationService.handleBotOAuthCallback({
      code: "oauth-code",
      guildId: "guild-1",
      oauthState: {
        organizationId: "org-1",
        userId: "user-1",
        returnUrl: "https://cloud.example/dashboard/settings?tab=agents",
        nonce: "nonce-1",
        flow: "milady-managed",
        agentId: "agent-1",
      },
    });

    expect(result).toEqual({
      success: false,
      error: "Discord account must own the server",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mockDiscordGuildUpsert).not.toHaveBeenCalled();
    expect(mockDiscordChannelUpsert).not.toHaveBeenCalled();
  });

  test("stores the guild, refreshes channels, and applies the requested nickname for successful managed installs", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/oauth2/token")) {
        return jsonResponse({ access_token: "oauth-access-token" });
      }
      if (url.endsWith("/users/@me")) {
        return jsonResponse({
          id: "discord-user-1",
          username: "owner",
          global_name: "Owner Person",
          avatar: "avatar-hash",
        });
      }
      if (url.endsWith("/users/@me/guilds")) {
        return jsonResponse([
          {
            id: "guild-1",
            name: "Guild One",
            icon: "guild-icon",
            owner: true,
            permissions: "8",
            features: ["COMMUNITY"],
          },
        ]);
      }
      if (url.endsWith("/guilds/guild-1")) {
        return jsonResponse({
          id: "guild-1",
          name: "Guild One",
          icon: "guild-icon",
        });
      }
      if (url.endsWith("/guilds/guild-1/channels")) {
        return jsonResponse([
          {
            id: "text-1",
            name: "general",
            type: 0,
            parent_id: null,
            position: 1,
            guild_id: "guild-1",
          },
          {
            id: "voice-1",
            name: "Voice",
            type: 2,
            parent_id: null,
            position: 2,
            guild_id: "guild-1",
          },
        ]);
      }
      if (url.endsWith("/guilds/guild-1/members/@me")) {
        expect(init?.method).toBe("PATCH");
        expect(init?.body).toBe(
          JSON.stringify({
            nick: "Milady Cloud Agent With A Long Na",
          }),
        );
        return textResponse("", 204);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await discordAutomationService.handleBotOAuthCallback({
      code: "oauth-code",
      guildId: "guild-1",
      oauthState: {
        organizationId: "org-1",
        userId: "user-1",
        returnUrl: "https://cloud.example/dashboard/settings?tab=agents",
        nonce: "nonce-2",
        flow: "milady-managed",
        agentId: "agent-1",
        botNickname: "Milady Cloud Agent With A Long Name",
      },
    });

    expect(result).toEqual({
      success: true,
      guildId: "guild-1",
      guildName: "Guild One",
      discordUser: {
        id: "discord-user-1",
        username: "owner",
        globalName: "Owner Person",
        avatar: "avatar-hash",
      },
    });
    expect(mockDiscordGuildUpsert).toHaveBeenCalledWith({
      organization_id: "org-1",
      guild_id: "guild-1",
      guild_name: "Guild One",
      icon_hash: "guild-icon",
      owner_id: "discord-user-1",
      bot_permissions: "67193856",
    });
    expect(mockDiscordChannelUpsert).toHaveBeenCalledTimes(1);
    expect(mockDiscordChannelUpsert).toHaveBeenCalledWith({
      organization_id: "org-1",
      guild_id: "guild-1",
      channel_id: "text-1",
      channel_name: "general",
      channel_type: 0,
      parent_id: null,
      position: 1,
      can_send_messages: true,
      is_nsfw: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
