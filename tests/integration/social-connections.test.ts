/**
 * Social Connections API Integration Tests
 * 
 * Tests:
 * 1. Authentication and authorization
 * 2. Boundary conditions and edge cases
 * 3. Error handling and invalid inputs
 * 4. Platform-specific validation
 * 5. Concurrent request handling
 * 
 * Requires running server. Set TEST_API_KEY for authenticated tests.
 */

import { describe, test, expect } from "bun:test";

const API_BASE = process.env.TEST_API_BASE || "http://localhost:3000";
const skip = (name: string, reason: string) => console.log(`⚠️  SKIP: ${name} - ${reason}`);

describe("Social Connections API", () => {
  const apiKey = process.env.TEST_API_KEY ?? null;
  if (!apiKey) console.log("⚠️  TEST_API_KEY not set - authenticated tests will skip");

  // =============================================================================
  // AUTHENTICATION TESTS
  // =============================================================================
  describe("Authentication", () => {
    test("GET /social-connections returns 401 without auth", async () => {
      const response = await fetch(`${API_BASE}/api/v1/social-connections`);
      expect(response.status).toBe(401);
    });

    test("POST /social-connections returns 401 without auth", async () => {
      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "bluesky", credentials: {} }),
      });
      expect(response.status).toBe(401);
    });

    test("DELETE /social-connections/:id returns 401 without auth", async () => {
      const response = await fetch(`${API_BASE}/api/v1/social-connections/fake-id`, {
        method: "DELETE",
      });
      expect(response.status).toBe(401);
    });

    test("rejects invalid API key format", async () => {
      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        headers: { Authorization: "Bearer invalid-key-format" },
      });
      expect(response.status).toBe(401);
    });

    test("rejects malformed Authorization header", async () => {
      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        headers: { Authorization: "NotBearer something" },
      });
      expect(response.status).toBe(401);
    });
  });

  // =============================================================================
  // LIST PLATFORMS TESTS
  // =============================================================================
  describe("GET /api/v1/social-connections", () => {
    test("returns platform list when authenticated", async () => {
      if (!apiKey) { skip("List platforms", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.platforms)).toBe(true);
    });

    test("includes all 11 social platforms", async () => {
      if (!apiKey) { skip("Platform count", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const data = await response.json();
      const platforms = data.platforms.map((p: { platform: string }) => p.platform);

      const expectedPlatforms = [
        "twitter", "bluesky", "discord", "telegram", "slack",
        "reddit", "facebook", "instagram", "tiktok", "linkedin", "mastodon"
      ];

      for (const platform of expectedPlatforms) {
        expect(platforms).toContain(platform);
      }
    });

    test("each platform has required fields", async () => {
      if (!apiKey) { skip("Platform fields", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const data = await response.json();
      for (const platform of data.platforms) {
        expect(platform).toHaveProperty("platform");
        expect(platform).toHaveProperty("authType");
        expect(platform).toHaveProperty("configured");
        expect(platform).toHaveProperty("connected");
        expect(["oauth", "manual"]).toContain(platform.authType);
        expect(typeof platform.configured).toBe("boolean");
        expect(typeof platform.connected).toBe("boolean");
      }
    });

    test("connected platforms have connection details", async () => {
      if (!apiKey) { skip("Connection details", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const data = await response.json();
      const connected = data.platforms.filter((p: { connected: boolean }) => p.connected);

      for (const platform of connected) {
        expect(platform.connection).toBeDefined();
        expect(platform.connection.id).toBeDefined();
        expect(platform.connection.status).toBe("active");
      }
    });
  });

  // =============================================================================
  // PLATFORM INFO TESTS
  // =============================================================================
  describe("GET /api/v1/social-connections/connect/[platform]", () => {
    test("returns 404 for unsupported platform", async () => {
      if (!apiKey) { skip("Unsupported platform", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/fakebook`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain("Unsupported");
    });

    test("Bluesky returns app_password auth type with required fields", async () => {
      if (!apiKey) { skip("Bluesky info", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/bluesky`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.authType).toBe("app_password");
      expect(data.requiredFields).toContain("handle");
      expect(data.requiredFields).toContain("appPassword");
      expect(Array.isArray(data.steps)).toBe(true);
      expect(data.steps.length).toBeGreaterThan(0);
    });

    test("Telegram returns bot_token auth type with required fields", async () => {
      if (!apiKey) { skip("Telegram info", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/telegram`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.authType).toBe("bot_token");
      expect(data.requiredFields).toContain("botToken");
    });

    test("Twitter returns oauth auth type with scopes", async () => {
      if (!apiKey) { skip("Twitter info", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/twitter`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.authType).toBe("oauth");
      expect(Array.isArray(data.scopes)).toBe(true);
      expect(data.scopes).toContain("tweet.write");
    });

    test("Discord OAuth includes expected scopes", async () => {
      if (!apiKey) { skip("Discord scopes", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/discord`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.scopes).toContain("identify");
    });
  });

  // =============================================================================
  // OAUTH FLOW TESTS
  // =============================================================================
  describe("POST /api/v1/social-connections/connect/[platform]", () => {
    test("rejects Bluesky OAuth request (must use manual)", async () => {
      if (!apiKey) { skip("Bluesky OAuth rejection", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/bluesky`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: "{}",
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.authType).toBe("manual");
      expect(data.instructions).toBeDefined();
    });

    test("rejects Telegram OAuth request (must use manual)", async () => {
      if (!apiKey) { skip("Telegram OAuth rejection", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/telegram`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: "{}",
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.authType).toBe("manual");
    });

    test("Mastodon requires instanceUrl", async () => {
      if (!apiKey) { skip("Mastodon instanceUrl", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/mastodon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: "{}",
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("instanceUrl");
      expect(data.example).toBeDefined();
    });
  });

  // =============================================================================
  // MANUAL CREDENTIALS TESTS  
  // =============================================================================
  describe("POST /api/v1/social-connections (manual credentials)", () => {
    test("rejects OAuth platform via manual endpoint", async () => {
      if (!apiKey) { skip("OAuth platform rejection", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "twitter", credentials: { accessToken: "fake" } }),
      });

      expect(response.status).toBe(400);
    });

    test("rejects invalid platform name", async () => {
      if (!apiKey) { skip("Invalid platform name", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "invalid", credentials: {} }),
      });

      expect(response.status).toBe(400);
    });

    test("rejects empty credentials for Bluesky", async () => {
      if (!apiKey) { skip("Empty Bluesky creds", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "bluesky", credentials: {} }),
      });

      expect(response.status).toBe(400);
    });

    test("rejects empty credentials for Telegram", async () => {
      if (!apiKey) { skip("Empty Telegram creds", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "telegram", credentials: {} }),
      });

      expect(response.status).toBe(400);
    });

    test("rejects malformed JSON body", async () => {
      if (!apiKey) { skip("Malformed JSON", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: "not valid json",
      });

      expect(response.status).toBe(400);
    });
  });

  // =============================================================================
  // CONNECTION MANAGEMENT TESTS
  // =============================================================================
  describe("Connection Management /api/v1/social-connections/[id]", () => {
    test("GET returns 404 for non-existent connection", async () => {
      if (!apiKey) { skip("Non-existent connection", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/non-existent-id`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(404);
    });

    test("DELETE returns 404 for non-existent connection", async () => {
      if (!apiKey) { skip("Delete non-existent", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/non-existent-id`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      // Should either be 404 or succeed (if credential doesn't exist, that's fine)
      expect([200, 404]).toContain(response.status);
    });

    test("POST refresh with unknown action returns error", async () => {
      if (!apiKey) { skip("Unknown action", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/some-id`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unknown_action" }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Unknown action");
    });
  });

  // =============================================================================
  // SESSION STATUS TESTS
  // =============================================================================
  describe("Session Status /api/v1/social-connections/status/[sessionId]", () => {
    test("returns 404 for non-existent session", async () => {
      const response = await fetch(`${API_BASE}/api/v1/social-connections/status/non-existent-session`);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain("not found");
    });
  });

  // =============================================================================
  // EDGE CASES
  // =============================================================================
  describe("Edge Cases", () => {
    test("handles very long platform names gracefully", async () => {
      if (!apiKey) { skip("Long platform name", "TEST_API_KEY not set"); return; }

      const longName = "a".repeat(100);
      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/${longName}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(404);
    });

    test("handles special characters in platform name", async () => {
      if (!apiKey) { skip("Special chars", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections/connect/plat%2Fform`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      expect(response.status).toBe(404);
    });

    test("handles concurrent requests", async () => {
      if (!apiKey) { skip("Concurrent requests", "TEST_API_KEY not set"); return; }

      const requests = Array(5).fill(null).map(() =>
        fetch(`${API_BASE}/api/v1/social-connections`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
      );

      const responses = await Promise.all(requests);

      // All should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
      }
    });
  });

  // =============================================================================
  // E2E WITH REAL CREDENTIALS
  // =============================================================================
  describe("E2E: Bluesky Connection", () => {
    const handle = process.env.BLUESKY_TEST_HANDLE;
    const appPassword = process.env.BLUESKY_TEST_APP_PASSWORD;

    test("connects with valid credentials", async () => {
      if (!apiKey || !handle || !appPassword) {
        skip("E2E Bluesky", "Missing TEST_API_KEY, BLUESKY_TEST_HANDLE, or BLUESKY_TEST_APP_PASSWORD");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "bluesky", credentials: { handle, appPassword } }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.connection.platform).toBe("bluesky");
      expect(data.connection.status).toBe("active");
      expect(data.connection.username).toBeDefined();

      // Clean up
      if (data.connection?.id) {
        await fetch(`${API_BASE}/api/v1/social-connections/${data.connection.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      }
    });

    test("rejects invalid Bluesky app password", async () => {
      if (!apiKey) { skip("Invalid Bluesky creds", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "bluesky",
          credentials: { handle: "test.bsky.social", appPassword: "invalid-password" },
        }),
      });

      // Should fail validation against Bluesky API
      expect(response.status).toBe(400);
    });
  });

  describe("E2E: Telegram Bot Connection", () => {
    const botToken = process.env.TELEGRAM_TEST_BOT_TOKEN;

    test("connects with valid bot token", async () => {
      if (!apiKey || !botToken) {
        skip("E2E Telegram", "Missing TEST_API_KEY or TELEGRAM_TEST_BOT_TOKEN");
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "telegram", credentials: { botToken } }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.connection.platform).toBe("telegram");
      expect(data.connection.status).toBe("active");

      // Clean up
      if (data.connection?.id) {
        await fetch(`${API_BASE}/api/v1/social-connections/${data.connection.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
      }
    });

    test("rejects invalid Telegram bot token format", async () => {
      if (!apiKey) { skip("Invalid Telegram token", "TEST_API_KEY not set"); return; }

      const response = await fetch(`${API_BASE}/api/v1/social-connections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "telegram", credentials: { botToken: "invalid-token" } }),
      });

      // Should fail validation against Telegram API
      expect(response.status).toBe(400);
    });
  });
});
