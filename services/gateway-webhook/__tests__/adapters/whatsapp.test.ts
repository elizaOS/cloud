import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import crypto from "crypto";
import { whatsappAdapter } from "../../src/adapters/whatsapp";
import type { WebhookConfig, ChatEvent } from "../../src/adapters/types";

function computeWhatsAppSignature(appSecret: string, rawBody: string): string {
  return (
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")
  );
}

function makeWhatsAppPayload(
  messages: Array<{
    id: string;
    from: string;
    type: string;
    timestamp?: string;
    text?: { body: string };
  }> = [
    {
      id: "wamid.001",
      from: "14245074963",
      type: "text",
      timestamp: "1234567890",
      text: { body: "Hello" },
    },
  ],
  contacts: Array<{ profile: { name: string }; wa_id: string }> = [
    { profile: { name: "John" }, wa_id: "14245074963" },
  ],
) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+14155238886",
                phone_number_id: "PHONE_NUMBER_ID",
              },
              contacts,
              messages,
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

function makeEvent(overrides: Partial<ChatEvent> = {}): ChatEvent {
  return {
    platform: "whatsapp",
    messageId: "wamid.001",
    chatId: "14245074963",
    senderId: "14245074963",
    text: "Hello",
    rawPayload: {},
    ...overrides,
  };
}

