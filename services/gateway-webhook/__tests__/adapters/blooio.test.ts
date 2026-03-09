import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import crypto from "crypto";
import { blooioAdapter } from "../../src/adapters/blooio";
import type { WebhookConfig, ChatEvent } from "../../src/adapters/types";

function computeBlooioSignature(
  secret: string,
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const signedPayload = `${timestamp}.${rawBody}`;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}

function makeBlooioPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: "message.received",
    message_id: "msg-001",
    sender: "+15551234567",
    text: "Hello from iMessage",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ChatEvent> = {}): ChatEvent {
  return {
    platform: "blooio",
    messageId: "msg-001",
    chatId: "+15551234567",
    senderId: "+15551234567",
    text: "Hello",
    rawPayload: {},
    ...overrides,
  };
}

describe("blooioAdapter", () => {
  // ── verifyWebhook ──────────────────────────────────────────────

  describe("verifyWebhook", () => {
    test("accepts valid HMAC-SHA256 signature", async () => {
      const secret = "blooio-secret-key";
      const rawBody = JSON.stringify(makeBlooioPayload());
      const sig = computeBlooioSignature(secret, rawBody);

      const config: WebhookConfig = {
        agentId: "a",
        blooioWebhookSecret: secret,
      };
      const req = new Request("http://localhost/webhook", {
        method: "POST",
        headers: { "x-blooio-signature": sig },
      });
      expect(await blooioAdapter.verifyWebhook(req, rawBody, config)).toBe(
        true,
      );
    });

    test("rejects tampered body", async () => {
      const secret = "blooio-secret-key";
      const rawBody = JSON.stringify(makeBlooioPayload());
      const sig = computeBlooioSignature(secret, rawBody);

      const config: WebhookConfig = {
        agentId: "a",
        blooioWebhookSecret: secret,
      };
      const req = new Request("http://localhost/webhook", {
        method: "POST",
        headers: { "x-blooio-signature": sig },
      });
      // Pass different body than what was signed
      expect(
        await blooioAdapter.verifyWebhook(req, '{"tampered":true}', config),
      ).toBe(false);
    });

    test("rejects expired signature (>2min)", async () => {
      const secret = "blooio-secret-key";
      const rawBody = JSON.stringify(makeBlooioPayload());
      const oldTimestamp = Math.floor(Date.now() / 1000) - 200;
      const sig = computeBlooioSignature(secret, rawBody, oldTimestamp);

      const config: WebhookConfig = {
        agentId: "a",
        blooioWebhookSecret: secret,
      };
      const req = new Request("http://localhost/webhook", {
        method: "POST",
        headers: { "x-blooio-signature": sig },
      });
      expect(await blooioAdapter.verifyWebhook(req, rawBody, config)).toBe(
        false,
      );
    });

    test("rejects malformed signature header", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        blooioWebhookSecret: "secret",
      };
      const req = new Request("http://localhost/webhook", {
        method: "POST",
        headers: { "x-blooio-signature": "garbage" },
      });
      expect(await blooioAdapter.verifyWebhook(req, "{}", config)).toBe(false);
    });

    test("returns false when no secret configured", async () => {
      const config: WebhookConfig = { agentId: "a" };
      const req = new Request("http://localhost/webhook", { method: "POST" });
      expect(await blooioAdapter.verifyWebhook(req, "{}", config)).toBe(false);
    });
  });

  // ── extractEvent ───────────────────────────────────────────────

  describe("extractEvent", () => {
    test("extracts message.received event", async () => {
      const payload = makeBlooioPayload();
      const event = await blooioAdapter.extractEvent(JSON.stringify(payload));
      expect(event).toEqual({
        platform: "blooio",
        messageId: "msg-001",
        chatId: "+15551234567",
        senderId: "+15551234567",
        text: "Hello from iMessage",
        mediaUrls: undefined,
        rawPayload: payload,
      });
    });

    test("returns null for non message.received events", async () => {
      const payload = makeBlooioPayload({ event: "message.sent" });
      expect(
        await blooioAdapter.extractEvent(JSON.stringify(payload)),
      ).toBeNull();
    });

    test("returns null for group messages", async () => {
      const payload = makeBlooioPayload({ is_group: true });
      expect(
        await blooioAdapter.extractEvent(JSON.stringify(payload)),
      ).toBeNull();
    });

    test("returns null for empty text and no attachments", async () => {
      const payload = makeBlooioPayload({ text: null, attachments: [] });
      expect(
        await blooioAdapter.extractEvent(JSON.stringify(payload)),
      ).toBeNull();
    });

    test("extracts media URLs from attachments", async () => {
      const payload = makeBlooioPayload({
        text: "",
        attachments: [
          "https://backend.blooio.com/media/image.jpg",
          { url: "https://media.blooio.com/uploads/file.pdf", name: "doc" },
        ],
      });
      const event = await blooioAdapter.extractEvent(JSON.stringify(payload));
      expect(event!.text).toBe(
        "[media: https://backend.blooio.com/media/image.jpg, https://media.blooio.com/uploads/file.pdf]",
      );
      expect(event!.mediaUrls).toEqual([
        "https://backend.blooio.com/media/image.jpg",
        "https://media.blooio.com/uploads/file.pdf",
      ]);
    });

    test("filters out media URLs from untrusted domains", async () => {
      const payload = makeBlooioPayload({
        text: "",
        attachments: ["https://evil.com/malware.exe"],
      });
      const event = await blooioAdapter.extractEvent(JSON.stringify(payload));
      // Attachments exist so event is created, but untrusted URLs are filtered
      expect(event).not.toBeNull();
      expect(event!.mediaUrls).toBeUndefined();
      expect(event!.text).toBe("");
    });

    test("filters out non-https media URLs", async () => {
      const payload = makeBlooioPayload({
        text: "",
        attachments: ["http://backend.blooio.com/media/image.jpg"],
      });
      const event = await blooioAdapter.extractEvent(JSON.stringify(payload));
      expect(event).not.toBeNull();
      expect(event!.mediaUrls).toBeUndefined();
    });

    test("falls back to internal_id when message_id is null", async () => {
      const payload = makeBlooioPayload({
        message_id: null,
        internal_id: "int-001",
      });
      const event = await blooioAdapter.extractEvent(JSON.stringify(payload));
      expect(event!.messageId).toBe("int-001");
    });

    test("returns null for invalid JSON", async () => {
      expect(await blooioAdapter.extractEvent("not json")).toBeNull();
    });

    test("returns null for missing required fields", async () => {
      expect(await blooioAdapter.extractEvent("{}")).toBeNull();
    });
  });

  // ── sendReply ──────────────────────────────────────────────────

  describe("sendReply", () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ok: true })),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    test("sends message to Blooio API", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        apiKey: "blooio-key",
        fromNumber: "+18005551234",
      };
      await blooioAdapter.sendReply(config, makeEvent(), "Reply text");

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://backend.blooio.com/v2/api/chats/%2B15551234567/messages",
      );
      expect(opts.method).toBe("POST");
      expect((opts.headers as Record<string, string>).Authorization).toBe(
        "Bearer blooio-key",
      );
      expect((opts.headers as Record<string, string>)["X-From-Number"]).toBe(
        "+18005551234",
      );
      expect(JSON.parse(opts.body as string)).toEqual({ text: "Reply text" });
    });

    test("omits X-From-Number when not configured", async () => {
      const config: WebhookConfig = { agentId: "a", apiKey: "blooio-key" };
      await blooioAdapter.sendReply(config, makeEvent(), "Reply");

      const headers = (fetchSpy.mock.calls[0] as [string, RequestInit])[1]
        .headers as Record<string, string>;
      expect(headers["X-From-Number"]).toBeUndefined();
    });

    test("throws when apiKey is missing", async () => {
      const config: WebhookConfig = { agentId: "a" };
      expect(
        blooioAdapter.sendReply(config, makeEvent(), "reply"),
      ).rejects.toThrow("Missing apiKey");
    });

    test("throws on non-ok response", async () => {
      fetchSpy.mockRestore();
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Rate limited", { status: 429 }),
      );
      const config: WebhookConfig = { agentId: "a", apiKey: "key" };
      expect(
        blooioAdapter.sendReply(config, makeEvent(), "reply"),
      ).rejects.toThrow("Blooio send error (429)");
    });
  });

  // ── sendTypingIndicator ────────────────────────────────────────

  describe("sendTypingIndicator", () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ok: true })),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    test("marks chat as read", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        apiKey: "key",
        fromNumber: "+18005551234",
      };
      await blooioAdapter.sendTypingIndicator(config, makeEvent());

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://backend.blooio.com/v2/api/chats/%2B15551234567/read",
      );
      expect(opts.method).toBe("POST");
    });

    test("no-op when apiKey missing", async () => {
      const config: WebhookConfig = { agentId: "a" };
      await blooioAdapter.sendTypingIndicator(config, makeEvent());
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
