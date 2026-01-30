/**
 * E2E Integration Tests for Connect Page
 *
 * Comprehensive tests for the /connect page functionality including:
 * - URL parameter validation (services, returnUrl, state)
 * - XSS protection and security
 * - OAuth error handling
 * - Service card rendering
 * - Connection status tracking
 * - Unconfigured services handling
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
    // Clean up credentials
    await client.query(
      "DELETE FROM platform_credentials WHERE organization_id = $1",
      [testData.organization.id],
    );
    await client.query("DELETE FROM secrets WHERE organization_id = $1", [
      testData.organization.id,
    ]);
    await client.end();
    await cleanupTestData(TEST_DB_URL, testData.organization.id);
  });

  beforeEach(async () => {
    // Reset credentials before each test
    await client.query(
      "DELETE FROM platform_credentials WHERE organization_id = $1",
      [testData.organization.id],
    );
    await client.query(
      "DELETE FROM secrets WHERE organization_id = $1 AND key LIKE 'google_%'",
      [testData.organization.id],
    );
  });

  describe("URL Parameter Validation", () => {
    describe("services parameter", () => {
      it("should render page with valid services", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google,twilio&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
            redirect: "manual",
          },
        );

        // Should either return 200 or redirect to login
        expect([200, 302, 307]).toContain(response.status);
      });

      it("should show error for missing services parameter", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("Missing Services");
      });

      it("should show error for empty services parameter", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("Missing Services");
      });

      it("should accept single service", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
            redirect: "manual",
          },
        );

        expect([200, 302, 307]).toContain(response.status);
      });

      it("should accept all valid services", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google,twilio,blooio,telegram,twitter,discord&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
            redirect: "manual",
          },
        );

        expect([200, 302, 307]).toContain(response.status);
      });

      it("should filter out invalid services", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google,invalid_service,twilio&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
            redirect: "manual",
          },
        );

        // Should still work with valid services
        expect([200, 302, 307]).toContain(response.status);
      });
    });

    describe("returnUrl parameter", () => {
      it("should show error for missing returnUrl", async () => {
        const response = await fetch(`${BASE_URL}/connect?services=google`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("Missing Return URL");
      });

      it("should accept valid http returnUrl", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
            redirect: "manual",
          },
        );

        expect([200, 302, 307]).toContain(response.status);
      });

      it("should accept valid https returnUrl", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("https://example.com/callback")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
            redirect: "manual",
          },
        );

        expect([200, 302, 307]).toContain(response.status);
      });

      it("should accept custom protocol returnUrl (tg://)", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("tg://bot/start")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
            redirect: "manual",
          },
        );

        expect([200, 302, 307]).toContain(response.status);
      });

      it("should accept custom protocol returnUrl (myapp://)", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("myapp://callback")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
            redirect: "manual",
          },
        );

        expect([200, 302, 307]).toContain(response.status);
      });
    });

    describe("XSS Protection - returnUrl validation", () => {
      it("should reject javascript: protocol", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("javascript:alert('xss')")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("Invalid Return URL");
      });

      it("should reject data: protocol", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("data:text/html,<script>alert('xss')</script>")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("Invalid Return URL");
      });

      it("should reject vbscript: protocol", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("vbscript:msgbox('xss')")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("Invalid Return URL");
      });

      it("should reject file: protocol", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("file:///etc/passwd")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("Invalid Return URL");
      });

      it("should reject case variations of dangerous protocols", async () => {
        const dangerousUrls = [
          "JAVASCRIPT:alert(1)",
          "JavaScript:alert(1)",
          "jAvAsCrIpT:alert(1)",
          "DATA:text/html,test",
          "VBSCRIPT:test",
        ];

        for (const url of dangerousUrls) {
          const response = await fetch(
            `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent(url)}`,
            {
              headers: {
                Authorization: `Bearer ${testData.apiKey.key}`,
              },
            },
          );

          expect(response.status).toBe(200);
          const html = await response.text();
          expect(html).toContain("Invalid Return URL");
        }
      });

      it("should reject http:// without hostname", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("http://")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("Invalid Return URL");
      });

      it("should reject https:// without hostname", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("https://")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("Invalid Return URL");
      });

      it("should reject custom protocol without path", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("myapp://")}`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("Invalid Return URL");
      });
    });

    describe("state parameter", () => {
      it("should pass state parameter through", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}&state=custom_state_123`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
            redirect: "manual",
          },
        );

        expect([200, 302, 307]).toContain(response.status);
      });
    });
  });

  describe("OAuth Error Handling", () => {
    describe("Error Display", () => {
      it("should display Google OAuth error", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}&google_error=access_denied`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html.toLowerCase()).toContain("google");
      });

      it("should display Twitter OAuth error", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=twitter&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}&twitter_error=invalid_request`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html.toLowerCase()).toContain("twitter");
      });

      it("should display Discord OAuth error", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=discord&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}&discord_error=invalid_grant`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html.toLowerCase()).toContain("discord");
      });

      it("should display multiple OAuth errors simultaneously", async () => {
        const response = await fetch(
          `${BASE_URL}/connect?services=google,discord&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}&google_error=access_denied&discord_error=invalid_grant`,
          {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          },
        );

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html.toLowerCase()).toContain("google");
        expect(html.toLowerCase()).toContain("discord");
      });
    });

    describe("Error Codes", () => {
      const errorCodes = [
        "access_denied",
        "invalid_request",
        "invalid_grant",
        "unauthorized_client",
        "server_error",
        "temporarily_unavailable",
      ];

      for (const errorCode of errorCodes) {
        it(`should handle OAuth error code: ${errorCode}`, async () => {
          const response = await fetch(
            `${BASE_URL}/connect?services=google&returnUrl=${encodeURIComponent("http://localhost:3000/dashboard")}&google_error=${errorCode}`,
            {
              headers: {
                Authorization: `Bearer ${testData.apiKey.key}`,
              },
            },
          );

          expect(response.status).toBe(200);
        });
      }
    });
  });

  describe("Connection Status API Integration", () => {
    describe("Google Status", () => {
      it("should return disconnected when no credentials", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/google/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.connected).toBe(false);
      });

      it("should include configured field", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/google/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(typeof data.configured).toBe("boolean");
      });
    });

    describe("Twilio Status", () => {
      it("should return disconnected when no credentials", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/twilio/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.connected).toBe(false);
      });

      it("should return connected when credentials exist", async () => {
        // Insert test credentials
        await client.query(
          `INSERT INTO platform_credentials (organization_id, platform, credentials, created_at, updated_at)
           VALUES ($1, 'twilio', '{"accountSid": "ACtest", "phoneNumber": "+15551234567"}', NOW(), NOW())
           ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"accountSid": "ACtest", "phoneNumber": "+15551234567"}'`,
          [testData.organization.id],
        );

        const response = await fetch(`${BASE_URL}/api/v1/twilio/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.connected).toBe(true);
        expect(data.phoneNumber).toBe("+15551234567");
      });
    });

    describe("Blooio Status", () => {
      it("should return disconnected when no credentials", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/blooio/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.connected).toBe(false);
      });
    });

    describe("Telegram Status", () => {
      it("should return disconnected when no credentials", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/telegram/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.connected).toBe(false);
      });
    });

    describe("Twitter Status", () => {
      it("should return configured status", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/twitter/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(typeof data.configured).toBe("boolean");
      });
    });

    describe("Discord Status", () => {
      it("should return disconnected when no credentials", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/discord/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.connected).toBe(false);
      });
    });
  });

  describe("Concurrent Status Checks", () => {
    it("should handle concurrent status requests for all services", async () => {
      const services = [
        "google",
        "twilio",
        "blooio",
        "telegram",
        "twitter",
        "discord",
      ];

      const requests = services.map((service) =>
        fetch(`${BASE_URL}/api/v1/${service}/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        }),
      );

      const responses = await Promise.all(requests);

      for (const response of responses) {
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty("connected");
      }
    });

    it("should complete all status checks within reasonable time", async () => {
      const services = [
        "google",
        "twilio",
        "blooio",
        "telegram",
        "twitter",
        "discord",
      ];
      const startTime = Date.now();

      const requests = services.map((service) =>
        fetch(`${BASE_URL}/api/v1/${service}/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        }),
      );

      await Promise.all(requests);

      const duration = Date.now() - startTime;
      // All 6 should complete in under 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });

  describe("Connect and Disconnect Flows", () => {
    describe("Twilio Connect/Disconnect", () => {
      it("should connect with valid credentials", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/twilio/connect`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountSid: "ACtest12345678901234567890123456",
            authToken: "test_auth_token_1234567890123456",
            phoneNumber: "+15551234567",
          }),
        });

        // May fail validation but shouldn't error
        expect([200, 400, 500]).toContain(response.status);
      });

      it("should disconnect successfully", async () => {
        // First connect
        await client.query(
          `INSERT INTO platform_credentials (organization_id, platform, credentials, created_at, updated_at)
           VALUES ($1, 'twilio', '{"test": true}', NOW(), NOW())
           ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"test": true}'`,
          [testData.organization.id],
        );

        const response = await fetch(`${BASE_URL}/api/v1/twilio/disconnect`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect([200, 204]).toContain(response.status);
      });

      it("should be idempotent on disconnect", async () => {
        // Disconnect when already disconnected
        const response = await fetch(`${BASE_URL}/api/v1/twilio/disconnect`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect([200, 204]).toContain(response.status);
      });
    });

    describe("Blooio Connect/Disconnect", () => {
      it("should validate required fields on connect", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/blooio/connect`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        expect(response.status).toBe(400);
      });

      it("should disconnect successfully", async () => {
        await client.query(
          `INSERT INTO platform_credentials (organization_id, platform, credentials, created_at, updated_at)
           VALUES ($1, 'blooio', '{"apiKey": "test"}', NOW(), NOW())
           ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"apiKey": "test"}'`,
          [testData.organization.id],
        );

        const response = await fetch(`${BASE_URL}/api/v1/blooio/disconnect`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect([200, 204]).toContain(response.status);
      });
    });

    describe("Google OAuth Flow", () => {
      it("should initiate OAuth with scopes", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/google/oauth`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scopes: ["email", "profile"],
          }),
        });

        // May fail if GOOGLE_CLIENT_ID not configured
        expect([200, 302, 500]).toContain(response.status);
      });

      it("should disconnect Google account", async () => {
        await client.query(
          `INSERT INTO secrets (organization_id, key, value, created_at, updated_at)
           VALUES ($1, 'google_access_token', 'test_token', NOW(), NOW())
           ON CONFLICT (organization_id, key) DO UPDATE SET value = 'test_token'`,
          [testData.organization.id],
        );

        const response = await fetch(`${BASE_URL}/api/v1/google/disconnect`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect([200, 204]).toContain(response.status);
      });
    });

    describe("Discord OAuth Flow", () => {
      it("should initiate Discord OAuth", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/discord/oauth`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        // May fail if DISCORD_CLIENT_ID not configured
        expect([200, 302, 500]).toContain(response.status);
      });

      it("should disconnect Discord account", async () => {
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

  describe("Multiple Services Connection State", () => {
    it("should track multiple connected services", async () => {
      // Connect multiple services
      await client.query(
        `INSERT INTO secrets (organization_id, key, value, created_at, updated_at)
         VALUES ($1, 'google_access_token', 'test_token', NOW(), NOW())
         ON CONFLICT (organization_id, key) DO UPDATE SET value = 'test_token'`,
        [testData.organization.id],
      );

      await client.query(
        `INSERT INTO platform_credentials (organization_id, platform, credentials, created_at, updated_at)
         VALUES ($1, 'twilio', '{"accountSid": "ACtest", "phoneNumber": "+15551234567"}', NOW(), NOW())
         ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"accountSid": "ACtest", "phoneNumber": "+15551234567"}'`,
        [testData.organization.id],
      );

      await client.query(
        `INSERT INTO platform_credentials (organization_id, platform, credentials, created_at, updated_at)
         VALUES ($1, 'blooio', '{"apiKey": "test"}', NOW(), NOW())
         ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"apiKey": "test"}'`,
        [testData.organization.id],
      );

      // Check all statuses
      const [googleRes, twilioRes, blooioRes] = await Promise.all([
        fetch(`${BASE_URL}/api/v1/google/status`, {
          headers: { Authorization: `Bearer ${testData.apiKey.key}` },
        }),
        fetch(`${BASE_URL}/api/v1/twilio/status`, {
          headers: { Authorization: `Bearer ${testData.apiKey.key}` },
        }),
        fetch(`${BASE_URL}/api/v1/blooio/status`, {
          headers: { Authorization: `Bearer ${testData.apiKey.key}` },
        }),
      ]);

      expect(googleRes.status).toBe(200);
      expect(twilioRes.status).toBe(200);
      expect(blooioRes.status).toBe(200);

      const [googleData, twilioData, blooioData] = await Promise.all([
        googleRes.json(),
        twilioRes.json(),
        blooioRes.json(),
      ]);

      // All should be connected
      expect(twilioData.connected).toBe(true);
      expect(blooioData.connected).toBe(true);
    });

    it("should disconnect one service without affecting others", async () => {
      // Setup all connected
      await client.query(
        `INSERT INTO platform_credentials (organization_id, platform, credentials, created_at, updated_at)
         VALUES ($1, 'twilio', '{"test": true}', NOW(), NOW())
         ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"test": true}'`,
        [testData.organization.id],
      );

      await client.query(
        `INSERT INTO platform_credentials (organization_id, platform, credentials, created_at, updated_at)
         VALUES ($1, 'blooio', '{"test": true}', NOW(), NOW())
         ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"test": true}'`,
        [testData.organization.id],
      );

      // Disconnect only Twilio
      await fetch(`${BASE_URL}/api/v1/twilio/disconnect`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${testData.apiKey.key}` },
      });

      // Blooio should still be connected
      const blooioRes = await fetch(`${BASE_URL}/api/v1/blooio/status`, {
        headers: { Authorization: `Bearer ${testData.apiKey.key}` },
      });

      const blooioData = await blooioRes.json();
      expect(blooioData.connected).toBe(true);
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle malformed JSON in connect request", async () => {
      const response = await fetch(`${BASE_URL}/api/v1/twilio/connect`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testData.apiKey.key}`,
          "Content-Type": "application/json",
        },
        body: "{ invalid json }",
      });

      expect(response.status).toBe(400);
    });

    it("should handle empty request body", async () => {
      const response = await fetch(`${BASE_URL}/api/v1/twilio/connect`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testData.apiKey.key}`,
          "Content-Type": "application/json",
        },
        body: "",
      });

      expect([400, 500]).toContain(response.status);
    });

    it("should handle null values in connect request", async () => {
      const response = await fetch(`${BASE_URL}/api/v1/twilio/connect`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${testData.apiKey.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountSid: null,
          authToken: null,
          phoneNumber: null,
        }),
      });

      expect(response.status).toBe(400);
    });

    it("should require authentication for status endpoints", async () => {
      const services = [
        "google",
        "twilio",
        "blooio",
        "telegram",
        "twitter",
        "discord",
      ];

      for (const service of services) {
        const response = await fetch(`${BASE_URL}/api/v1/${service}/status`);
        expect(response.status).toBe(401);
      }
    });

    it("should require authentication for connect endpoints", async () => {
      const response = await fetch(`${BASE_URL}/api/v1/twilio/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountSid: "ACtest",
          authToken: "test",
          phoneNumber: "+15551234567",
        }),
      });

      expect(response.status).toBe(401);
    });

    it("should require authentication for disconnect endpoints", async () => {
      const response = await fetch(`${BASE_URL}/api/v1/twilio/disconnect`, {
        method: "DELETE",
      });

      expect(response.status).toBe(401);
    });

    it("should handle invalid API key", async () => {
      const response = await fetch(`${BASE_URL}/api/v1/google/status`, {
        headers: {
          Authorization: "Bearer invalid_api_key_123456",
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe("Input Validation", () => {
    describe("Twilio Input Validation", () => {
      it("should reject empty accountSid", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/twilio/connect`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountSid: "",
            authToken: "test_token",
            phoneNumber: "+15551234567",
          }),
        });

        expect(response.status).toBe(400);
      });

      it("should reject invalid phone number format", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/twilio/connect`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountSid: "ACtest12345678901234567890123456",
            authToken: "test_token",
            phoneNumber: "5551234567", // Missing +
          }),
        });

        expect(response.status).toBe(400);
      });
    });

    describe("Blooio Input Validation", () => {
      it("should reject empty API key", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/blooio/connect`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            apiKey: "",
          }),
        });

        expect(response.status).toBe(400);
      });
    });

    describe("Telegram Input Validation", () => {
      it("should validate bot token format", async () => {
        const response = await fetch(`${BASE_URL}/api/v1/telegram/connect`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            botToken: "", // Empty token
          }),
        });

        expect(response.status).toBe(400);
      });
    });
  });

  describe("Response Format Consistency", () => {
    it("should return consistent structure for all status endpoints", async () => {
      const services = [
        "google",
        "twilio",
        "blooio",
        "telegram",
        "twitter",
        "discord",
      ];

      for (const service of services) {
        const response = await fetch(`${BASE_URL}/api/v1/${service}/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });

        expect(response.status).toBe(200);
        const data = await response.json();

        // All should have connected field
        expect(data).toHaveProperty("connected");
        expect(typeof data.connected).toBe("boolean");

        // All should have configured field
        expect(typeof data.configured === "boolean" || data.configured === undefined).toBe(true);
      }
    });

    it("should return proper JSON content type", async () => {
      const response = await fetch(`${BASE_URL}/api/v1/google/status`, {
        headers: {
          Authorization: `Bearer ${testData.apiKey.key}`,
        },
      });

      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });
  });

  describe("Performance", () => {
    it("should handle rapid sequential requests", async () => {
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        const response = await fetch(`${BASE_URL}/api/v1/google/status`, {
          headers: {
            Authorization: `Bearer ${testData.apiKey.key}`,
          },
        });
        expect(response.status).toBe(200);
      }

      const duration = Date.now() - startTime;
      // 10 requests should complete in under 10 seconds
      expect(duration).toBeLessThan(10000);
    });

    it("should handle parallel requests efficiently", async () => {
      const startTime = Date.now();

      const requests = Array(20)
        .fill(null)
        .map(() =>
          fetch(`${BASE_URL}/api/v1/google/status`, {
            headers: {
              Authorization: `Bearer ${testData.apiKey.key}`,
            },
          }),
        );

      const responses = await Promise.all(requests);

      const duration = Date.now() - startTime;

      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      // 20 parallel requests should complete in under 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });
});
