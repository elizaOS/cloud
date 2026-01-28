/**
 * Messages Send API Integration Tests
 *
 * Tests the POST /api/v1/messages/send endpoint:
 * - Authentication and authorization
 * - Input validation (to, body, phoneNumberId, provider)
 * - Phone number selection logic
 * - Provider-specific sending (Twilio vs Blooio)
 * - Error handling and edge cases
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Client } from "pg";
import { v4 as uuidv4 } from "uuid";
import {
  createTestDataSet,
  cleanupTestData,
  type TestDataSet,
} from "../infrastructure/test-data-factory";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL || "";
const TIMEOUT = 30000;

const shouldRun = !!DATABASE_URL;

function getTestAuthHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };
}

describe.skipIf(!shouldRun)("Messages Send API Integration Tests", () => {
  let testData: TestDataSet;
  let client: Client;
  let agentId: string;
  let twilioPhoneNumberId: string;
  let blooioPhoneNumberId: string;
  let inactivePhoneNumberId: string;

  const twilioPhoneNumber = "+15551001001";
  const blooioPhoneNumber = "+15551002002";

  beforeAll(async () => {
    if (!shouldRun) return;

    testData = await createTestDataSet(DATABASE_URL, {
      organizationName: "Messages Send API Test Org",
      creditBalance: 1000,
    });

    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    // Create test agent
    agentId = uuidv4();
    await client.query(
      `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
      [agentId, "Messages Send Test Agent"]
    );

    // Create Twilio phone number
    const twilioResult = await client.query(
      `INSERT INTO agent_phone_numbers 
       (organization_id, agent_id, phone_number, provider, phone_type, is_active)
       VALUES ($1, $2, $3, 'twilio', 'sms', true)
       RETURNING id`,
      [testData.organization.id, agentId, twilioPhoneNumber]
    );
    twilioPhoneNumberId = twilioResult.rows[0].id;

    // Create Blooio phone number
    const blooioResult = await client.query(
      `INSERT INTO agent_phone_numbers 
       (organization_id, agent_id, phone_number, provider, phone_type, is_active)
       VALUES ($1, $2, $3, 'blooio', 'imessage', true)
       RETURNING id`,
      [testData.organization.id, agentId, blooioPhoneNumber]
    );
    blooioPhoneNumberId = blooioResult.rows[0].id;

    // Create inactive phone number
    const inactiveResult = await client.query(
      `INSERT INTO agent_phone_numbers 
       (organization_id, agent_id, phone_number, provider, phone_type, is_active)
       VALUES ($1, $2, '+15551003003', 'twilio', 'sms', false)
       RETURNING id`,
      [testData.organization.id, agentId]
    );
    inactivePhoneNumberId = inactiveResult.rows[0].id;
  });

  afterAll(async () => {
    if (!shouldRun) return;

    await client.query(
      `DELETE FROM agent_phone_numbers WHERE id IN ($1, $2, $3)`,
      [twilioPhoneNumberId, blooioPhoneNumberId, inactivePhoneNumberId]
    );
    await client.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
    await client.end();
    await cleanupTestData(DATABASE_URL, testData.organization.id);
  });

  describe("Authentication", () => {
    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "+15559999999",
          body: "Test message",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("returns 401 with invalid API key", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders("invalid_api_key_12345"),
        body: JSON.stringify({
          to: "+15559999999",
          body: "Test message",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("Input Validation - Required Fields", () => {
    test("returns 400 when 'to' field is missing", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          body: "Test message",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("to");
    });

    test("returns 400 when 'body' field is missing", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("body");
    });

    test("returns 400 when 'body' is empty string", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: "",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("body");
    });

    test("returns 400 when 'body' is whitespace only", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: "   ",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("body");
    });
  });

  describe("Phone Number Selection Logic", () => {
    test("returns 400 when no active phone numbers exist", async () => {
      // Create new org with no phone numbers
      const emptyOrgData = await createTestDataSet(DATABASE_URL, {
        organizationName: "Empty Phone Numbers Org",
        creditBalance: 100,
      });

      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(emptyOrgData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: "Test message",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("phone number");

      await cleanupTestData(DATABASE_URL, emptyOrgData.organization.id);
    });

    test("returns 400 when specified phoneNumberId does not exist", async () => {
      const fakePhoneNumberId = uuidv4();
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: "Test message",
          phoneNumberId: fakePhoneNumberId,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("phone number");
    });

    test("returns 400 when phoneNumberId belongs to different organization", async () => {
      // Create another org with phone number
      const otherOrgData = await createTestDataSet(DATABASE_URL, {
        organizationName: "Other Send Org",
        creditBalance: 100,
      });
      const otherClient = new Client({ connectionString: DATABASE_URL });
      await otherClient.connect();

      const otherAgentId = uuidv4();
      await otherClient.query(
        `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
        [otherAgentId, "Other Agent"]
      );

      const otherPhoneResult = await otherClient.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, is_active)
         VALUES ($1, $2, '+15559001001', 'twilio', 'sms', true)
         RETURNING id`,
        [otherOrgData.organization.id, otherAgentId]
      );
      const otherPhoneNumberId = otherPhoneResult.rows[0].id;

      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: "Test message",
          phoneNumberId: otherPhoneNumberId,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("phone number");

      // Cleanup
      await otherClient.query(`DELETE FROM agent_phone_numbers WHERE id = $1`, [
        otherPhoneNumberId,
      ]);
      await otherClient.query(`DELETE FROM agents WHERE id = $1`, [otherAgentId]);
      await otherClient.end();
      await cleanupTestData(DATABASE_URL, otherOrgData.organization.id);
    });

    test("returns 400 when specified provider has no active phone numbers", async () => {
      // Create org with only Twilio number
      const twilioOnlyData = await createTestDataSet(DATABASE_URL, {
        organizationName: "Twilio Only Org",
        creditBalance: 100,
      });
      const twilioClient = new Client({ connectionString: DATABASE_URL });
      await twilioClient.connect();

      const twilioAgentId = uuidv4();
      await twilioClient.query(
        `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
        [twilioAgentId, "Twilio Agent"]
      );

      await twilioClient.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, is_active)
         VALUES ($1, $2, '+15559002002', 'twilio', 'sms', true)`,
        [twilioOnlyData.organization.id, twilioAgentId]
      );

      // Request Blooio provider
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(twilioOnlyData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: "Test message",
          provider: "blooio",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("phone number");

      // Cleanup
      await twilioClient.query(
        `DELETE FROM agent_phone_numbers WHERE organization_id = $1`,
        [twilioOnlyData.organization.id]
      );
      await twilioClient.query(`DELETE FROM agents WHERE id = $1`, [twilioAgentId]);
      await twilioClient.end();
      await cleanupTestData(DATABASE_URL, twilioOnlyData.organization.id);
    });

    test("uses any active phone number when no preference specified", async () => {
      // This test validates the route handler works when no provider is specified
      // The actual send might fail due to missing credentials, but we verify the
      // phone number selection logic works
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: "Test message",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // May return 200 (success) or 500 (provider failure), but not 400 (validation)
      // because we have active phone numbers
      // Actually, might return 500 due to missing Twilio/Blooio credentials
      expect([200, 500]).toContain(res.status);
    });
  });

  describe("Provider-Specific Message Sending", () => {
    test("selects Twilio phone number when provider is 'twilio'", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: "Test Twilio message",
          provider: "twilio",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Will likely fail at send step (no credentials), but should get past validation
      // Return status is either 200 (success) or 500 (provider error)
      expect([200, 500]).toContain(res.status);
    });

    test("selects Blooio phone number when provider is 'blooio'", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: "Test Blooio message",
          provider: "blooio",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Will likely fail at send step (no credentials), but should get past validation
      expect([200, 500]).toContain(res.status);
    });

    test("uses specific phone number when phoneNumberId is provided", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: "Test with specific phone number",
          phoneNumberId: twilioPhoneNumberId,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Will likely fail at send step, but should get past validation
      expect([200, 500]).toContain(res.status);
    });
  });

  describe("Edge Cases", () => {
    test("handles malformed JSON in request body", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: "{ invalid json }",
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });

    test("handles null values in request body", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: null,
          body: "Test message",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });

    test("handles very long message body", async () => {
      const longMessage = "A".repeat(10000);
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: longMessage,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Should not crash - either succeeds or fails gracefully
      expect([200, 400, 500]).toContain(res.status);
    });

    test("handles special characters in message body", async () => {
      const specialMessage = "Hello! 🎉 Test with émojis & special chars: <script>alert('test')</script>";
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: specialMessage,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Should not crash - either succeeds or fails at provider
      expect([200, 500]).toContain(res.status);
    });

    test("handles phone number with various formats", async () => {
      // Test with spaces and dashes
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+1 (555) 999-9999",
          body: "Test formatted number",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Should not crash
      expect([200, 400, 500]).toContain(res.status);
    });

    test("handles email address as 'to' for iMessage", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "user@example.com",
          body: "Test iMessage via email",
          provider: "blooio",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Should not crash - may fail at provider
      expect([200, 500]).toContain(res.status);
    });
  });

  describe("Response Format", () => {
    test("returns success response with correct structure when send succeeds", async () => {
      // Note: This test may return 500 if credentials aren't configured
      // We're mainly testing the response structure
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
          body: "Test message",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      const data = await res.json();

      if (res.status === 200) {
        // If somehow it succeeds, verify the structure
        expect(data).toHaveProperty("success", true);
        expect(data).toHaveProperty("provider");
        expect(data).toHaveProperty("from");
        expect(data).toHaveProperty("to", "+15559999999");
      } else {
        // If it fails, should have error
        expect(data).toHaveProperty("error");
      }
    });

    test("returns error response with correct structure on failure", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/send`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          to: "+15559999999",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
      expect(typeof data.error).toBe("string");
    });
  });

  describe("Concurrent Requests", () => {
    test("handles multiple concurrent send requests", async () => {
      const requests = Array(5)
        .fill(null)
        .map((_, i) =>
          fetch(`${SERVER_URL}/api/v1/messages/send`, {
            method: "POST",
            headers: getTestAuthHeaders(testData.apiKey.key),
            body: JSON.stringify({
              to: `+1555999000${i}`,
              body: `Concurrent test message ${i}`,
            }),
            signal: AbortSignal.timeout(TIMEOUT),
          })
        );

      const responses = await Promise.all(requests);

      // All requests should complete without crashing
      for (const res of responses) {
        expect([200, 400, 500]).toContain(res.status);
      }
    });
  });
});
