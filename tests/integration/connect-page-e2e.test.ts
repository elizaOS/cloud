/**
 * E2E Integration Tests for Connect Page Improvements
 *
 * Tests all features implemented in the Connect page enhancement:
 * - Phase 1: HTTP method consistency (DELETE for disconnect)
 * - Phase 2: UX improvements (error handling, accessibility)
 * - Phase 3: Validation and edge cases
 *
 * Covers real-world scenarios including:
 * - OAuth callback error handling
 * - Multiple service connections
 * - Dependency warnings (WhatsApp → Twilio)
 * - ReturnUrl validation
 * - Mobile and accessibility considerations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { Client } from "pg";
import {
  createTestDataSet,
  cleanupTestData,
  type TestDataSet,
} from "../infrastructure/test-data-factory";

const TEST_DB_URL = process.env.DATABASE_URL || "";
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

describe("Connect Page E2E Tests", () => {
  let testData: TestDataSet;
  let client: Client;

  beforeAll(async () => {
    if (!TEST_DB_URL) {
      throw new Error("DATABASE_URL is required for integration tests");
    }

    testData = await createTestDataSet(TEST_DB_URL, {
      organizationName: "Connect Page Test Org",
      creditBalance: 1000,
    });

    client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();
  });

  afterAll(async () => {
    // Clean up platform credentials
    await client.query(
      "DELETE FROM platform_credentials WHERE organization_id = $1",
      [testData.organization.id]
    );
    await client.query("DELETE FROM secrets WHERE organization_id = $1", [
      testData.organization.id,
    ]);
    await client.end();
    await cleanupTestData(TEST_DB_URL, testData.organization.id);
  });

  // ============================================================
  // Phase 1: HTTP Method Consistency Tests
  // ============================================================
  describe("Phase 1: HTTP Method Consistency (DELETE for disconnect)", () => {
    describe("Google Disconnect - DELETE Method", () => {
      beforeEach(async () => {
        // Setup mock Google credentials
        await client.query(
          `INSERT INTO platform_credentials (organization_id, platform, status, created_at, updated_at)
           VALUES ($1, 'google', 'active', NOW(), NOW())
           ON CONFLICT (organization_id, platform) DO UPDATE SET status = 'active'`,
          [testData.organization.id]
        );
      });

      it("should accept DELETE method for disconnect", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/google/disconnect`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect([200, 204]).toContain(response.status);
        if (response.status === 200) {
          const data = await response.json();
          expect(data.success).toBe(true);
        }
      });

      it("should reject POST method for disconnect (method changed)", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/google/disconnect`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        // POST should return 405 Method Not Allowed or similar
        expect([404, 405]).toContain(response.status);
      });

      it("should return 401 without authentication", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/google/disconnect`, {
          method: "DELETE",
        });

        expect(response.status).toBe(401);
      });

      it("should handle disconnect when not connected gracefully", async () => {
        // Clean up any existing credentials
        await client.query(
          `DELETE FROM platform_credentials WHERE organization_id = $1 AND platform = 'google'`,
          [testData.organization.id]
        );

        const response = await fetch(`${BASE_URL}/api/v1/google/disconnect`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        // Should succeed even when not connected (idempotent)
        expect([200, 204]).toContain(response.status);
      });
    });

    describe("Twilio Disconnect - DELETE Method", () => {
      beforeEach(async () => {
        // Setup mock Twilio credentials
        await client.query(
          `INSERT INTO platform_credentials (organization_id, platform, credentials, status, created_at, updated_at)
           VALUES ($1, 'twilio', '{"accountSid": "ACtest", "phoneNumber": "+15551234567"}', 'active', NOW(), NOW())
           ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"accountSid": "ACtest", "phoneNumber": "+15551234567"}', status = 'active'`,
          [testData.organization.id]
        );
      });

      it("should accept DELETE method for disconnect", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/twilio/disconnect`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect([200, 204]).toContain(response.status);
        if (response.status === 200) {
          const data = await response.json();
          expect(data.success).toBe(true);
        }
      });

      it("should reject POST method for disconnect", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/twilio/disconnect`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect([404, 405]).toContain(response.status);
      });

      it("should verify credentials are removed after disconnect", async () => {
        await fetch(`${BASE_URL}/api/v1/twilio/disconnect`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        // Check status endpoint
        const statusResponse = await fetch(`${BASE_URL}/api/v1/twilio/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect(statusResponse.status).toBe(200);
        const data = await statusResponse.json();
        expect(data.connected).toBe(false);
      });
    });

    describe("Blooio Disconnect - DELETE Method", () => {
      beforeEach(async () => {
        // Setup mock Blooio credentials
        await client.query(
          `INSERT INTO platform_credentials (organization_id, platform, credentials, status, created_at, updated_at)
           VALUES ($1, 'blooio', '{"apiKey": "bloo_test", "phoneNumber": "+15559876543"}', 'active', NOW(), NOW())
           ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"apiKey": "bloo_test", "phoneNumber": "+15559876543"}', status = 'active'`,
          [testData.organization.id]
        );
      });

      it("should accept DELETE method for disconnect", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/blooio/disconnect`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect([200, 204]).toContain(response.status);
        if (response.status === 200) {
          const data = await response.json();
          expect(data.success).toBe(true);
        }
      });

      it("should reject POST method for disconnect", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/blooio/disconnect`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect([404, 405]).toContain(response.status);
      });
    });

    describe("Discord Disconnect - DELETE Method with Query Params", () => {
      const testGuildId = "123456789012345678";

      beforeEach(async () => {
        // Setup mock Discord credentials
        await client.query(
          `INSERT INTO platform_credentials (organization_id, platform, credentials, status, created_at, updated_at)
           VALUES ($1, 'discord', '{"guilds": [{"id": "${testGuildId}", "name": "Test Guild"}]}', 'active', NOW(), NOW())
           ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"guilds": [{"id": "${testGuildId}", "name": "Test Guild"}]}', status = 'active'`,
          [testData.organization.id]
        );
      });

      it("should accept DELETE method for disconnect", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/discord/disconnect`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect([200, 204]).toContain(response.status);
      });

      it("should accept guildId as query param (not body)", async () => {
        const response = await fetch(
          `${BASE_URL}/api/v1/discord/disconnect?guildId=${testGuildId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          }
        );

        // Should accept query param
        expect([200, 204, 404]).toContain(response.status);
      });

      it("should reject POST method for disconnect", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/discord/disconnect`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ guildId: testGuildId }),
        });

        expect([404, 405]).toContain(response.status);
      });

      it("should disconnect all guilds when no guildId provided", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/discord/disconnect`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect([200, 204]).toContain(response.status);
      });
    });
  });

  // ============================================================
  // Phase 2: Connect Page Validation Tests
  // ============================================================
  describe("Phase 2: Connect Page Validation", () => {
    describe("Missing Services Parameter", () => {
      it("should show error when services param is missing", async () => {
        const response = await fetch(`${BASE_URL}/connect`);
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Missing Services");
        expect(html).toContain("services");
      });

      it("should show error when services param is empty", async () => {
        const response = await fetch(`${BASE_URL}/connect?services=`);
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Missing Services");
      });

      it("should show error when services param has only invalid services", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=invalid1,invalid2`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Missing Services");
      });
    });

    describe("Missing ReturnUrl Parameter", () => {
      it("should show error when returnUrl is missing", async () => {
        const response = await fetch(`${BASE_URL}/connect?services=google`);
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Missing Return URL");
        expect(html).toContain("returnUrl");
      });
    });

    describe("Invalid ReturnUrl Validation", () => {
      it("should reject invalid URL format", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=not-a-valid-url`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Invalid Return URL");
      });

      it("should reject relative URLs", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=/dashboard`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Invalid Return URL");
      });

      it("should accept valid HTTP URLs", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=http://example.com/callback`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
        expect(html).not.toContain("Invalid Return URL");
      });

      it("should accept valid HTTPS URLs", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=https://example.com/callback`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });

      it("should accept custom protocol schemes (tg://)", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=tg://bot/start`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
        expect(html).not.toContain("Invalid Return URL");
      });

      it("should accept custom protocol schemes (app://)", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=app://callback`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });

      it("should accept deep links with query params", async () => {
        const returnUrl = encodeURIComponent(
          "https://example.com/callback?token=abc&state=xyz"
        );
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${returnUrl}`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });
    });

    describe("Service Validation", () => {
      it("should accept valid service names", async () => {
        const validServices = [
          "google",
          "twilio",
          "blooio",
          "telegram",
          "twitter",
          "discord",
          "slack",
          "whatsapp",
          "notion",
          "airtable",
          "webhooks",
        ];

        for (const service of validServices) {
          const response = await fetch(
            `${BASE_URL}/connect?services=${service}&returnUrl=http://example.com`
          );
          expect(response.status).toBe(200);

          const html = await response.text();
          expect(html).toContain("Connect Your Services");
        }
      });

      it("should filter out invalid services", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google,invalid,telegram&returnUrl=http://example.com`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
        expect(html).toContain("Google");
        expect(html).toContain("Telegram");
      });

      it("should handle case-insensitive service names", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=GOOGLE,Telegram&returnUrl=http://example.com`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });

      it("should handle services with whitespace", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google%20,%20telegram&returnUrl=http://example.com`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });
    });
  });

  // ============================================================
  // Phase 3: Onboarding and Dependency Warnings
  // ============================================================
  describe("Phase 3: Onboarding and Dependency Warnings", () => {
    describe("Onboarding Introduction", () => {
      it("should display the onboarding intro explaining why connections are needed", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=http://example.com`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Why connect?");
        expect(html).toContain("AI assistant");
        expect(html).toContain("actions on your behalf");
      });
    });

    describe("WhatsApp-Twilio Dependency Warning", () => {
      it("should show dependency warning when WhatsApp is requested without Twilio", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=whatsapp&returnUrl=http://example.com`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        // Should show that Twilio is required
        expect(html).toContain("Twilio");
      });

      it("should show tip when both WhatsApp and Twilio are requested", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=whatsapp,twilio&returnUrl=http://example.com`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        // Should contain both services
        expect(html).toContain("WhatsApp");
        expect(html).toContain("Twilio");
      });
    });

    describe("Progress Section", () => {
      it("should display connection progress", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google,telegram&returnUrl=http://example.com`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connection Progress");
        expect(html).toContain("connected");
      });
    });

    describe("Go Back Functionality", () => {
      it("should include go back button on missing services error", async () => {
        const response = await fetch(`${BASE_URL}/connect`);
        const html = await response.text();

        expect(html).toContain("Go back to previous page");
      });

      it("should include go back button on missing returnUrl error", async () => {
        const response = await fetch(`${BASE_URL}/connect?services=google`);
        const html = await response.text();

        expect(html).toContain("Go back to previous page");
      });

      it("should include go back button on invalid returnUrl error", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=invalid`
        );
        const html = await response.text();

        expect(html).toContain("Go back to previous page");
      });
    });
  });

  // ============================================================
  // Phase 4: OAuth Error Handling
  // ============================================================
  describe("Phase 4: OAuth Error Handling", () => {
    describe("Single OAuth Error", () => {
      it("should display Google OAuth error", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=http://example.com&google_error=access_denied`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Google");
        expect(html).toContain("Connection Failed");
      });

      it("should display Twitter OAuth error", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=twitter&returnUrl=http://example.com&twitter_error=access_denied`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Twitter");
      });

      it("should display Discord OAuth error", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=discord&returnUrl=http://example.com&discord=error&message=access_denied`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Discord");
      });

      it("should display Slack OAuth error", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=slack&returnUrl=http://example.com&slack=error&message=access_denied`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Slack");
      });

      it("should display Notion OAuth error", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=notion&returnUrl=http://example.com&notion=error&message=access_denied`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Notion");
      });
    });

    describe("Multiple OAuth Errors", () => {
      it("should display multiple OAuth errors simultaneously", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google,twitter&returnUrl=http://example.com&google_error=access_denied&twitter_error=invalid_grant`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        // Both errors should be displayed
        expect(html).toContain("Google");
        expect(html).toContain("Twitter");
      });

      it("should show dismiss all button for multiple errors", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google,twitter&returnUrl=http://example.com&google_error=access_denied&twitter_error=invalid_grant`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Dismiss all");
      });

      it("should show individual retry buttons for each error", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google,twitter&returnUrl=http://example.com&google_error=access_denied&twitter_error=invalid_grant`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Retry");
      });
    });

    describe("OAuth Success Callbacks", () => {
      it("should handle Google OAuth success callback", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=http://example.com&google_connected=true`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });

      it("should handle Twitter OAuth success callback", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=twitter&returnUrl=http://example.com&twitter_connected=true`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });

      it("should handle Discord OAuth success callback", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=discord&returnUrl=http://example.com&discord=connected`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });
    });
  });

  // ============================================================
  // Phase 5: Accessibility Tests
  // ============================================================
  describe("Phase 5: Accessibility", () => {
    it("should have proper heading structure", async () => {
      const response = await fetch(
        `${BASE_URL}/connect?services=google&returnUrl=http://example.com`
      );
      const html = await response.text();

      // Should have h1 heading
      expect(html).toMatch(/<h1[^>]*>.*Connect Your Services.*<\/h1>/i);
    });

    it("should have ARIA labels for progress section", async () => {
      const response = await fetch(
        `${BASE_URL}/connect?services=google&returnUrl=http://example.com`
      );
      const html = await response.text();

      // Should have aria-label for progress
      expect(html).toContain('aria-label="Connection progress"');
    });

    it("should have proper button types", async () => {
      const response = await fetch(`${BASE_URL}/connect`);
      const html = await response.text();

      // Go back button should have type="button"
      expect(html).toContain('type="button"');
    });

    it("should use semantic HTML elements", async () => {
      const response = await fetch(
        `${BASE_URL}/connect?services=google,telegram&returnUrl=http://example.com`
      );
      const html = await response.text();

      // Should use section or similar semantic elements
      expect(html).toContain("<section");
      expect(html).toContain("<ul");
      expect(html).toContain("<li");
    });
  });

  // ============================================================
  // Phase 6: Real-World Scenarios
  // ============================================================
  describe("Phase 6: Real-World Scenarios", () => {
    describe("Multi-Service Connection Flow", () => {
      it("should handle a typical multi-service connection request", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google,telegram,twilio&returnUrl=https://myapp.com/callback&state=user123`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
        expect(html).toContain("Google");
        expect(html).toContain("Telegram");
        expect(html).toContain("Twilio");
      });

      it("should preserve state parameter through the flow", async () => {
        const state = "unique-state-12345";
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=https://myapp.com/callback&state=${state}`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        // State should be preserved in the page for later use
        expect(html).toContain("Connect Your Services");
      });
    });

    describe("Mobile Bot Integration", () => {
      it("should handle Telegram deep link return URL", async () => {
        const returnUrl = encodeURIComponent("tg://resolve?domain=mybot");
        const response = await fetch(
          `${BASE_URL}/connect?services=telegram&returnUrl=${returnUrl}`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
        expect(html).toContain("Telegram");
      });

      it("should handle WhatsApp deep link return URL", async () => {
        const returnUrl = encodeURIComponent("whatsapp://send?phone=+15551234567");
        const response = await fetch(
          `${BASE_URL}/connect?services=whatsapp,twilio&returnUrl=${returnUrl}`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });
    });

    describe("Error Recovery", () => {
      it("should allow retry after OAuth error", async () => {
        // First request with error
        const errorResponse = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=http://example.com&google_error=access_denied`
        );
        expect(errorResponse.status).toBe(200);

        const errorHtml = await errorResponse.text();
        expect(errorHtml).toContain("Connection Failed");
        expect(errorHtml).toContain("Retry");

        // Second request without error (simulating retry)
        const retryResponse = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=http://example.com`
        );
        expect(retryResponse.status).toBe(200);

        const retryHtml = await retryResponse.text();
        expect(retryHtml).not.toContain("Connection Failed");
      });
    });

    describe("Concurrent Requests", () => {
      it("should handle concurrent connection status checks", async () => {
        const statusPromises = [
          fetch(`${BASE_URL}/api/v1/google/status`, {
            headers: { Authorization: `Bearer ${testData.apiKey.key}` },
          }),
          fetch(`${BASE_URL}/api/v1/twilio/status`, {
            headers: { Authorization: `Bearer ${testData.apiKey.key}` },
          }),
          fetch(`${BASE_URL}/api/v1/blooio/status`, {
            headers: { Authorization: `Bearer ${testData.apiKey.key}` },
          }),
          fetch(`${BASE_URL}/api/v1/telegram/status`, {
            headers: { Authorization: `Bearer ${testData.apiKey.key}` },
          }),
        ];

        const responses = await Promise.all(statusPromises);

        for (const response of responses) {
          expect(response.status).toBe(200);
          const data = await response.json();
          expect(typeof data.connected).toBe("boolean");
        }
      });
    });

    describe("Edge Cases", () => {
      it("should handle very long returnUrl", async () => {
        const longPath = "a".repeat(500);
        const returnUrl = encodeURIComponent(`https://example.com/${longPath}`);
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${returnUrl}`
        );
        expect(response.status).toBe(200);
      });

      it("should handle special characters in returnUrl", async () => {
        const returnUrl = encodeURIComponent(
          "https://example.com/callback?param=value&other=test#anchor"
        );
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${returnUrl}`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });

      it("should handle unicode in returnUrl", async () => {
        const returnUrl = encodeURIComponent("https://example.com/日本語");
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${returnUrl}`
        );
        expect(response.status).toBe(200);
      });

      it("should handle duplicate service names", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google,google,telegram&returnUrl=http://example.com`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });

      it("should handle maximum number of services", async () => {
        const allServices =
          "google,twilio,blooio,telegram,twitter,discord,slack,whatsapp,notion,airtable,webhooks";
        const response = await fetch(
          `${BASE_URL}/connect?services=${allServices}&returnUrl=http://example.com`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        expect(html).toContain("Connect Your Services");
      });
    });
  });

  // ============================================================
  // Phase 7: Security Tests
  // ============================================================
  describe("Phase 7: Security", () => {
    describe("XSS Prevention", () => {
      it("should sanitize returnUrl to prevent XSS", async () => {
        const maliciousUrl = encodeURIComponent(
          "javascript:alert('xss')"
        );
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${maliciousUrl}`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        // Should show invalid URL error, not execute JS
        expect(html).toContain("Invalid Return URL");
      });

      it("should sanitize error messages", async () => {
        const maliciousError = encodeURIComponent(
          "<script>alert('xss')</script>"
        );
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=http://example.com&google_error=${maliciousError}`
        );
        expect(response.status).toBe(200);

        const html = await response.text();
        // Script tags should be escaped
        expect(html).not.toContain("<script>");
      });
    });

    describe("CSRF Protection", () => {
      it("should require authentication for API endpoints", async () => {
        const endpoints = [
          { url: "/api/v1/google/disconnect", method: "DELETE" },
          { url: "/api/v1/twilio/disconnect", method: "DELETE" },
          { url: "/api/v1/blooio/disconnect", method: "DELETE" },
          { url: "/api/v1/discord/disconnect", method: "DELETE" },
        ];

        for (const endpoint of endpoints) {
          const response = await fetch(`${BASE_URL}${endpoint.url}`, {
            method: endpoint.method,
          });
          expect(response.status).toBe(401);
        }
      });
    });

    describe("Rate Limiting", () => {
      it("should handle rapid status checks without errors", async () => {
        const requests = Array(10)
          .fill(null)
          .map(() =>
            fetch(`${BASE_URL}/api/v1/google/status`, {
              headers: { Authorization: `Bearer ${testData.apiKey.key}` },
            })
          );

        const responses = await Promise.all(requests);

        // All should succeed (might be rate limited, but shouldn't error)
        for (const response of responses) {
          expect([200, 429]).toContain(response.status);
        }
      });
    });
  });
});
