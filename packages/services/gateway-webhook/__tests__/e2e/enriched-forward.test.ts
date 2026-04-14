/**
 * E2E test: verifies the full webhook-to-forward flow sends enriched platform
 * metadata through the entire pipeline for each adapter type.
 *
 * Mocks only external boundaries (Redis, identity API, pod forwarding, platform
 * reply APIs) while exercising the real adapter.extractEvent(), handleWebhook(),
 * and processMessage() code paths.
 */
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { WebhookConfig } from "../../src/adapters/types";

// ── Mock external boundaries ─────────────────────────────────────

const mockProjectEnv = new Map<string, string>();
mock.module("../../src/project-config", () => ({
  getProjectEnv: (project: string, key: string): string =>
    mockProjectEnv.get(`${project}:${key}`) ?? "",
  initProjectConfig: async () => {},
  shutdownProjectConfig: () => {},
}));

interface ForwardCall {
  serverUrl: string;
  serverName: string;
  agentId: string;
  userId: string;
  text: string;
  options?: { platformName?: string; senderName?: string; chatId?: string };
}
const forwardCalls: ForwardCall[] = [];

mock.module("../../src/server-router", () => ({
  resolveIdentity: async () => ({
    userId: "user-001",
    organizationId: "org-001",
    agentId: "agent-001",
  }),
  resolveAgentServer: async () => ({
    serverName: "eliza-server-1",
    serverUrl: "http://eliza-server-1.default.svc:3000",
  }),
  forwardToServer: async (
    serverUrl: string,
    serverName: string,
    agentId: string,
    userId: string,
    text: string,
    options?: ForwardCall["options"],
  ) => {
    forwardCalls.push({ serverUrl, serverName, agentId, userId, text, options });
    return "Agent reply";
  },
  refreshKedaActivity: async () => {},
}));

mock.module("../../src/hash-router", () => ({
  getHashTargets: async () => ["10.0.0.1:3000"],
  refreshHashRing: async () => {},
}));

import { blooioAdapter } from "../../src/adapters/blooio";
import { telegramAdapter } from "../../src/adapters/telegram";
import { twilioAdapter } from "../../src/adapters/twilio";
import { whatsappAdapter } from "../../src/adapters/whatsapp";
import { handleWebhook } from "../../src/webhook-handler";

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

const flush = () => new Promise((r) => setTimeout(r, 10));

// ── Test fixtures ────────────────────────────────────────────────

