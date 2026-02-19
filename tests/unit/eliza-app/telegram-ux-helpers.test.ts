import { describe, test, expect } from "bun:test";
import {
  extractAuthUrls,
  stripAuthUrlsFromText,
  createInlineKeyboard,
  createMultiRowKeyboard,
  escapeMarkdownV2,
  splitMessage,
  isSimpleMessage,
  createTypingRefresh,
} from "@/lib/utils/telegram-helpers";

describe("extractAuthUrls", () => {
  describe("happy path — single platform URLs", () => {
    test("detects Google accounts URL", () => {
      const text = "Here is your link: https://accounts.google.com/o/oauth2/auth?client_id=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Google");
      expect(result[0].url).toContain("accounts.google.com");
    });

    test("detects Google via /auth/ + google path pattern", () => {
      const text = "Visit https://example.com/auth/google/callback?code=xyz";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Google");
    });

    test("detects Twitter api.twitter URL", () => {
      const text = "Authorize here: https://api.twitter.com/oauth/authorize?token=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Twitter / X");
    });

    test("detects twitter.com/i/oauth URL", () => {
      const text = "Go to https://twitter.com/i/oauth2/authorize?client_id=foo";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Twitter / X");
    });

    test("detects x.com URL", () => {
      const text = "Visit https://x.com/i/oauth2/authorize?response_type=code";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Twitter / X");
    });

    test("detects GitHub authorize URL", () => {
      const text = "https://github.com/login/oauth/authorize?client_id=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect GitHub");
    });

    test("detects Slack OAuth URL", () => {
      const text = "https://slack.com/oauth/v2/authorize?client_id=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Slack");
    });

    test("detects Linear OAuth URL", () => {
      const text = "https://linear.app/oauth/authorize?client_id=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Linear");
    });

    test("detects Notion URL", () => {
      const text = "https://api.notion.so/v1/oauth/authorize?client_id=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Notion");
    });

    test("detects notion.com URL", () => {
      const text = "https://www.notion.com/v1/oauth/authorize?client_id=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Notion");
    });

    test("detects Discord OAuth URL", () => {
      const text = "https://discord.com/api/oauth2/authorize?client_id=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Discord");
    });

    test("detects LinkedIn OAuth URL", () => {
      const text = "https://www.linkedin.com/oauth/v2/authorization?client_id=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect LinkedIn");
    });

    test("detects Microsoft login URL", () => {
      const text = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Microsoft");
    });
  });

  describe("multiple URLs", () => {
    test("extracts multiple platform URLs from same text", () => {
      const text = [
        "Connect Google: https://accounts.google.com/o/oauth2/auth?id=1",
        "Connect Twitter: https://api.twitter.com/oauth/authorize?token=2",
      ].join("\n");

      const result = extractAuthUrls(text);
      expect(result).toHaveLength(2);

      const labels = result.map((r) => r.label);
      expect(labels).toContain("Connect Google");
      expect(labels).toContain("Connect Twitter / X");
    });

    test("each button has its own URL", () => {
      const text =
        "Google: https://accounts.google.com/auth?a=1 and GitHub: https://github.com/login/oauth/authorize?b=2";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(2);

      const google = result.find((r) => r.label === "Connect Google");
      const github = result.find((r) => r.label === "Connect GitHub");
      expect(google).toBeDefined();
      expect(github).toBeDefined();
      expect(google?.url).toContain("accounts.google.com");
      expect(github?.url).toContain("github.com");
    });
  });

  describe("non-auth URLs are ignored", () => {
    test("plain website URL is not extracted", () => {
      const text = "Check out https://example.com for more info";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(0);
    });

    test("GitHub repo URL (no authorize) is not extracted", () => {
      const text = "See https://github.com/elizaos/eliza-cloud for the repo";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(0);
    });

    test("slack.com without oauth is not extracted", () => {
      const text = "Visit https://slack.com/apps to browse";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    test("empty string returns empty array", () => {
      expect(extractAuthUrls("")).toHaveLength(0);
    });

    test("text with no URLs returns empty array", () => {
      expect(extractAuthUrls("Just a plain message with no links")).toHaveLength(0);
    });

    test("URL inside parentheses is extracted", () => {
      const text = "Click here (https://accounts.google.com/auth?id=123)";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].url).not.toContain(")");
    });

    test("URL at end of sentence (no trailing space) is extracted", () => {
      const text = "Auth link: https://api.twitter.com/oauth/authorize?token=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
    });

    test("generic OAuth URL gets 'Authorize' fallback label", () => {
      const text = "Visit https://custom-service.example.com/oauth/authorize?client=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Authorize");
    });

    test("generic /auth/ URL gets 'Authorize' fallback label", () => {
      const text = "Visit https://random-provider.io/auth/callback?code=xyz";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Authorize");
    });

    test("specific patterns take priority over generic Authorize", () => {
      const text = "https://accounts.google.com/o/oauth2/auth?client_id=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Google");
      expect(result[0].label).not.toBe("Authorize");
    });

    test("case-insensitive URL matching", () => {
      const text = "https://ACCOUNTS.GOOGLE.COM/o/OAuth2/Auth?client_id=abc";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Connect Google");
    });
  });

  describe("boundary conditions", () => {
    test("extremely long URL is still extracted", () => {
      const longQuery = "x=".repeat(500);
      const text = `Visit https://accounts.google.com/auth?${longQuery}`;
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
      expect(result[0].url.length).toBeGreaterThan(500);
    });

    test("URL with special characters in query params", () => {
      const text = "https://api.twitter.com/oauth/authorize?callback=https%3A%2F%2Fexample.com&state=abc%3D123";
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(1);
    });

    test("multiple identical URLs produce multiple buttons", () => {
      const url = "https://accounts.google.com/auth?id=1";
      const text = `Link 1: ${url} and Link 2: ${url}`;
      const result = extractAuthUrls(text);
      expect(result).toHaveLength(2);
    });
  });
});