describe("whatsappAdapter", () => {
  // ── verifyWebhook ──────────────────────────────────────────────

  describe("verifyWebhook", () => {
    test("accepts valid HMAC-SHA256 signature", async () => {
      const appSecret = "whatsapp-app-secret";
      const payload = makeWhatsAppPayload();
      const rawBody = JSON.stringify(payload);
      const sig = computeWhatsAppSignature(appSecret, rawBody);

      const config: WebhookConfig = { agentId: "a", appSecret };
      const req = new Request("http://localhost/webhook", {
        method: "POST",
        headers: { "x-hub-signature-256": sig },
      });
      expect(await whatsappAdapter.verifyWebhook(req, rawBody, config)).toBe(
        true,
      );
    });

    test("rejects tampered body", async () => {
      const appSecret = "whatsapp-app-secret";
      const rawBody = JSON.stringify(makeWhatsAppPayload());
      const sig = computeWhatsAppSignature(appSecret, rawBody);

      const config: WebhookConfig = { agentId: "a", appSecret };
      const req = new Request("http://localhost/webhook", {
        method: "POST",
        headers: { "x-hub-signature-256": sig },
      });
      expect(
        await whatsappAdapter.verifyWebhook(req, '{"tampered":1}', config),
      ).toBe(false);
    });

    test("rejects missing signature header", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        appSecret: "secret",
      };
      const req = new Request("http://localhost/webhook", { method: "POST" });
      expect(await whatsappAdapter.verifyWebhook(req, "{}", config)).toBe(
        false,
      );
    });

    test("returns false when appSecret not configured", async () => {
      const config: WebhookConfig = { agentId: "a" };
      const req = new Request("http://localhost/webhook", { method: "POST" });
      expect(await whatsappAdapter.verifyWebhook(req, "{}", config)).toBe(
        false,
      );
    });

    test("rejects invalid hex in signature", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        appSecret: "secret",
      };
      const req = new Request("http://localhost/webhook", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=not-hex-at-all!" },
      });
      expect(await whatsappAdapter.verifyWebhook(req, "{}", config)).toBe(
        false,
      );
    });
  });

  // ── extractEvent ───────────────────────────────────────────────

  describe("extractEvent", () => {
    test("extracts text message from nested payload", async () => {
      const payload = makeWhatsAppPayload();
      const event = await whatsappAdapter.extractEvent(JSON.stringify(payload));
      expect(event).toEqual({
        platform: "whatsapp",
        messageId: "wamid.001",
        chatId: "14245074963",
        senderId: "14245074963",
        senderName: "John",
        text: "Hello",
        rawPayload: payload,
      });
    });

    test("returns null for status updates (no messages)", async () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "BIZ_ID",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+14155238886",
                    phone_number_id: "PH_ID",
                  },
                  statuses: [
                    {
                      id: "wamid.001",
                      status: "delivered",
                      timestamp: "1234567890",
                      recipient_id: "14245074963",
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };
      expect(
        await whatsappAdapter.extractEvent(JSON.stringify(payload)),
      ).toBeNull();
    });

    test("returns null for non-text message types", async () => {
      const payload = makeWhatsAppPayload([
        {
          id: "wamid.002",
          from: "14245074963",
          type: "image",
          timestamp: "1234567890",
        },
      ]);
      expect(
        await whatsappAdapter.extractEvent(JSON.stringify(payload)),
      ).toBeNull();
    });

    test("returns null when field is not messages", async () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "BIZ_ID",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+14155238886",
                    phone_number_id: "PH_ID",
                  },
                },
                field: "account_update",
              },
            ],
          },
        ],
      };
      expect(
        await whatsappAdapter.extractEvent(JSON.stringify(payload)),
      ).toBeNull();
    });

    test("returns null for invalid JSON", async () => {
      expect(await whatsappAdapter.extractEvent("bad json")).toBeNull();
    });

    test("returns null for non-whatsapp_business_account object", async () => {
      expect(
        await whatsappAdapter.extractEvent(
          JSON.stringify({ object: "page", entry: [] }),
        ),
      ).toBeNull();
    });

    test("maps sender name from contacts", async () => {
      const payload = makeWhatsAppPayload(
        [
          {
            id: "wamid.003",
            from: "19876543210",
            type: "text",
            timestamp: "1234567890",
            text: { body: "Hi" },
          },
        ],
        [{ profile: { name: "Jane Doe" }, wa_id: "19876543210" }],
      );
      const event = await whatsappAdapter.extractEvent(JSON.stringify(payload));
      expect(event!.senderName).toBe("Jane Doe");
    });

    test("handles missing contacts gracefully", async () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "BIZ_ID",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "+14155238886",
                    phone_number_id: "PH_ID",
                  },
                  messages: [
                    {
                      id: "wamid.004",
                      from: "14245074963",
                      timestamp: "1234567890",
                      type: "text",
                      text: { body: "No contact info" },
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };
      const event = await whatsappAdapter.extractEvent(JSON.stringify(payload));
      expect(event!.senderName).toBeUndefined();
      expect(event!.text).toBe("No contact info");
    });
  });

  // ── sendReply ──────────────────────────────────────────────────

  describe("sendReply", () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            messaging_product: "whatsapp",
            messages: [{ id: "wamid.reply" }],
          }),
        ),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    test("sends text message via Graph API", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        accessToken: "META_TOKEN",
        phoneNumberId: "PH_ID",
      };
      await whatsappAdapter.sendReply(config, makeEvent(), "Agent reply");

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://graph.facebook.com/v21.0/PH_ID/messages");
      expect((opts.headers as Record<string, string>).Authorization).toBe(
        "Bearer META_TOKEN",
      );
      const body = JSON.parse(opts.body as string);
      expect(body).toEqual({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "14245074963",
        type: "text",
        text: { body: "Agent reply" },
      });
    });

    test("throws when credentials are missing", async () => {
      const config: WebhookConfig = { agentId: "a" };
      expect(
        whatsappAdapter.sendReply(config, makeEvent(), "reply"),
      ).rejects.toThrow("Missing WhatsApp credentials");
    });

    test("throws on non-ok response", async () => {
      fetchSpy.mockRestore();
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Unauthorized", { status: 401 }),
      );
      const config: WebhookConfig = {
        agentId: "a",
        accessToken: "bad-token",
        phoneNumberId: "PH_ID",
      };
      expect(
        whatsappAdapter.sendReply(config, makeEvent(), "reply"),
      ).rejects.toThrow("WhatsApp send error (401)");
    });
  });

  // ── sendTypingIndicator ────────────────────────────────────────

  describe("sendTypingIndicator", () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ success: true })),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    test("marks message as read via Graph API", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        accessToken: "TOKEN",
        phoneNumberId: "PH_ID",
      };
      await whatsappAdapter.sendTypingIndicator(config, makeEvent());

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://graph.facebook.com/v21.0/PH_ID/messages");
      const body = JSON.parse(opts.body as string);
      expect(body).toEqual({
        messaging_product: "whatsapp",
        status: "read",
        message_id: "wamid.001",
      });
    });

    test("no-op when credentials missing", async () => {
      const config: WebhookConfig = { agentId: "a" };
      await whatsappAdapter.sendTypingIndicator(config, makeEvent());
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