function makeTelegramWebhook(text = "Hello from Telegram"): Request {
  const update = {
    update_id: 1001,
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

function makeWhatsAppWebhook(text = "Hello from WhatsApp"): Request {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry-001",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "phone-001", display_phone_number: "+18005551234" },
              contacts: [{ wa_id: "15559876543", profile: { name: "Bob" } }],
              messages: [
                {
                  id: "wamid.abc123",
                  from: "15559876543",
                  type: "text",
                  timestamp: "1700000000",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  return new Request("http://localhost/webhook/cloud/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function makeTwilioWebhook(text = "Hello from SMS"): Request {
  const params = new URLSearchParams({
    MessageSid: "SM1001",
    AccountSid: "AC001",
    From: "+15551234567",
    To: "+18005551234",
    Body: text,
    NumMedia: "0",
  });
  return new Request("http://localhost/webhook/cloud/twilio", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

function makeBlooioWebhook(text = "Hello from Blooio"): Request {
  const payload = {
    event: "message.received",
    message_id: "blooio-msg-001",
    sender: "blooio-sender-42",
    text,
    is_group: false,
  };
  return new Request("http://localhost/webhook/cloud/blooio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ── Tests ────────────────────────────────────────────────────────

describe("E2E: enriched platform metadata forwarding (ticket #55)", () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockProjectEnv.clear();
    mockProjectEnv.set("cloud:DEFAULT_AGENT_ID", "agent-default");
    mockProjectEnv.set("cloud:TELEGRAM_BOT_TOKEN", "123:ABC");
    mockProjectEnv.set("cloud:TELEGRAM_WEBHOOK_SECRET", "tg-secret");
    mockProjectEnv.set("cloud:TWILIO_ACCOUNT_SID", "AC001");
    mockProjectEnv.set("cloud:TWILIO_AUTH_TOKEN", "tw-token");
    mockProjectEnv.set("cloud:TWILIO_PHONE_NUMBER", "+18005551234");
    mockProjectEnv.set("cloud:WHATSAPP_ACCESS_TOKEN", "wa-token");
    mockProjectEnv.set("cloud:WHATSAPP_PHONE_NUMBER_ID", "phone-001");
    mockProjectEnv.set("cloud:WHATSAPP_APP_SECRET", "wa-secret");
    mockProjectEnv.set("cloud:WHATSAPP_VERIFY_TOKEN", "wa-verify");
    mockProjectEnv.set("cloud:BLOOIO_API_KEY", "blooio-key");
    mockProjectEnv.set("cloud:BLOOIO_WEBHOOK_SECRET", "blooio-secret");

    forwardCalls.length = 0;

    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("Telegram: forwards platformName='telegram', senderName='Alice', chatId='42'", async () => {
    const redis = createFakeRedis();
    const deps = {
      redis: redis as any,
      cloudBaseUrl: "http://cloud.test",
      getAuthHeader: () => ({ Authorization: "Bearer test-jwt" }),
    };

    const res = await handleWebhook(makeTelegramWebhook(), telegramAdapter, deps, "cloud");
    expect(res.status).toBe(200);
    await flush();

    expect(forwardCalls).toHaveLength(1);
    const call = forwardCalls[0];
    expect(call.options).toEqual({
      platformName: "telegram",
      senderName: "Alice",
      chatId: "42",
    });
    expect(call.text).toBe("Hello from Telegram");
    expect(call.userId).toBe("user-001");
    // agentId comes from config.agentId (DEFAULT_AGENT_ID) when set, not identity
    expect(call.agentId).toBe("agent-default");
  });

  test("WhatsApp: forwards platformName='whatsapp', senderName='Bob', chatId from msg.from", async () => {
    const verifySpy = spyOn(whatsappAdapter, "verifyWebhook").mockResolvedValue(true);

    const redis = createFakeRedis();
    const deps = {
      redis: redis as any,
      cloudBaseUrl: "http://cloud.test",
      getAuthHeader: () => ({ Authorization: "Bearer test-jwt" }),
    };

    const res = await handleWebhook(makeWhatsAppWebhook(), whatsappAdapter, deps, "cloud");
    expect(res.status).toBe(200);
    await flush();

    expect(forwardCalls).toHaveLength(1);
    const call = forwardCalls[0];
    expect(call.options?.platformName).toBe("whatsapp");
    expect(call.options?.senderName).toBe("Bob");
    expect(call.options?.chatId).toBe("15559876543");
    expect(call.text).toBe("Hello from WhatsApp");

    verifySpy.mockRestore();
  });

  test("Twilio: forwards platformName='twilio', senderName=undefined, chatId from From number", async () => {
    const verifySpy = spyOn(twilioAdapter, "verifyWebhook").mockResolvedValue(true);

    const redis = createFakeRedis();
    const deps = {
      redis: redis as any,
      cloudBaseUrl: "http://cloud.test",
      getAuthHeader: () => ({ Authorization: "Bearer test-jwt" }),
    };

    const res = await handleWebhook(makeTwilioWebhook(), twilioAdapter, deps, "cloud");
    expect(res.status).toBe(200);
    await flush();

    expect(forwardCalls).toHaveLength(1);
    const call = forwardCalls[0];
    expect(call.options?.platformName).toBe("twilio");
    expect(call.options?.senderName).toBeUndefined();
    expect(call.options?.chatId).toBe("+15551234567");
    expect(call.text).toBe("Hello from SMS");

    verifySpy.mockRestore();
  });

  test("Blooio: forwards platformName='blooio', senderName=undefined, chatId from sender", async () => {
    const verifySpy = spyOn(blooioAdapter, "verifyWebhook").mockResolvedValue(true);

    const redis = createFakeRedis();
    const deps = {
      redis: redis as any,
      cloudBaseUrl: "http://cloud.test",
      getAuthHeader: () => ({ Authorization: "Bearer test-jwt" }),
    };

    const res = await handleWebhook(makeBlooioWebhook(), blooioAdapter, deps, "cloud");
    expect(res.status).toBe(200);
    await flush();

    expect(forwardCalls).toHaveLength(1);
    const call = forwardCalls[0];
    expect(call.options?.platformName).toBe("blooio");
    expect(call.options?.senderName).toBeUndefined();
    expect(call.options?.chatId).toBe("blooio-sender-42");
    expect(call.text).toBe("Hello from Blooio");

    verifySpy.mockRestore();
  });

  test("enriched metadata does not interfere with dedup logic", async () => {
    const redis = createFakeRedis();
    const deps = {
      redis: redis as any,
      cloudBaseUrl: "http://cloud.test",
      getAuthHeader: () => ({ Authorization: "Bearer test-jwt" }),
    };

    await handleWebhook(makeTelegramWebhook(), telegramAdapter, deps, "cloud");
    await flush();
    expect(forwardCalls).toHaveLength(1);

    // Same update_id (1001) → deduped
    await handleWebhook(makeTelegramWebhook(), telegramAdapter, deps, "cloud");
    await flush();
    expect(forwardCalls).toHaveLength(1);
  });
});
