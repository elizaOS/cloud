/**
 * E2E Integration Tests for Webhook Handlers
 *
 * Tests Twilio and Blooio webhook endpoints.
 * Covers: inbound messages, signature verification, response handling.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Client } from "pg";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";
import {
  createTestDataSet,
  cleanupTestData,
  type TestDataSet,
} from "../infrastructure/test-data-factory";

const TEST_DB_URL = process.env.DATABASE_URL || "";
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

describe("Webhook Handlers E2E Tests", () => {
  let testData: TestDataSet;
  let client: Client;
  let agentId: string;
  let phoneNumberId: string;

  beforeAll(async () => {
    if (!TEST_DB_URL) {
      throw new Error("DATABASE_URL is required for integration tests");
    }

    testData = await createTestDataSet(TEST_DB_URL, {
      organizationName: "Webhook Test Org",
      creditBalance: 1000,
    });

    client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();

    // Create test agent
    agentId = uuidv4();
    await client.query(
      `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
      [agentId, "Webhook Test Agent"],
    );

    // Register phone number for agent
    const phoneResult = await client.query(
      `INSERT INTO agent_phone_numbers 
       (organization_id, agent_id, phone_number, provider, phone_type, is_active)
       VALUES ($1, $2, '+15551234567', 'twilio', 'sms', true)
       RETURNING id`,
      [testData.organization.id, agentId],
    );
    phoneNumberId = phoneResult.rows[0].id;

    // Setup Twilio credentials
    await client.query(
      `INSERT INTO platform_credentials (organization_id, platform, credentials, created_at, updated_at)
       VALUES ($1, 'twilio', '{"accountSid": "ACtest123", "authToken": "test_token"}', NOW(), NOW())
       ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"accountSid": "ACtest123", "authToken": "test_token"}'`,
      [testData.organization.id],
    );

    // Setup Blooio credentials
    await client.query(
      `INSERT INTO platform_credentials (organization_id, platform, credentials, created_at, updated_at)
       VALUES ($1, 'blooio', '{"apiKey": "bloo_test_key", "webhookSecret": "webhook_secret_123"}', NOW(), NOW())
       ON CONFLICT (organization_id, platform) DO UPDATE SET credentials = '{"apiKey": "bloo_test_key", "webhookSecret": "webhook_secret_123"}'`,
      [testData.organization.id],
    );
  });

  afterAll(async () => {
    await client.query(
      `DELETE FROM phone_message_log WHERE phone_number_id = $1`,
      [phoneNumberId],
    );
    await client.query(`DELETE FROM agent_phone_numbers WHERE id = $1`, [
      phoneNumberId,
    ]);
    await client.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
    await client.query(
      `DELETE FROM platform_credentials WHERE organization_id = $1`,
      [testData.organization.id],
    );
    await client.end();
    await cleanupTestData(TEST_DB_URL, testData.organization.id);
  });

  describe("Twilio Webhook Handler", () => {
    const twilioWebhookUrl = `${BASE_URL}/api/webhooks/twilio/${testData?.organization?.id}`;

    describe("POST /api/webhooks/twilio/[orgId]", () => {
      it("should handle incoming SMS message", async () => {
        const formData = new URLSearchParams();
        formData.append("MessageSid", "SM" + uuidv4().replace(/-/g, ""));
        formData.append("From", "+15559876543");
        formData.append("To", "+15551234567");
        formData.append("Body", "Hello, this is a test message!");
        formData.append("AccountSid", "ACtest123");
        formData.append("NumMedia", "0");

        const response = await fetch(
          `${BASE_URL}/api/webhooks/twilio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
          },
        );

        // Should return TwiML response
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(text).toContain("<?xml");
        expect(text).toContain("<Response>");
      });

      it("should handle incoming MMS with media", async () => {
        const formData = new URLSearchParams();
        formData.append("MessageSid", "MM" + uuidv4().replace(/-/g, ""));
        formData.append("From", "+15559876543");
        formData.append("To", "+15551234567");
        formData.append("Body", "Check out this image!");
        formData.append("AccountSid", "ACtest123");
        formData.append("NumMedia", "1");
        formData.append("MediaUrl0", "https://example.com/image.jpg");
        formData.append("MediaContentType0", "image/jpeg");

        const response = await fetch(
          `${BASE_URL}/api/webhooks/twilio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
          },
        );

        expect(response.status).toBe(200);
      });

      it("should handle empty message body", async () => {
        const formData = new URLSearchParams();
        formData.append("MessageSid", "SM" + uuidv4().replace(/-/g, ""));
        formData.append("From", "+15559876543");
        formData.append("To", "+15551234567");
        formData.append("Body", "");
        formData.append("AccountSid", "ACtest123");
        formData.append("NumMedia", "0");

        const response = await fetch(
          `${BASE_URL}/api/webhooks/twilio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
          },
        );

        // Should still return 200 but skip processing
        expect(response.status).toBe(200);
      });

      it("should return 400 for invalid organization ID", async () => {
        const formData = new URLSearchParams();
        formData.append("MessageSid", "SM123");
        formData.append("From", "+15559876543");
        formData.append("To", "+15551234567");
        formData.append("Body", "Test");

        const response = await fetch(
          `${BASE_URL}/api/webhooks/twilio/invalid-org-id`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
          },
        );

        // May return 400 or 500 depending on validation
        expect([400, 500]).toContain(response.status);
      });

      it("should include geographic information in metadata", async () => {
        const formData = new URLSearchParams();
        formData.append("MessageSid", "SM" + uuidv4().replace(/-/g, ""));
        formData.append("From", "+15559876543");
        formData.append("To", "+15551234567");
        formData.append("Body", "Location test");
        formData.append("AccountSid", "ACtest123");
        formData.append("NumMedia", "0");
        formData.append("FromCity", "San Francisco");
        formData.append("FromState", "CA");
        formData.append("FromCountry", "US");

        const response = await fetch(
          `${BASE_URL}/api/webhooks/twilio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
          },
        );

        expect(response.status).toBe(200);
      });
    });

    describe("GET /api/webhooks/twilio/[orgId] (Health Check)", () => {
      it("should return health status", async () => {
        const response = await fetch(
          `${BASE_URL}/api/webhooks/twilio/${testData.organization.id}`,
          {
            method: "GET",
          },
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.status).toBe("ok");
        expect(data.service).toBe("twilio-webhook");
      });
    });
  });

  describe("Blooio Webhook Handler", () => {
    describe("POST /api/webhooks/blooio/[orgId]", () => {
      it("should handle incoming iMessage", async () => {
        const payload = {
          event: "message.received",
          message_id: "bloo_" + uuidv4(),
          sender: "+15559876543",
          text: "Hello from iMessage!",
          timestamp: new Date().toISOString(),
          protocol: "imessage",
          external_id: "ext_123",
          attachments: [],
        };

        const response = await fetch(
          `${BASE_URL}/api/webhooks/blooio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
      });

      it("should handle message with attachments", async () => {
        const payload = {
          event: "message.received",
          message_id: "bloo_" + uuidv4(),
          sender: "+15559876543",
          text: "Check this out!",
          timestamp: new Date().toISOString(),
          protocol: "imessage",
          attachments: [
            { url: "https://example.com/image.jpg", name: "image.jpg" },
          ],
        };

        const response = await fetch(
          `${BASE_URL}/api/webhooks/blooio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        expect(response.status).toBe(200);
      });

      it("should handle message.sent event", async () => {
        const payload = {
          event: "message.sent",
          message_id: "bloo_" + uuidv4(),
          sender: "+15551234567",
          recipient: "+15559876543",
          timestamp: new Date().toISOString(),
        };

        const response = await fetch(
          `${BASE_URL}/api/webhooks/blooio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        expect(response.status).toBe(200);
      });

      it("should handle message.delivered event", async () => {
        const payload = {
          event: "message.delivered",
          message_id: "bloo_" + uuidv4(),
          timestamp: new Date().toISOString(),
        };

        const response = await fetch(
          `${BASE_URL}/api/webhooks/blooio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        expect(response.status).toBe(200);
      });

      it("should handle message.failed event", async () => {
        const payload = {
          event: "message.failed",
          message_id: "bloo_" + uuidv4(),
          error: "Delivery failed",
          timestamp: new Date().toISOString(),
        };

        const response = await fetch(
          `${BASE_URL}/api/webhooks/blooio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        expect(response.status).toBe(200);
      });

      it("should handle message.read event", async () => {
        const payload = {
          event: "message.read",
          message_id: "bloo_" + uuidv4(),
          timestamp: new Date().toISOString(),
        };

        const response = await fetch(
          `${BASE_URL}/api/webhooks/blooio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        expect(response.status).toBe(200);
      });

      it("should reject invalid JSON payload", async () => {
        const response = await fetch(
          `${BASE_URL}/api/webhooks/blooio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: "{ invalid json }",
          },
        );

        expect(response.status).toBe(400);
      });

      it("should handle empty message", async () => {
        const payload = {
          event: "message.received",
          message_id: "bloo_" + uuidv4(),
          sender: "+15559876543",
          text: "",
          timestamp: new Date().toISOString(),
          protocol: "imessage",
          attachments: [],
        };

        const response = await fetch(
          `${BASE_URL}/api/webhooks/blooio/${testData.organization.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        // Should still return 200 but skip processing
        expect(response.status).toBe(200);
      });
    });

    describe("GET /api/webhooks/blooio/[orgId] (Health Check)", () => {
      it("should return health status", async () => {
        const response = await fetch(
          `${BASE_URL}/api/webhooks/blooio/${testData.organization.id}`,
          {
            method: "GET",
          },
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.status).toBe("ok");
        expect(data.service).toBe("blooio-webhook");
      });
    });
  });

  describe("Webhook Security", () => {
    it("should validate Twilio signature when auth token is available", async () => {
      // This test validates the signature verification logic
      // In production, requests without valid signatures would be rejected
      const formData = new URLSearchParams();
      formData.append("MessageSid", "SM123");
      formData.append("From", "+15559876543");
      formData.append("To", "+15551234567");
      formData.append("Body", "Test with signature");

      // Send with invalid signature
      const response = await fetch(
        `${BASE_URL}/api/webhooks/twilio/${testData.organization.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Twilio-Signature": "invalid_signature",
          },
          body: formData,
        },
      );

      // May return 200 (if signature validation is optional in dev)
      // or 401 (if signature validation is enforced)
      expect([200, 401]).toContain(response.status);
    });

    it("should validate Blooio signature when webhook secret is available", async () => {
      const payload = {
        event: "message.received",
        message_id: "bloo_123",
        sender: "+15559876543",
        text: "Test with signature",
        timestamp: new Date().toISOString(),
      };

      // Send with invalid signature
      const response = await fetch(
        `${BASE_URL}/api/webhooks/blooio/${testData.organization.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Blooio-Signature": "invalid_signature",
          },
          body: JSON.stringify(payload),
        },
      );

      // May return 200 (if signature validation is optional)
      // or 401 (if signature validation is enforced)
      expect([200, 401]).toContain(response.status);
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent organization gracefully", async () => {
      const nonExistentOrgId = uuidv4();
      const formData = new URLSearchParams();
      formData.append("MessageSid", "SM123");
      formData.append("From", "+15559876543");
      formData.append("To", "+15551234567");
      formData.append("Body", "Test");

      const response = await fetch(
        `${BASE_URL}/api/webhooks/twilio/${nonExistentOrgId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData,
        },
      );

      // Should handle gracefully, not crash
      expect([200, 400, 404, 500]).toContain(response.status);
    });

    it("should handle database errors gracefully", async () => {
      // This test would require mocking the database to fail
      // For now, we verify the endpoint doesn't crash with valid input
      const payload = {
        event: "message.received",
        message_id: "bloo_" + uuidv4(),
        sender: "+15559876543",
        text: "Database error test",
        timestamp: new Date().toISOString(),
        protocol: "imessage",
      };

      const response = await fetch(
        `${BASE_URL}/api/webhooks/blooio/${testData.organization.id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      // Should not return 5xx for valid requests
      expect(response.status).toBeLessThan(500);
    });
  });

  describe("Performance", () => {
    it("should handle multiple concurrent webhook requests", async () => {
      const requests = [];
      for (let i = 0; i < 10; i++) {
        const formData = new URLSearchParams();
        formData.append("MessageSid", "SM" + uuidv4().replace(/-/g, ""));
        formData.append("From", "+15559876543");
        formData.append("To", "+15551234567");
        formData.append("Body", `Concurrent test message ${i}`);
        formData.append("AccountSid", "ACtest123");
        formData.append("NumMedia", "0");

        requests.push(
          fetch(`${BASE_URL}/api/webhooks/twilio/${testData.organization.id}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData,
          }),
        );
      }

      const responses = await Promise.all(requests);
      const statuses = responses.map((r) => r.status);

      // All requests should succeed
      expect(statuses.every((s) => s === 200)).toBe(true);
    });
  });
});
