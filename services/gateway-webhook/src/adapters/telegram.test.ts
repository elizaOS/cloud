import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { telegramAdapter } from "./telegram";
import type { WebhookConfig, ChatEvent } from "./types";

function makeEvent(overrides: Partial<ChatEvent> = {}): ChatEvent {
  return {
    platform: "telegram",
    messageId: "1",
    chatId: "999",
    senderId: "999",
    text: "Hello",
    rawPayload: {},
    ...overrides,
  };
}

describe("telegramAdapter", () => {
  // ── verifyWebhook ──────────────────────────────────────────────

  describe("verifyWebhook", () => {
    test("accepts matching secret (constant-time comparison)", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        webhookSecret: "my-secret-123",
      };
      const req = new Request("http://localhost/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "my-secret-123" },
      });
      expect(await telegramAdapter.verifyWebhook(req, "{}", config)).toBe(true);
    });

    test("rejects wrong secret", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        webhookSecret: "my-secret-123",
      };
      const req = new Request("http://localhost/webhook", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": "wrong" },
      });
      expect(await telegramAdapter.verifyWebhook(req, "{}", config)).toBe(
        false,
      );
    });

    test("rejects missing header", async () => {
      const config: WebhookConfig = {
        agentId: "a",
        webhookSecret: "my-secret",
      };
      const req = new Request("http://localhost/webhook", { method: "POST" });
      expect(await telegramAdapter.verifyWebhook(req, "{}", config)).toBe(
        false,
      );
    });

    test("rejects request when no webhookSecret configured", async () => {
      const config: WebhookConfig = { agentId: "a" };
      const req = new Request("http://localhost/webhook", { method: "POST" });
      expect(await telegramAdapter.verifyWebhook(req, "{}", config)).toBe(
        false,
      );
    });

    test("rejects length mismatch secrets", async () => {
      const config: WebhookConfig = { agentId: "a", webhookSecret: "short" };
      const req = new Request("http://localhost/webhook", {
        method: "POST",
        headers: {
          "x-telegram-bot-api-secret-token": "this-is-a-much-longer-secret",
        },
      });
      expect(await telegramAdapter.verifyWebhook(req, "{}", config)).toBe(
        false,
      );
    });
  });

  // ── extractEvent ───────────────────────────────────────────────

  describe("extractEvent", () => {
    test("extracts text message from private chat", async () => {
      const update = {
        update_id: 100,
        message: {
          message_id: 1,
          from: { id: 42, first_name: "Alice", is_bot: false },
          chat: { id: 42, type: "private" },
          text: "Hello world",
        },
      };
      const event = await telegramAdapter.extractEvent(JSON.stringify(update));
      expect(event).toEqual({
        platform: "telegram",
        messageId: "100",
        chatId: "42",
        senderId: "42",
        senderName: "Alice",
        text: "Hello world",
        isCommand: false,
        rawPayload: update,
      });
    });

    test("extracts caption when no text", async () => {
      const update = {
        update_id: 101,
        message: {
          message_id: 2,
          from: { id: 42, first_name: "Alice" },
          chat: { id: 42, type: "private" },
          caption: "Photo description",
          photo: [{ file_id: "abc" }],
        },
      };
      const event = await telegramAdapter.extractEvent(JSON.stringify(update));
      expect(event!.text).toBe("Photo description");
    });

    test("detects /start as command", async () => {
      const update = {
        update_id: 102,
        message: {
          message_id: 3,
          from: { id: 42, first_name: "Alice" },
          chat: { id: 42, type: "private" },
          text: "/start",
        },
      };
      const event = await telegramAdapter.extractEvent(JSON.stringify(update));
      expect(event!.isCommand).toBe(true);
    });

    test("returns null for group chat", async () => {
      const update = {
        update_id: 103,
        message: {
          message_id: 4,
          from: { id: 42, first_name: "Alice" },
          chat: { id: -100123, type: "group" },
          text: "Hi group",
        },
      };
      expect(
        await telegramAdapter.extractEvent(JSON.stringify(update)),
      ).toBeNull();
    });

    test("returns null for supergroup chat", async () => {
      const update = {
        update_id: 104,
        message: {
          message_id: 5,
          from: { id: 42, first_name: "Alice" },
          chat: { id: -100456, type: "supergroup" },
          text: "Hi supergroup",
        },
      };
      expect(
        await telegramAdapter.extractEvent(JSON.stringify(update)),
      ).toBeNull();
    });

    test("returns null for bot message", async () => {
      const update = {
        update_id: 105,
        message: {
          message_id: 6,
          from: { id: 100, first_name: "MyBot", is_bot: true },
          chat: { id: 100, type: "private" },
          text: "Automated reply",
        },
      };
      expect(
        await telegramAdapter.extractEvent(JSON.stringify(update)),
      ).toBeNull();
    });

    test("returns null for empty text", async () => {
      const update = {
        update_id: 106,
        message: {
          message_id: 7,
          from: { id: 42, first_name: "Alice" },
          chat: { id: 42, type: "private" },
        },
      };
      expect(
        await telegramAdapter.extractEvent(JSON.stringify(update)),
      ).toBeNull();
    });

    test("returns null for update without message", async () => {
      expect(
        await telegramAdapter.extractEvent(JSON.stringify({ update_id: 107 })),
      ).toBeNull();
    });

    test("returns null for invalid JSON", async () => {
      expect(await telegramAdapter.extractEvent("{bad json")).toBeNull();
    });

    test("uses chat.id as senderId when from is missing", async () => {
      const update = {
        update_id: 108,
        message: {
          message_id: 8,
          chat: { id: 42, type: "private" },
          text: "No from field",
        },
      };
      const event = await telegramAdapter.extractEvent(JSON.stringify(update));
      expect(event!.senderId).toBe("42");
    });
  });

  // ── sendReply ──────────────────────────────────────────────────

  describe("sendReply", () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
        async () =>
          new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    test("sends message with Markdown parse_mode", async () => {
      const config: WebhookConfig = { agentId: "a", botToken: "123:ABC" };
      await telegramAdapter.sendReply(config, makeEvent(), "Reply");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
      const body = JSON.parse(opts.body as string);
      expect(body.chat_id).toBe("999");
      expect(body.text).toBe("Reply");
      expect(body.parse_mode).toBe("Markdown");
    });

    test("splits messages exceeding 4096 chars", async () => {
      const config: WebhookConfig = { agentId: "a", botToken: "123:ABC" };
      const longText = "A".repeat(4096) + "\nB".repeat(100);
      await telegramAdapter.sendReply(config, makeEvent(), longText);
      expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    test("falls back to plain text when Markdown fails", async () => {
      fetchSpy.mockRestore();
      let callIdx = 0;
      fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async () => {
        callIdx++;
        if (callIdx === 1) throw new Error("Bad Markdown");
        return new Response(
          JSON.stringify({ ok: true, result: { message_id: 1 } }),
        );
      });

      const config: WebhookConfig = { agentId: "a", botToken: "123:ABC" };
      await telegramAdapter.sendReply(config, makeEvent(), "**bold**");

      expect(callIdx).toBe(2);
      const body = JSON.parse(
        (fetchSpy.mock.calls[1] as [string, RequestInit])[1].body as string,
      );
      expect(body.parse_mode).toBeUndefined();
    });

    test("throws when botToken is missing", async () => {
      const config: WebhookConfig = { agentId: "a" };
      expect(
        telegramAdapter.sendReply(config, makeEvent(), "reply"),
      ).rejects.toThrow("Missing botToken");
    });
  });

  // ── sendTypingIndicator ────────────────────────────────────────

  describe("sendTypingIndicator", () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: true })),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    test("sends typing chat action", async () => {
      const config: WebhookConfig = { agentId: "a", botToken: "123:ABC" };
      await telegramAdapter.sendTypingIndicator(config, makeEvent());

      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.telegram.org/bot123:ABC/sendChatAction");
      const body = JSON.parse(opts.body as string);
      expect(body.action).toBe("typing");
      expect(body.chat_id).toBe("999");
    });

    test("no-op when botToken missing", async () => {
      const config: WebhookConfig = { agentId: "a" };
      await telegramAdapter.sendTypingIndicator(config, makeEvent());
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
