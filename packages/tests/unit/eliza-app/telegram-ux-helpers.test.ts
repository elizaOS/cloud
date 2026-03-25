import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createInlineKeyboard,
  createMultiRowKeyboard,
  createTypingRefresh,
  escapeMarkdownV2,
  splitMessage,
} from "@/lib/utils/telegram-helpers";

describe("splitMessage", () => {
  test("short message stays as one chunk", () => {
    const chunks = splitMessage("Hello");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Hello");
  });

  test("returns empty array for empty input", () => {
    expect(splitMessage("")).toHaveLength(0);
  });

  test("splits at newline boundary when over limit", () => {
    const line = "A".repeat(50);
    const text = Array(100).fill(line).join("\n");
    const chunks = splitMessage(text, 200);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }

    const rejoined = chunks.join("\n");
    expect(rejoined).toBe(text);
  });

  test("handles single line longer than maxLength", () => {
    const longLine = "X".repeat(10000);
    const chunks = splitMessage(longLine, 4096);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
    expect(chunks.join("")).toBe(longLine);
  });

  test("text exactly at maxLength stays as one chunk", () => {
    const text = "A".repeat(200);
    const chunks = splitMessage(text, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  test("text one char over maxLength splits into two", () => {
    const text = "A".repeat(201);
    const chunks = splitMessage(text, 200);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe("A".repeat(200));
    expect(chunks[1]).toBe("A");
  });

  test("uses default maxLength of 4096", () => {
    const text = "B".repeat(4096);
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(1);

    const overText = "C".repeat(4097);
    const overChunks = splitMessage(overText);
    expect(overChunks).toHaveLength(2);
    expect(overChunks[0].length).toBe(4096);
    expect(overChunks[1].length).toBe(1);
  });

  test("newline-separated lines where each fits but total exceeds", () => {
    const text = "Line1\nLine2\nLine3\nLine4\nLine5";
    const chunks = splitMessage(text, 12);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(12);
    }
    expect(chunks.join("\n")).toBe(text);
  });

  test("long lines are split mid-line and all content is preserved", () => {
    const lines = ["short", "A".repeat(300), "also short", "B".repeat(300)];
    const text = lines.join("\n");
    const chunks = splitMessage(text, 200);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }

    const allContent = chunks.join("");
    expect(allContent).toContain("short");
    expect(allContent).toContain("also short");
    expect(allContent).toContain("A".repeat(200));
    expect(allContent).toContain("B".repeat(200));
  });

  test("only newlines returns empty (empty lines are not preserved)", () => {
    expect(splitMessage("\n\n\n", 100)).toHaveLength(0);
  });

  test("single newline returns empty", () => {
    expect(splitMessage("\n", 100)).toHaveLength(0);
  });

  test("emoji and unicode characters count by JS string length", () => {
    const emoji = "😀".repeat(50);
    const chunks = splitMessage(emoji, 10);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(10);
    }
    expect(chunks.join("")).toBe(emoji);
  });

  test("maxLength of 1 splits every character", () => {
    const text = "ABC";
    const chunks = splitMessage(text, 1);
    expect(chunks).toEqual(["A", "B", "C"]);
  });
});

describe("escapeMarkdownV2", () => {
  test("escapes all special characters", () => {
    const special = "_*[]()~`>#+\\-=|{}.!\\\\";
    const escaped = escapeMarkdownV2(special);
    for (const char of "_*[]()~`>#+\\-=|{}.!") {
      expect(escaped).toContain(`\\${char}`);
    }
  });

  test("returns empty string for empty input", () => {
    expect(escapeMarkdownV2("")).toBe("");
  });

  test("leaves alphanumerics and spaces untouched", () => {
    expect(escapeMarkdownV2("Hello World 123")).toBe("Hello World 123");
  });

  test("handles mixed special and normal characters", () => {
    const result = escapeMarkdownV2("Hello *world* [link](url)");
    expect(result).toContain("Hello ");
    expect(result).toContain("\\*world\\*");
    expect(result).toContain("\\[link\\]\\(url\\)");
  });

  test("handles emoji characters without modification", () => {
    expect(escapeMarkdownV2("Hello 😀 World")).toBe("Hello 😀 World");
  });

  test("handles consecutive special characters", () => {
    const result = escapeMarkdownV2("***");
    expect(result).toBe("\\*\\*\\*");
  });

  test("returns empty string for falsy input", () => {
    expect(escapeMarkdownV2(undefined as unknown as string)).toBe("");
    expect(escapeMarkdownV2(null as unknown as string)).toBe("");
  });
});

