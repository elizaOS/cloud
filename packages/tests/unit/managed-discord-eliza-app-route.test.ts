import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const mockFindByManagedDiscordGuildId = mock();
const mockBridge = mock();
const originalEnv = { ...process.env };
const mutableEnv = process.env as Record<string, string | undefined>;
let POST: typeof import("@/app/api/internal/discord/eliza-app/messages/route").POST;

mock.module("@/db/repositories/milady-sandboxes", () => ({
  miladySandboxesRepository: {
    findByManagedDiscordGuildId: mockFindByManagedDiscordGuildId,
  },
}));

mock.module("@/lib/services/milady-sandbox", () => ({
  miladySandboxService: {
    bridge: mockBridge,
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
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgrQVTJ7WWtYbqub0Q
fLr2lzR+KLx0o6bljZjyK3+vmnehRANCAASqngGNae2HCVarjzxZ2mwfsM9Z8Us5
tKQ751KrxuBykiNCX+Xo4twm4lFo2pNcJYVB7lRPNmFcjz8i2aDFOK/9
-----END PRIVATE KEY-----`;
const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqp4BjWnthwlWq488WdpsH7DPWfFL
ObSkO+dSq8bgcpIjQl/l6OLcJuJRaNqTXCWFQe5UTzZhXI8/ItmgxTiv/Q==
-----END PUBLIC KEY-----`;

async function createInternalAuthHeader(): Promise<string> {
  const { signInternalToken } = await import("@/lib/auth/jwt-internal");
  const { access_token } = await signInternalToken({
    subject: "test-discord-gateway",
    service: "discord-gateway",
  });
  return `Bearer ${access_token}`;
}

describe("managed Discord Eliza App routing route", () => {
  beforeAll(async () => {
    mutableEnv.JWT_SIGNING_PRIVATE_KEY = Buffer.from(TEST_PRIVATE_KEY).toString("base64");
    mutableEnv.JWT_SIGNING_PUBLIC_KEY = Buffer.from(TEST_PUBLIC_KEY).toString("base64");
    mutableEnv.JWT_SIGNING_KEY_ID = "test-key-id";
    mutableEnv.NODE_ENV = "test";
    ({ POST } = await import("@/app/api/internal/discord/eliza-app/messages/route"));
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  beforeEach(() => {
    mockFindByManagedDiscordGuildId.mockReset();
    mockBridge.mockReset();
  });

  test("routes a managed guild message into the linked Milady sandbox bridge", async () => {
    const authHeader = await createInternalAuthHeader();
    mockFindByManagedDiscordGuildId.mockResolvedValue([
      {
        id: "agent-1",
        organization_id: "org-1",
        status: "running",
      },
    ]);
    mockBridge.mockResolvedValue({
      jsonrpc: "2.0",
      id: "rpc-1",
      result: { text: "hello from agent" },
    });

    const response = await POST(
      new NextRequest("https://example.com/api/internal/discord/eliza-app/messages", {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: "guild-1",
          channelId: "channel-1",
          messageId: "message-1",
          content: "hello bot",
          sender: {
            id: "discord-user-1",
            username: "owner",
            displayName: "Owner Person",
            avatar: "https://cdn.discordapp.com/avatar.png",
          },
        }),
      }),
      {
        params: Promise.resolve({}),
      } as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      handled: true,
      replyText: "hello from agent",
      agentId: "agent-1",
    });
    expect(mockBridge).toHaveBeenCalledWith(
      "agent-1",
      "org-1",
      expect.objectContaining({
        jsonrpc: "2.0",
        method: "message.send",
        params: expect.objectContaining({
          text: "hello bot",
          roomId: "discord-guild:guild-1:channel:channel-1",
          channelType: "GROUP",
          source: "discord",
          sender: {
            id: "discord-user-1",
            username: "owner",
            displayName: "Owner Person",
            metadata: {
              discord: {
                userId: "discord-user-1",
                username: "owner",
                globalName: "Owner Person",
                avatar: "https://cdn.discordapp.com/avatar.png",
              },
            },
          },
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

  test("returns handled=false when no agent is linked to the guild", async () => {
    const authHeader = await createInternalAuthHeader();
    mockFindByManagedDiscordGuildId.mockResolvedValue([]);

    const response = await POST(
      new NextRequest("https://example.com/api/internal/discord/eliza-app/messages", {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId: "guild-1",
          channelId: "channel-1",
          messageId: "message-1",
          content: "hello bot",
          sender: {
            id: "discord-user-1",
            username: "owner",
          },
        }),
      }),
      {
        params: Promise.resolve({}),
      } as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      handled: false,
      reason: "not_linked",
    });
  });
});
