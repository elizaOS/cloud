import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

// ── Mock external boundaries ─────────────────────────────────────

const mockProjectEnv = new Map<string, string>();
mock.module("../src/project-config", () => ({
  getProjectEnv: (project: string, key: string): string =>
    mockProjectEnv.get(`${project}:${key}`) ?? "",
  initProjectConfig: async () => {},
  shutdownProjectConfig: () => {},
}));

const mockIdentity = {
  userId: "user-001",
  organizationId: "org-001",
  agentId: "agent-001",
};
let mockServerRoute: { serverName: string; serverUrl: string } | null = {
  serverName: "eliza-server-1",
  serverUrl: "http://eliza-server-1.default.svc:3000",
};
let mockForwardResponse = "Hello from the agent!";
let mockForwardError: Error | null = null;

interface ForwardCall {
  serverUrl: string;
  serverName: string;
  agentId: string;
  userId: string;
  text: string;
  options?: { platformName?: string; senderName?: string; chatId?: string };
}
const forwardCalls: ForwardCall[] = [];

mock.module("../src/server-router", () => ({
  resolveIdentity: async () => mockIdentity,
  resolveAgentServer: async () => mockServerRoute,
  forwardToServer: async (
    serverUrl: string,
    serverName: string,
    agentId: string,
    userId: string,
    text: string,
    options?: ForwardCall["options"],
  ) => {
    forwardCalls.push({ serverUrl, serverName, agentId, userId, text, options });
    if (mockForwardError) throw mockForwardError;
    return mockForwardResponse;
  },
  refreshKedaActivity: async () => {},
}));

mock.module("../src/hash-router", () => ({
  getHashTargets: async () => ["10.0.0.1:3000"],
  refreshHashRing: async () => {},
}));

import { telegramAdapter } from "../src/adapters/telegram";
import { twilioAdapter } from "../src/adapters/twilio";
import { handleWebhook } from "../src/webhook-handler";

// ── Fake Redis ───────────────────────────────────────────────────

function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: async <T>(key: string): Promise<T | null> => {
      const val = store.get(key);
      if (!val) return null;
      return JSON.parse(val) as T;
    },
    set: async (
      key: string,
      value: string,
      opts?: { nx?: boolean; ex?: number },
    ): Promise<string | null> => {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    lpush: async () => 1,
    ltrim: async () => "OK",
    expire: async () => true,
  };
}

// ── Test fixtures ────────────────────────────────────────────────

function makeTelegramRequest(text = "Hello agent"): Request {
  const update = {
    update_id: 500,
    message: {
      message_id: 1,
      from: { id: 42, first_name: "Alice", is_bot: false },
      chat: { id: 42, type: "private" },
      text,
    },
  };
  return new Request("http://localhost/webhook/cloud/telegram", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": "tg-secret",
    },
    body: JSON.stringify(update),
  });
}

function makeTwilioRequest(body = "Hello via SMS"): Request {
  const params = new URLSearchParams({
    MessageSid: "SM500",
    AccountSid: "AC001",
    From: "+15551234567",
    To: "+18005551234",
    Body: body,
    NumMedia: "0",
  });
  return new Request("http://localhost/webhook/cloud/twilio", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

const flush = () => new Promise((r) => setTimeout(r, 10));

// ── Tests: Platform metadata forwarding (ticket #55) ─────────────

describe("handleWebhook – platform metadata forwarding", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockProjectEnv.clear();
    mockProjectEnv.set("cloud:DEFAULT_AGENT_ID", "agent-default");
    mockProjectEnv.set("cloud:TELEGRAM_BOT_TOKEN", "123:ABC");
    mockProjectEnv.set("cloud:TELEGRAM_WEBHOOK_SECRET", "tg-secret");
    mockProjectEnv.set("cloud:TWILIO_ACCOUNT_SID", "AC001");
    mockProjectEnv.set("cloud:TWILIO_AUTH_TOKEN", "tw-token");
    mockProjectEnv.set("cloud:TWILIO_PHONE_NUMBER", "+18005551234");

    mockServerRoute = {
      serverName: "eliza-server-1",
      serverUrl: "http://eliza-server-1.default.svc:3000",
    };
    mockForwardResponse = "Hello from the agent!";
    mockForwardError = null;
    forwardCalls.length = 0;

    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("forwards platformName, senderName, chatId for Telegram", async () => {
    const redis = createFakeRedis();
    const deps = {
      redis: redis as any,
      cloudBaseUrl: "http://cloud.test",
      getAuthHeader: () => ({ Authorization: "Bearer test-jwt" }),
    };

    await handleWebhook(makeTelegramRequest("Hi from Alice"), telegramAdapter, deps, "cloud");
    await flush();

    expect(forwardCalls.length).toBe(1);
    const call = forwardCalls[0];
    expect(call.options).toBeDefined();
    expect(call.options!.platformName).toBe("telegram");
    expect(call.options!.senderName).toBe("Alice");
    expect(call.options!.chatId).toBe("42");
  });

  test("forwards platformName and chatId for Twilio (senderName undefined)", async () => {
    const verifySpy = spyOn(twilioAdapter, "verifyWebhook").mockResolvedValue(true);

    const redis = createFakeRedis();
    const deps = {
      redis: redis as any,
      cloudBaseUrl: "http://cloud.test",
      getAuthHeader: () => ({ Authorization: "Bearer test-jwt" }),
    };

    await handleWebhook(makeTwilioRequest("Hello from SMS"), twilioAdapter, deps, "cloud");
    await flush();

    expect(forwardCalls.length).toBe(1);
    const call = forwardCalls[0];
    expect(call.options).toBeDefined();
    expect(call.options!.platformName).toBe("twilio");
    expect(call.options!.senderName).toBeUndefined();
    expect(call.options!.chatId).toBe("+15551234567");

    verifySpy.mockRestore();
  });

  test("forwards correct userId and text alongside platform metadata", async () => {
    const redis = createFakeRedis();
    const deps = {
      redis: redis as any,
      cloudBaseUrl: "http://cloud.test",
      getAuthHeader: () => ({ Authorization: "Bearer test-jwt" }),
    };

    await handleWebhook(makeTelegramRequest("Test message"), telegramAdapter, deps, "cloud");
    await flush();

    expect(forwardCalls.length).toBe(1);
    const call = forwardCalls[0];
    expect(call.userId).toBe("user-001");
    expect(call.text).toBe("Test message");
    expect(call.agentId).toBe("agent-default");
  });
});