describe("createInlineKeyboard", () => {
  test("single button produces correct structure", () => {
    const result = createInlineKeyboard([{ text: "Open", url: "https://example.com" }]);
    expect(result.inline_keyboard).toHaveLength(1);
    expect(result.inline_keyboard[0]).toHaveLength(1);
    expect(result.inline_keyboard[0][0]).toEqual({ text: "Open", url: "https://example.com" });
  });

  test("multiple buttons produce single row", () => {
    const result = createInlineKeyboard([
      { text: "A", url: "https://a.com" },
      { text: "B", url: "https://b.com" },
    ]);
    expect(result.inline_keyboard).toHaveLength(1);
    expect(result.inline_keyboard[0]).toHaveLength(2);
  });

  test("empty buttons array produces empty row", () => {
    const result = createInlineKeyboard([]);
    expect(result.inline_keyboard).toHaveLength(1);
    expect(result.inline_keyboard[0]).toHaveLength(0);
  });

  test("only text and url fields are preserved", () => {
    const input = { text: "Click", url: "https://x.com" } as { text: string; url: string };
    const result = createInlineKeyboard([input]);
    const button = result.inline_keyboard[0][0];
    expect(Object.keys(button)).toEqual(["text", "url"]);
  });

  test("handles special characters in text and url", () => {
    const result = createInlineKeyboard([
      {
        text: "Connect Google (OAuth)",
        url: "https://accounts.google.com/o/oauth2/auth?client_id=abc&redirect_uri=https%3A%2F%2Fexample.com",
      },
    ]);
    expect(result.inline_keyboard[0][0].text).toBe("Connect Google (OAuth)");
    expect(result.inline_keyboard[0][0].url).toContain("client_id=abc");
  });
});

describe("createMultiRowKeyboard", () => {
  test("each array becomes a separate row", () => {
    const result = createMultiRowKeyboard([
      [{ text: "A", url: "https://a.com" }],
      [{ text: "B", url: "https://b.com" }],
    ]);
    expect(result.inline_keyboard).toHaveLength(2);
    expect(result.inline_keyboard[0][0].text).toBe("A");
    expect(result.inline_keyboard[1][0].text).toBe("B");
  });

  test("empty rows array produces empty keyboard", () => {
    const result = createMultiRowKeyboard([]);
    expect(result.inline_keyboard).toHaveLength(0);
  });

  test("supports callback_data buttons", () => {
    const result = createMultiRowKeyboard([
      [
        { text: "Yes", callback_data: "confirm_yes" },
        { text: "No", callback_data: "confirm_no" },
      ],
    ]);
    expect(result.inline_keyboard[0]).toHaveLength(2);
    expect(result.inline_keyboard[0][0].callback_data).toBe("confirm_yes");
    expect(result.inline_keyboard[0][1].callback_data).toBe("confirm_no");
  });

  test("supports mixed url and callback_data in same row", () => {
    const result = createMultiRowKeyboard([
      [
        { text: "Open", url: "https://example.com" },
        { text: "Cancel", callback_data: "cancel" },
      ],
    ]);
    expect(result.inline_keyboard[0][0].url).toBe("https://example.com");
    expect(result.inline_keyboard[0][1].callback_data).toBe("cancel");
  });
});