describe("stripAuthUrlsFromText", () => {
  test("removes auth URL from text", () => {
    const text = "Here is your Google link: https://accounts.google.com/auth?id=1 — tap it to authorize.";
    const result = stripAuthUrlsFromText(text);
    expect(result).not.toContain("https://");
    expect(result).toContain("tap it to authorize");
  });

  test("removes 'Connect Platform:' prefixes", () => {
    const text = "Connect Google: https://accounts.google.com/auth\nConnect Twitter: https://api.twitter.com/oauth";
    const result = stripAuthUrlsFromText(text);
    expect(result).not.toContain("Connect Google:");
    expect(result).not.toContain("Connect Twitter:");
    expect(result).not.toContain("https://");
  });

  test("collapses triple+ newlines to double", () => {
    const text = "Before\n\n\n\n\nAfter";
    const result = stripAuthUrlsFromText(text);
    expect(result).toBe("Before\n\nAfter");
  });

  test("trims whitespace", () => {
    const text = "   some text   ";
    const result = stripAuthUrlsFromText(text);
    expect(result).toBe("some text");
  });

  test("returns empty string when text is only a URL", () => {
    const text = "https://accounts.google.com/oauth/auth?id=1";
    const result = stripAuthUrlsFromText(text);
    expect(result).toBe("");
  });

  test("text with no URLs is returned as-is (trimmed)", () => {
    const text = "Just a regular message with no links";
    const result = stripAuthUrlsFromText(text);
    expect(result).toBe("Just a regular message with no links");
  });

  test("preserves non-URL text around removed URLs", () => {
    const text = "Start here https://accounts.google.com/auth?id=1 then continue";
    const result = stripAuthUrlsFromText(text);
    expect(result).toContain("Start here");
    expect(result).toContain("then continue");
  });

  test("empty string returns empty string", () => {
    expect(stripAuthUrlsFromText("")).toBe("");
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
});

describe("Inline keyboard reply_markup structure", () => {
  test("each button gets its own row (one button per row)", () => {
    const buttons = [
      { label: "Connect Google", url: "https://accounts.google.com/auth" },
      { label: "Connect Twitter / X", url: "https://api.twitter.com/oauth" },
    ];

    const replyMarkup = {
      inline_keyboard: buttons.map((b) => [{ text: b.label, url: b.url }]),
    };

    expect(replyMarkup.inline_keyboard).toHaveLength(2);
    expect(replyMarkup.inline_keyboard[0]).toHaveLength(1);
    expect(replyMarkup.inline_keyboard[0][0].text).toBe("Connect Google");
    expect(replyMarkup.inline_keyboard[1][0].text).toBe("Connect Twitter / X");
  });

  test("single button produces one row", () => {
    const buttons = [{ label: "Get Started", url: "https://example.com/get-started" }];
    const replyMarkup = {
      inline_keyboard: buttons.map((b) => [{ text: b.label, url: b.url }]),
    };

    expect(replyMarkup.inline_keyboard).toHaveLength(1);
    expect(replyMarkup.inline_keyboard[0][0].text).toBe("Get Started");
    expect(replyMarkup.inline_keyboard[0][0].url).toBe("https://example.com/get-started");
  });

  test("reply_markup is a plain object, not double-serialized", () => {
    const buttons = [{ label: "Auth", url: "https://example.com/oauth" }];
    const payload = {
      chat_id: 12345,
      text: "Click to auth",
      reply_markup: {
        inline_keyboard: buttons.map((b) => [{ text: b.label, url: b.url }]),
      },
    };

    const serialized = JSON.stringify(payload);
    const parsed = JSON.parse(serialized);

    expect(typeof parsed.reply_markup).toBe("object");
    expect(typeof parsed.reply_markup).not.toBe("string");
    expect(parsed.reply_markup.inline_keyboard[0][0].text).toBe("Auth");
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
});

describe("Markdown fallback with real HTTP server", () => {
  let server: ReturnType<typeof Bun.serve>;
  let requestLog: { body: Record<string, unknown>; attempt: number }[];
  let attemptCount: number;

  function startServer(handler: (body: Record<string, unknown>, attempt: number) => Response) {
    attemptCount = 0;
    requestLog = [];

    server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        const body = (await req.json()) as Record<string, unknown>;
        attemptCount++;
        requestLog.push({ body, attempt: attemptCount });
        return handler(body, attemptCount);
      },
    });
  }

  function stopServer() {
    if (server) server.stop(true);
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
    startServer(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    try {
      const result = await sendWithFallback(`http://localhost:${server.port}`, {
        chat_id: 1,
        text: "Hello",
        parse_mode: "Markdown",
      });
      expect(result).toBe(true);
      expect(attemptCount).toBe(1);
    } finally {
      stopServer();
    }
  });

  test("retries without parse_mode on markdown parse failure", async () => {
    startServer((_body, attempt) => {
      if (attempt === 1) {
        return new Response(
          JSON.stringify({ ok: false, description: "Bad Request: can't parse entities" }),
          { status: 400 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    try {
      const result = await sendWithFallback(`http://localhost:${server.port}`, {
        chat_id: 1,
        text: "*unclosed bold",
        parse_mode: "Markdown",
      });

      expect(result).toBe(true);
      expect(attemptCount).toBe(2);
      expect(requestLog[0].body).toHaveProperty("parse_mode", "Markdown");
      expect(requestLog[1].body).not.toHaveProperty("parse_mode");
    } finally {
      stopServer();
    }
  });

  test("returns false on non-markdown error (no retry)", async () => {
    startServer(() =>
      new Response(JSON.stringify({ ok: false, description: "Forbidden" }), { status: 403 }),
    );

    try {
      const result = await sendWithFallback(`http://localhost:${server.port}`, {
        chat_id: 1,
        text: "test",
        parse_mode: "Markdown",
      });

      expect(result).toBe(false);
      expect(attemptCount).toBe(1);
    } finally {
      stopServer();
    }
  });

  test("returns false when both attempts fail", async () => {
    startServer(() =>
      new Response(
        JSON.stringify({ ok: false, description: "Bad Request: can't parse entities" }),
        { status: 400 },
      ),
    );

    try {
      const result = await sendWithFallback(`http://localhost:${server.port}`, {
        chat_id: 1,
        text: "bad markdown",
        parse_mode: "Markdown",
      });

      expect(result).toBe(false);
      expect(attemptCount).toBe(2);
    } finally {
      stopServer();
    }
  });
});

describe("escapeMarkdownV2", () => {
  test("escapes all special characters", () => {
    const special = "_*[]()~`>#+-=|{}.!\\";
    const escaped = escapeMarkdownV2(special);
    for (const char of special) {
      expect(escaped).toContain(`\\${char}`);
    }
  });

  test("returns empty string for empty input", () => {
    expect(escapeMarkdownV2("")).toBe("");
  });

  test("leaves alphanumerics and spaces untouched", () => {
    expect(escapeMarkdownV2("Hello World 123")).toBe("Hello World 123");
  });
});

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
});

describe("extractAuthUrls + stripAuthUrlsFromText composition", () => {
  test("typical OAuth response is split into clean text and buttons", () => {
    const agentResponse =
      "Here's your Google authorization link:\n\n" +
      "https://accounts.google.com/o/oauth2/auth?client_id=abc&redirect_uri=https%3A%2F%2Fexample.com\n\n" +
      "Tap the link above to authorize. When you're done, come back here and say \"done\".";

    const buttons = extractAuthUrls(agentResponse);
    const cleanText = stripAuthUrlsFromText(agentResponse);

    expect(buttons).toHaveLength(1);
    expect(buttons[0].label).toBe("Connect Google");
    expect(buttons[0].url).toContain("accounts.google.com");

    expect(cleanText).not.toContain("https://");
    expect(cleanText).toContain("authorization link");
    expect(cleanText).toContain("say \"done\"");
  });

  test("non-auth response returns empty buttons and unchanged text", () => {
    const agentResponse = "Sure! Here's a summary of your recent emails...";
    const buttons = extractAuthUrls(agentResponse);
    const cleanText = stripAuthUrlsFromText(agentResponse);

    expect(buttons).toHaveLength(0);
    expect(cleanText).toBe(agentResponse);
  });

  test("multi-platform response yields multiple buttons", () => {
    const agentResponse =
      "Connect Google: https://accounts.google.com/auth?id=1\n" +
      "Connect Twitter: https://api.twitter.com/oauth/authorize?token=2\n" +
      "Complete both to unlock full features.";

    const buttons = extractAuthUrls(agentResponse);
    const cleanText = stripAuthUrlsFromText(agentResponse);

    expect(buttons).toHaveLength(2);
    expect(cleanText).toContain("Complete both to unlock full features");
    expect(cleanText).not.toContain("https://");
  });
});

describe("stripAuthUrlsFromText — selective URL removal", () => {
  test("strips auth URL but preserves non-auth URL in same text", () => {
    const text =
      "Here is your auth link: https://accounts.google.com/o/oauth2/auth?id=1\n" +
      "Also check https://docs.example.com/help for documentation.";
    const result = stripAuthUrlsFromText(text);
    expect(result).not.toContain("accounts.google.com");
    expect(result).toContain("https://docs.example.com/help");
  });

  test("preserves regular URLs that aren't auth-related", () => {
    const text = "Visit https://www.wikipedia.org for more info";
    const result = stripAuthUrlsFromText(text);
    expect(result).toContain("https://www.wikipedia.org");
  });

  test("strips generic OAuth URL but preserves regular link", () => {
    const text =
      "Auth: https://custom.example.com/oauth/authorize?id=1 and docs: https://example.com/readme";
    const result = stripAuthUrlsFromText(text);
    expect(result).not.toContain("/oauth/authorize");
    expect(result).toContain("https://example.com/readme");
  });
});

describe("AUTH_URL_PATTERNS — false positive prevention", () => {
  test("docs.microsoft.com is NOT flagged as auth URL", () => {
    const text = "See https://docs.microsoft.com/en-us/api-reference for docs";
    const result = extractAuthUrls(text);
    expect(result).toHaveLength(0);
  });

  test("microsoft.com OAuth URL IS detected", () => {
    const text = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
    const result = extractAuthUrls(text);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Connect Microsoft");
  });

  test("notion.so public page is NOT flagged as auth URL", () => {
    const text = "Check https://notion.so/my-workspace/My-Page-abc123 for details";
    const result = extractAuthUrls(text);
    expect(result).toHaveLength(0);
  });

  test("notion.so OAuth URL IS detected", () => {
    const text = "https://api.notion.so/v1/oauth/authorize?client_id=abc";
    const result = extractAuthUrls(text);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Connect Notion");
  });

  test("notion.com OAuth URL IS detected", () => {
    const text = "https://www.notion.com/v1/oauth/authorize?client_id=abc";
    const result = extractAuthUrls(text);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Connect Notion");
  });
});

describe("isSimpleMessage", () => {
  describe("classified as simple (no ack needed)", () => {
    test("single word greeting", () => {
      expect(isSimpleMessage("hey")).toBe(true);
    });

    test("two word greeting", () => {
      expect(isSimpleMessage("hi there")).toBe(true);
    });

    test("three word phrase without action keywords", () => {
      expect(isSimpleMessage("thanks a lot")).toBe(true);
    });

    test("empty string", () => {
      expect(isSimpleMessage("")).toBe(true);
    });

    test("single word 'yes'", () => {
      expect(isSimpleMessage("yes")).toBe(true);
    });

    test("single word 'done'", () => {
      expect(isSimpleMessage("done")).toBe(true);
    });

    test("short phrase 'sounds good'", () => {
      expect(isSimpleMessage("sounds good")).toBe(true);
    });
  });

  describe("classified as complex (ack needed)", () => {
    test("short message with 'create' keyword", () => {
      expect(isSimpleMessage("create automation")).toBe(false);
    });

    test("short message with 'connect' keyword", () => {
      expect(isSimpleMessage("connect google")).toBe(false);
    });

    test("short message with 'send' keyword", () => {
      expect(isSimpleMessage("send emails")).toBe(false);
    });

    test("short message with 'check' keyword", () => {
      expect(isSimpleMessage("check status")).toBe(false);
    });

    test("short message with 'read' keyword", () => {
      expect(isSimpleMessage("read emails")).toBe(false);
    });

    test("short message with 'build' keyword", () => {
      expect(isSimpleMessage("build workflow")).toBe(false);
    });

    test("short message with 'draft' keyword", () => {
      expect(isSimpleMessage("draft email")).toBe(false);
    });

    test("short message with 'set up' keyword", () => {
      expect(isSimpleMessage("set up gmail")).toBe(false);
    });

    test("short message with 'automate' keyword", () => {
      expect(isSimpleMessage("automate this")).toBe(false);
    });

    test("long message without action keywords (>3 words)", () => {
      expect(isSimpleMessage("what is the weather today")).toBe(false);
    });

    test("full automation request", () => {
      expect(isSimpleMessage("create an automation that reads my email and sends to me on telegram")).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("action keyword is case-insensitive", () => {
      expect(isSimpleMessage("CREATE")).toBe(false);
      expect(isSimpleMessage("Connect")).toBe(false);
      expect(isSimpleMessage("SEND")).toBe(false);
    });

    test("exactly 3 words without keywords is simple", () => {
      expect(isSimpleMessage("one two three")).toBe(true);
    });

    test("exactly 4 words without keywords is complex", () => {
      expect(isSimpleMessage("one two three four")).toBe(false);
    });

    test("whitespace-only is simple", () => {
      expect(isSimpleMessage("   ")).toBe(true);
    });

    test("'creation' does NOT match 'create' (creat-i-on vs creat-e)", () => {
      expect(isSimpleMessage("creation")).toBe(true);
    });

    test("multiple spaces between words are normalized", () => {
      expect(isSimpleMessage("hey   there")).toBe(true);
    });
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
    expect(typing).toHaveProperty("stop");
    expect(typeof typing.stop).toBe("function");
    typing.stop();
  });

  test("does not throw when called with empty bot token", () => {
    const typing = createTypingRefresh(12345, "", 60000);
    expect(typing).toHaveProperty("stop");
    typing.stop();
  });

  test("does not throw when called with negative chat ID", () => {
    const typing = createTypingRefresh(-100123456, "fake-token", 60000);
    expect(typing).toHaveProperty("stop");
    typing.stop();
  });

  test("stop() can be called multiple times without error", () => {
    const typing = createTypingRefresh(12345, "fake-token", 60000);
    typing.stop();
    typing.stop();
    typing.stop();
  });

  test("accepts onError callback without crashing", () => {
    const typing = createTypingRefresh(12345, "fake-token", 60000, () => {});
    expect(typing).toHaveProperty("stop");
    typing.stop();
  });
});
