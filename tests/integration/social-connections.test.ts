/**
 * Social Connections API Integration Tests
 * Requires running server. Set TEST_API_KEY for authenticated tests.
 */

import { describe, test, expect, beforeAll } from "bun:test";

const API_BASE = process.env.TEST_API_BASE || "http://localhost:3000";
const skip = (name: string, reason: string) => console.log(`⚠️  SKIP: ${name} - ${reason}`);

describe("Social Connections API", () => {
  const apiKey = process.env.TEST_API_KEY ?? null;
  if (!apiKey) console.log("⚠️  TEST_API_KEY not set - authenticated tests will skip");

  describe("GET /api/v1/social-connections", () => {
    test("should return 401 without authentication", async () => {
      const response = await fetch(`${API_BASE}/api/v1/social-connections`);
      expect(response.status).toBe(401);
    });

    test("should list available platforms when authenticated", async () => {
      if (!apiKey) {
        skip("List platforms", "TEST_API_KEY not set");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.platforms)).toBe(true);

      // Should include core social platforms
      const platformNames = data.platforms.map((p: { platform: string }) => p.platform);
      expect(platformNames).toContain("twitter");
      expect(platformNames).toContain("bluesky");
      expect(platformNames).toContain("discord");
      expect(platformNames).toContain("telegram");
      expect(platformNames).toContain("mastodon");
    });
  });

  describe("GET /api/v1/social-connections/connect/[platform]", () => {
    test("should return 404 for unsupported platform", async () => {
      if (!apiKey) {
        skip("Unsupported platform", "TEST_API_KEY not set");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/unsupported`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(404);
    });

    test("should return auth requirements for Bluesky (manual)", async () => {
      if (!apiKey) {
        skip("Bluesky requirements", "TEST_API_KEY not set");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/bluesky`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.authType).toBe("app_password");
      expect(data.requiredFields).toContain("handle");
      expect(data.requiredFields).toContain("appPassword");
    });

    test("should return auth requirements for Telegram (manual)", async () => {
      if (!apiKey) {
        skip("Telegram requirements", "TEST_API_KEY not set");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/telegram`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.authType).toBe("bot_token");
      expect(data.requiredFields).toContain("botToken");
    });

    test("should return OAuth info for Twitter", async () => {
      if (!apiKey) {
        skip("Twitter OAuth info", "TEST_API_KEY not set");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/twitter`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.authType).toBe("oauth");
      expect(data.scopes).toContain("tweet.write");
    });
  });

  describe("POST /api/v1/social-connections/connect/[platform]", () => {
    test("should reject Bluesky OAuth request (must use manual flow)", async () => {
      if (!apiKey) {
        skip("Bluesky OAuth rejection", "TEST_API_KEY not set");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/bluesky`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.authType).toBe("manual");
    });

    test("should require instanceUrl for Mastodon OAuth", async () => {
      if (!apiKey) {
        skip("Mastodon instance requirement", "TEST_API_KEY not set");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/mastodon`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("instanceUrl");
    });
  });

  describe("POST /api/v1/social-connections (manual credentials)", () => {
    test("should reject invalid platform", async () => {
      if (!apiKey) {
        skip("Invalid platform rejection", "TEST_API_KEY not set");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "twitter", // OAuth platform, not manual
          credentials: { accessToken: "fake" },
        }),
      });

      expect(response.status).toBe(400);
    });

    test("should require credentials for Bluesky", async () => {
      if (!apiKey) {
        skip("Bluesky credential requirement", "TEST_API_KEY not set");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "bluesky",
          credentials: {}, // Missing handle and appPassword
        }),
      });

      // Should fail due to missing credentials
      expect(response.status).toBe(400);
    });
  });

  // E2E tests with real credentials
  describe("E2E: Bluesky Connection", () => {
    const handle = process.env.BLUESKY_TEST_HANDLE;
    const appPassword = process.env.BLUESKY_TEST_APP_PASSWORD;

    test("should connect with valid credentials", async () => {
      if (!apiKey || !handle || !appPassword) {
        skip(
          "E2E Bluesky connection",
          "TEST_API_KEY, BLUESKY_TEST_HANDLE, or BLUESKY_TEST_APP_PASSWORD not set"
        );
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "bluesky",
          credentials: { handle, appPassword },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.connection).toBeDefined();
      expect(data.connection.platform).toBe("bluesky");
      expect(data.connection.status).toBe("active");

      // Clean up - disconnect
      if (data.connection?.id) {
        await fetch(`${API_BASE}/api/v1/social-connections/${data.connection.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      }
    });
  });

  describe("E2E: Telegram Bot Connection", () => {
    const botToken = process.env.TELEGRAM_TEST_BOT_TOKEN;

    test("should connect with valid bot token", async () => {
      if (!apiKey || !botToken) {
        skip("E2E Telegram connection", "TEST_API_KEY or TELEGRAM_TEST_BOT_TOKEN not set");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "telegram",
          credentials: { botToken },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.connection).toBeDefined();
      expect(data.connection.platform).toBe("telegram");
      expect(data.connection.status).toBe("active");

      // Clean up - disconnect
      if (data.connection?.id) {
        await fetch(`${API_BASE}/api/v1/social-connections/${data.connection.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      }
    });
  });
});
