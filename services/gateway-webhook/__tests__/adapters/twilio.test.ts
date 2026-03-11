import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import crypto from "crypto";
import { twilioAdapter } from "../../src/adapters/twilio";
import type { WebhookConfig, ChatEvent } from "../../src/adapters/types";

function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  const data = url + sortedParams;
  return crypto.createHmac("sha1", authToken).update(data).digest("base64");
}

function makeTwilioFormBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

function makeEvent(overrides: Partial<ChatEvent> = {}): ChatEvent {
  return {
    platform: "twilio",
    messageId: "SM123",
    chatId: "+15551234567",
    senderId: "+15551234567",
    text: "Hello",
    rawPayload: {},
    ...overrides,
  };
}

describe("twilioAdapter", () => {
  // ── verifyWebhook ──────────────────────────────────────────────

  describe("verifyWebhook", () => {
    test("accepts valid HMAC-SHA1 signature", async () => {
      const authToken = "twilio-auth-token-123";
      const params = {
        MessageSid: "SM001",
        AccountSid: "AC001",
        From: "+15551234567",
        To: "+18005551234",
        Body: "Test message",
      };
      const url = "https://gateway.example.com/webhook/cloud/twilio";
      const sig = computeTwilioSignature(authToken, url, params);
      const rawBody = makeTwilioFormBody(params);

      const config: WebhookConfig = { agentId: "a", authToken };
      const req = new Request(url, {
        method: "POST",
        headers: {
          "x-twilio-signature": sig,
          "content-type": "application/x-www-form-urlencoded",
        },
      });
      expect(await twilioAdapter.verifyWebhook(req, rawBody, config)).toBe(
        true,
      );
    });

    test("rejects wrong signature", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        authToken: "real-token",
      };
      const req = new Request("https://gw.example.com/webhook/cloud/twilio", {
        method: "POST",
        headers: { "x-twilio-signature": "bogus-signature" },
      });
      expect(await twilioAdapter.verifyWebhook(req, "Body=test", config)).toBe(
        false,
      );
    });

    test("uses X-Forwarded-Proto and X-Forwarded-Host for URL reconstruction", async () => {
      const authToken = "token-fwd";
      const params = {
        MessageSid: "SM002",
        AccountSid: "AC001",
        From: "+15559876543",
        To: "+18005551234",
        Body: "Forwarded",
      };
      const rawBody = makeTwilioFormBody(params);

      // Reconstruct the URL the same way the adapter does to ensure match
      const internalUrl = "http://gateway-pod:3000/webhook/cloud/twilio";
      const reconstructed = new URL(internalUrl);
      reconstructed.protocol = "https:";
      reconstructed.host = "public.example.com";
      const sig = computeTwilioSignature(
        authToken,
        reconstructed.toString(),
        params,
      );

      const config: WebhookConfig = { agentId: "a", authToken };
      const req = new Request(internalUrl, {
        method: "POST",
        headers: {
          "x-twilio-signature": sig,
          "x-forwarded-proto": "https",
          "x-forwarded-host": "public.example.com",
        },
      });
      expect(await twilioAdapter.verifyWebhook(req, rawBody, config)).toBe(
        true,
      );
    });

    test("returns false when authToken not configured", async () => {
      const config: WebhookConfig = { agentId: "a" };
      const req = new Request("http://localhost/webhook", { method: "POST" });
      expect(await twilioAdapter.verifyWebhook(req, "", config)).toBe(false);
    });
  });

  // ── extractEvent ───────────────────────────────────────────────

  describe("extractEvent", () => {
    test("extracts SMS message from form data", async () => {
      const params = {
        MessageSid: "SM100",
        AccountSid: "AC001",
        From: "+15551234567",
        To: "+18005551234",
        Body: "Hello via SMS",
        NumMedia: "0",
      };
      const event = await twilioAdapter.extractEvent(
        makeTwilioFormBody(params),
      );
      expect(event).toEqual({
        platform: "twilio",
        messageId: "SM100",
        chatId: "+15551234567",
        senderId: "+15551234567",
        text: "Hello via SMS",
        mediaUrls: undefined,
        rawPayload: expect.any(Object),
      });
    });

    test("extracts media URLs from allowed domains", async () => {
      const params = {
        MessageSid: "SM101",
        AccountSid: "AC001",
        From: "+15551234567",
        To: "+18005551234",
        Body: "",
        NumMedia: "2",
        MediaUrl0: "https://api.twilio.com/media/img1.jpg",
        MediaUrl1: "https://media.twiliocdn.com/media/img2.jpg",
      };
      const event = await twilioAdapter.extractEvent(
        makeTwilioFormBody(params),
      );
      expect(event!.text).toBe(
        "[media: https://api.twilio.com/media/img1.jpg, https://media.twiliocdn.com/media/img2.jpg]",
      );
      expect(event!.mediaUrls).toEqual([
        "https://api.twilio.com/media/img1.jpg",
        "https://media.twiliocdn.com/media/img2.jpg",
      ]);
    });

    test("rejects media URLs from untrusted domains", async () => {
      const params = {
        MessageSid: "SM102",
        AccountSid: "AC001",
        From: "+15551234567",
        To: "+18005551234",
        Body: "",
        NumMedia: "1",
        MediaUrl0: "https://evil.com/steal-data.jpg",
      };
      // No valid media + no body → null
      expect(
        await twilioAdapter.extractEvent(makeTwilioFormBody(params)),
      ).toBeNull();
    });

    test("returns null for empty body and no media", async () => {
      const params = {
        MessageSid: "SM103",
        AccountSid: "AC001",
        From: "+15551234567",
        To: "+18005551234",
        NumMedia: "0",
      };
      expect(
        await twilioAdapter.extractEvent(makeTwilioFormBody(params)),
      ).toBeNull();
    });

    test("returns null for invalid form data (missing MessageSid)", async () => {
      expect(
        await twilioAdapter.extractEvent("From=+15551234567&Body=hi"),
      ).toBeNull();
    });
  });

  // ── sendReply ──────────────────────────────────────────────────

  describe("sendReply", () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ sid: "SM999" })),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    test("sends SMS via Twilio REST API with Basic Auth", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        accountSid: "AC001",
        authToken: "secret",
        phoneNumber: "+18005551234",
      };
      await twilioAdapter.sendReply(config, makeEvent(), "Reply text");

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://api.twilio.com/2010-04-01/Accounts/AC001/Messages.json",
      );
      expect(opts.method).toBe("POST");

      const expectedAuth = Buffer.from("AC001:secret").toString("base64");
      expect((opts.headers as Record<string, string>).Authorization).toBe(
        `Basic ${expectedAuth}`,
      );

      const body = new URLSearchParams(opts.body as string);
      expect(body.get("To")).toBe("+15551234567");
      expect(body.get("From")).toBe("+18005551234");
      expect(body.get("Body")).toBe("Reply text");
    });

    test("throws when credentials are missing", async () => {
      const config: WebhookConfig = { agentId: "a" };
      expect(
        twilioAdapter.sendReply(config, makeEvent(), "reply"),
      ).rejects.toThrow("Missing Twilio credentials");
    });

    test("throws on non-ok response", async () => {
      fetchSpy.mockRestore();
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Auth failed", { status: 401 }),
      );
      const config: WebhookConfig = {
        agentId: "a",
        accountSid: "AC001",
        authToken: "bad",
        phoneNumber: "+18005551234",
      };
      expect(
        twilioAdapter.sendReply(config, makeEvent(), "reply"),
      ).rejects.toThrow("Twilio send error (401)");
    });
  });

  // ── sendTypingIndicator ────────────────────────────────────────

  describe("sendTypingIndicator", () => {
    test("is a no-op (Twilio has no typing indicator)", async () => {
      const fetchSpy = spyOn(globalThis, "fetch");
      const config: WebhookConfig = { agentId: "a" };
      await twilioAdapter.sendTypingIndicator(config, makeEvent());
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});
