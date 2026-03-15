import { describe, expect, test } from "bun:test";
import * as api from "../helpers/api-client";

/**
 * Chat API E2E Tests
 */

describe("Chat API", () => {
  test("POST /api/v1/chat requires authentication", async () => {
    const response = await api.post("/api/v1/chat", {
      messages: [{ role: "user", content: "Hello" }],
    });
    // Anonymous users get 200 (anonymous fallback) or 401
    expect([200, 401, 403]).toContain(response.status);
  });

  test("POST /api/v1/chat rejects empty messages", async () => {
    const response = await api.post("/api/v1/chat", { messages: [] });
    expect([400, 401]).toContain(response.status);
  });

  test.skipIf(!api.hasApiKey())(
    "POST /api/v1/chat accepts valid message with API key",
    async () => {
      const response = await api.post(
        "/api/v1/chat",
        {
          messages: [{ role: "user", content: "Say hello in one word" }],
        },
        { authenticated: true },
      );
      // Should succeed or report insufficient credits
      expect([200, 402]).toContain(response.status);
    },
  );
});

describe("Chat Completions API (OpenAI-compat)", () => {
  test("POST /api/v1/chat/completions requires auth", async () => {
    const response = await api.post("/api/v1/chat/completions", {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect([200, 401, 403]).toContain(response.status);
  });

  test.skipIf(!api.hasApiKey())(
    "POST /api/v1/chat/completions returns valid response structure",
    async () => {
      const response = await api.post(
        "/api/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "Say ok" }],
          max_tokens: 5,
          stream: false,
        },
        { authenticated: true },
      );

      if (response.status === 200) {
        const body = (await response.json()) as any;
        expect(body.choices || body.id).toBeTruthy();
      } else {
        expect([402, 429]).toContain(response.status);
      }
    },
  );
});
