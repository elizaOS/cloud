import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

// Mock project-config before importing webhook-config
const mockProjectEnv = new Map<string, string>();
mock.module("../src/project-config", () => ({
  getProjectEnv: (project: string, key: string): string => {
    return mockProjectEnv.get(`${project}:${key}`) ?? "";
  },
  initProjectConfig: async () => {},
  shutdownProjectConfig: () => {},
}));

import { getSharedWhatsAppVerifyToken, resolveWebhookConfig } from "../src/webhook-config";

// Fake Redis that stores in a Map
function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: async <T>(key: string): Promise<T | null> => {
      const val = store.get(key);
      if (!val) return null;
      return JSON.parse(val) as T;
    },
    set: async (key: string, value: string, _opts?: { ex?: number }): Promise<string | null> => {
      store.set(key, value);
      return "OK";
    },
  };
}

describe("webhook-config", () => {
  beforeEach(() => {
    mockProjectEnv.clear();
  });

  // ── buildSharedWebhookConfig (via resolveWebhookConfig with no agentId) ──

  describe("shared config (no agentId)", () => {
    test("builds telegram config from project env", async () => {
      mockProjectEnv.set("cloud:DEFAULT_AGENT_ID", "agent-tg");
      mockProjectEnv.set("cloud:TELEGRAM_BOT_TOKEN", "123:ABC");
      mockProjectEnv.set("cloud:TELEGRAM_WEBHOOK_SECRET", "tg-secret");

      const redis = createFakeRedis();
      const config = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "telegram",
        "cloud",
      );
      expect(config).toEqual({
        agentId: "agent-tg",
        botToken: "123:ABC",
        webhookSecret: "tg-secret",
      });
    });

    test("builds blooio config from project env", async () => {
      mockProjectEnv.set("myproject:DEFAULT_AGENT_ID", "agent-bl");
      mockProjectEnv.set("myproject:BLOOIO_API_KEY", "bl-key");
      mockProjectEnv.set("myproject:BLOOIO_WEBHOOK_SECRET", "bl-secret");
      mockProjectEnv.set("myproject:BLOOIO_PHONE_NUMBER", "+18005551234");

      const redis = createFakeRedis();
      const config = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "blooio",
        "myproject",
      );
      expect(config).toEqual({
        agentId: "agent-bl",
        apiKey: "bl-key",
        blooioWebhookSecret: "bl-secret",
        fromNumber: "+18005551234",
      });
    });

    test("builds twilio config from project env", async () => {
      mockProjectEnv.set("cloud:DEFAULT_AGENT_ID", "agent-tw");
      mockProjectEnv.set("cloud:TWILIO_ACCOUNT_SID", "AC001");
      mockProjectEnv.set("cloud:TWILIO_AUTH_TOKEN", "tw-token");
      mockProjectEnv.set("cloud:TWILIO_PHONE_NUMBER", "+18005551234");

      const redis = createFakeRedis();
      const config = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "twilio",
        "cloud",
      );
      expect(config).toEqual({
        agentId: "agent-tw",
        accountSid: "AC001",
        authToken: "tw-token",
        phoneNumber: "+18005551234",
      });
    });

    test("builds whatsapp config from project env", async () => {
      mockProjectEnv.set("cloud:DEFAULT_AGENT_ID", "agent-wa");
      mockProjectEnv.set("cloud:WHATSAPP_ACCESS_TOKEN", "wa-token");
      mockProjectEnv.set("cloud:WHATSAPP_PHONE_NUMBER_ID", "PH_ID");
      mockProjectEnv.set("cloud:WHATSAPP_APP_SECRET", "wa-secret");
      mockProjectEnv.set("cloud:WHATSAPP_VERIFY_TOKEN", "wa-verify");
      mockProjectEnv.set("cloud:WHATSAPP_PHONE_NUMBER", "+14155238886");

      const redis = createFakeRedis();
      const config = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "whatsapp",
        "cloud",
      );
      expect(config).toEqual({
        agentId: "agent-wa",
        accessToken: "wa-token",
        phoneNumberId: "PH_ID",
        appSecret: "wa-secret",
        verifyToken: "wa-verify",
        businessPhone: "+14155238886",
      });
    });

    test("returns empty strings for missing env vars", async () => {
      const redis = createFakeRedis();
      const config = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "telegram",
        "noconfig",
      );
      expect(config!.agentId).toBe("");
      expect(config!.botToken).toBe("");
    });

    test("isolates config between projects", async () => {
      mockProjectEnv.set("proj-a:TELEGRAM_BOT_TOKEN", "token-A");
      mockProjectEnv.set("proj-b:TELEGRAM_BOT_TOKEN", "token-B");

      const redis = createFakeRedis();
      const configA = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "telegram",
        "proj-a",
      );
      const configB = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "telegram",
        "proj-b",
      );
      expect(configA!.botToken).toBe("token-A");
      expect(configB!.botToken).toBe("token-B");
    });
  });

  // ── per-agent config (with agentId) ─────────────────────────────

  describe("per-agent config (with agentId)", () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    afterEach(() => {
      fetchSpy?.mockRestore();
    });

    test("returns cached config from Redis", async () => {
      const redis = createFakeRedis();
      const cachedConfig = {
        agentId: "cached-agent",
        botToken: "cached-token",
      };
      redis.store.set("webhook-config:telegram:agent:agent-123", JSON.stringify(cachedConfig));

      fetchSpy = spyOn(globalThis, "fetch");

      const config = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "telegram",
        "cloud",
        "agent-123",
      );
      expect(config).toEqual(cachedConfig);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("fetches from Cloud API on cache miss", async () => {
      const apiConfig = {
        agentId: "agent-456",
        botToken: "api-token",
      };
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(apiConfig)),
      );

      const redis = createFakeRedis();
      const config = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "telegram",
        "cloud",
        "agent-456",
      );
      expect(config).toEqual(apiConfig);

      // Verify it was cached
      const cached = redis.store.get("webhook-config:telegram:agent:agent-456");
      expect(cached).toBe(JSON.stringify(apiConfig));

      // Verify correct URL
      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toBe(
        "http://cloud.test/api/internal/webhook/config?agentId=agent-456&platform=telegram",
      );
    });

    test("returns null on 404", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Not found", { status: 404 }),
      );

      const redis = createFakeRedis();
      const config = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "telegram",
        "cloud",
        "agent-unknown",
      );
      expect(config).toBeNull();
    });

    test("returns null on fetch error", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network failure"));

      const redis = createFakeRedis();
      const config = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "telegram",
        "cloud",
        "agent-down",
      );
      expect(config).toBeNull();
    });

    test("returns null on non-ok response", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Server error", { status: 500 }),
      );

      const redis = createFakeRedis();
      const config = await resolveWebhookConfig(
        redis as any,
        "http://cloud.test",
        { Authorization: "Bearer tok" },
        "telegram",
        "cloud",
        "agent-err",
      );
      expect(config).toBeNull();
    });
  });

  // ── getSharedWhatsAppVerifyToken ───────────────────────────────

  describe("getSharedWhatsAppVerifyToken", () => {
    test("returns verify token from project env", () => {
      mockProjectEnv.set("cloud:WHATSAPP_VERIFY_TOKEN", "verify-123");
      expect(getSharedWhatsAppVerifyToken("cloud")).toBe("verify-123");
    });

    test("returns null when not configured", () => {
      expect(getSharedWhatsAppVerifyToken("empty-project")).toBeNull();
    });
  });
});