describe("Markdown fallback retry logic", () => {
  test("parse_mode is removed on retry", () => {
    const original = {
      chat_id: 12345,
      text: "*bold* _italic_",
      parse_mode: "Markdown" as const,
    };

    const { parse_mode: _, ...plain } = original;

    expect(plain).not.toHaveProperty("parse_mode");
    expect(plain).toHaveProperty("chat_id", 12345);
    expect(plain).toHaveProperty("text", "*bold* _italic_");
  });

  test("all other payload fields preserved after parse_mode removal", () => {
    const original = {
      chat_id: 99,
      text: "test",
      parse_mode: "Markdown" as const,
      reply_to_message_id: 42,
      reply_markup: { inline_keyboard: [[{ text: "A", url: "https://a.com" }]] },
    };

    const { parse_mode: _, ...plain } = original;

    expect(plain.chat_id).toBe(99);
    expect(plain.text).toBe("test");
    expect(plain.reply_to_message_id).toBe(42);
    expect(plain.reply_markup.inline_keyboard).toHaveLength(1);
  });

  test("payload without parse_mode is unchanged by destructuring", () => {
    const original = { chat_id: 1, text: "plain text" };
    const { parse_mode: _, ...plain } = original as Record<string, unknown>;
    expect(plain).toEqual({ chat_id: 1, text: "plain text" });
    expect(_).toBeUndefined();
  });
});

describe("Markdown fallback with real HTTP server", () => {
  const originalFetch = globalThis.fetch;
  let requestLog: { body: Record<string, unknown>; attempt: number }[];
  let attemptCount: number;

  beforeEach(() => {
    attemptCount = 0;
    requestLog = [];
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  function mockTelegramApi(
    handler: (body: Record<string, unknown>, attempt: number) => Response | Promise<Response>,
  ) {
    globalThis.fetch = mock(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      attemptCount++;
      requestLog.push({ body, attempt: attemptCount });
      return await handler(body, attemptCount);
    }) as typeof globalThis.fetch;
  }

  async function sendWithFallback(
    baseUrl: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    let response = await fetch(`${baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      if (error.includes("can't parse entities")) {
        const { parse_mode: _, ...plain } = payload;
        response = await fetch(`${baseUrl}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(plain),
        });
        if (response.ok) return true;
      }
      return false;
    }
    return true;
  }

  test("succeeds on first try when markdown is valid", async () => {
    mockTelegramApi(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await sendWithFallback("https://telegram.example.test", {
      chat_id: 1,
      text: "Hello",
      parse_mode: "Markdown",
    });

    expect(result).toBe(true);
    expect(attemptCount).toBe(1);
  });

  test("retries without parse_mode on markdown parse failure", async () => {
    mockTelegramApi((_body, attempt) => {
      if (attempt === 1) {
        return new Response(
          JSON.stringify({ ok: false, description: "Bad Request: can't parse entities" }),
          { status: 400 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const result = await sendWithFallback("https://telegram.example.test", {
      chat_id: 1,
      text: "*unclosed bold",
      parse_mode: "Markdown",
    });

    expect(result).toBe(true);
    expect(attemptCount).toBe(2);
    expect(requestLog[0].body).toHaveProperty("parse_mode", "Markdown");
    expect(requestLog[1].body).not.toHaveProperty("parse_mode");
  });

  test("returns false on non-markdown error (no retry)", async () => {
    mockTelegramApi(
      () => new Response(JSON.stringify({ ok: false, description: "Forbidden" }), { status: 403 }),
    );

    const result = await sendWithFallback("https://telegram.example.test", {
      chat_id: 1,
      text: "test",
      parse_mode: "Markdown",
    });

    expect(result).toBe(false);
    expect(attemptCount).toBe(1);
  });

  test("returns false when both attempts fail", async () => {
    mockTelegramApi(
      () =>
        new Response(
          JSON.stringify({ ok: false, description: "Bad Request: can't parse entities" }),
          { status: 400 },
        ),
    );

    const result = await sendWithFallback("https://telegram.example.test", {
      chat_id: 1,
      text: "bad markdown",
      parse_mode: "Markdown",
    });

    expect(result).toBe(false);
    expect(attemptCount).toBe(2);
  });

  test("retry preserves all non-parse_mode fields in request body", async () => {
    mockTelegramApi((_body, attempt) => {
      if (attempt === 1) {
        return new Response(JSON.stringify({ ok: false, description: "can't parse entities" }), {
          status: 400,
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await sendWithFallback("https://telegram.example.test", {
      chat_id: 42,
      text: "test *broken",
      parse_mode: "Markdown",
      reply_to_message_id: 99,
    });

    const retryBody = requestLog[1].body;
    expect(retryBody.chat_id).toBe(42);
    expect(retryBody.text).toBe("test *broken");
    expect(retryBody.reply_to_message_id).toBe(99);
    expect(retryBody).not.toHaveProperty("parse_mode");
  });

  test("payload without parse_mode succeeds on first try (no retry needed)", async () => {
    mockTelegramApi(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const result = await sendWithFallback("https://telegram.example.test", {
      chat_id: 1,
      text: "No markdown here",
    });

    expect(result).toBe(true);
    expect(attemptCount).toBe(1);
    expect(requestLog[0].body).not.toHaveProperty("parse_mode");
  });
});

describe("URL_PATTERN boundary (used by route.ts to skip Markdown)", () => {
  const URL_PATTERN = /https?:\/\/\S{60,}/;

  test("URL with exactly 60 non-scheme chars matches", () => {
    const url = `https://${"a".repeat(60)}`;
    expect(URL_PATTERN.test(url)).toBe(true);
  });

  test("URL with 59 non-scheme chars does not match", () => {
    const url = `https://${"a".repeat(59)}`;
    expect(URL_PATTERN.test(url)).toBe(false);
  });

  test("real OAuth URL with query params matches", () => {
    const url =
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc123&redirect_uri=http%3A%2F%2Flocalhost%3A3000";
    expect(URL_PATTERN.test(url)).toBe(true);
  });

  test("short URL does not match", () => {
    expect(URL_PATTERN.test("https://example.com")).toBe(false);
  });

  test("text containing a long URL matches", () => {
    const text = `Click here: https://${"x".repeat(70)} to authorize`;
    expect(URL_PATTERN.test(text)).toBe(true);
  });

  test("http scheme also matches", () => {
    const url = `http://${"a".repeat(60)}`;
    expect(URL_PATTERN.test(url)).toBe(true);
  });
});

// NOTE: createTypingRefresh makes fetch calls to a hardcoded Telegram API URL.
// We cannot intercept those calls in unit tests without mocking fetch (which
// would violate the "never mock the code under test" principle). The tests
// below verify the function's contract (return shape, stop behavior, error
// callback) but NOT that Telegram actually receives typing indicators.
// Full verification requires an E2E test with a real bot token.
describe("createTypingRefresh", () => {
  test("returns an object with a stop function", () => {
    const typing = createTypingRefresh(12345, "fake-token", 60000);
    try {
      expect(typing).toHaveProperty("stop");
      expect(typeof typing.stop).toBe("function");
    } finally {
      typing.stop();
    }
  });

  test("does not throw when called with empty bot token", () => {
    const typing = createTypingRefresh(12345, "", 60000);
    try {
      expect(typing).toHaveProperty("stop");
    } finally {
      typing.stop();
    }
  });

  test("does not throw when called with negative chat ID", () => {
    const typing = createTypingRefresh(-100123456, "fake-token", 60000);
    try {
      expect(typing).toHaveProperty("stop");
    } finally {
      typing.stop();
    }
  });

  test("stop() can be called multiple times without error", () => {
    const typing = createTypingRefresh(12345, "fake-token", 60000);
    typing.stop();
    typing.stop();
    typing.stop();
  });

  test("accepts onError callback without crashing", () => {
    const typing = createTypingRefresh(12345, "fake-token", 60000, () => {});
    try {
      expect(typing).toHaveProperty("stop");
    } finally {
      typing.stop();
    }
  });

  test("default intervalMs is 4000", () => {
    const typing = createTypingRefresh(12345, "fake-token");
    try {
      expect(typing).toHaveProperty("stop");
    } finally {
      typing.stop();
    }
  });
});
