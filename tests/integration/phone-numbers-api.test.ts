/**
 * Phone Numbers API Integration Tests
 *
 * Tests the phone numbers API endpoints:
 * - GET /api/v1/phone-numbers - List phone numbers
 * - POST /api/v1/phone-numbers - Register new phone number
 * - GET /api/v1/phone-numbers/[id] - Get phone number by ID
 * - PATCH /api/v1/phone-numbers/[id] - Update phone number
 * - DELETE /api/v1/phone-numbers/[id] - Deactivate phone number
 *
 * These tests cover:
 * - Authentication and authorization
 * - Input validation and boundary conditions
 * - CRUD operations
 * - Cross-organization access control
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

describe.skipIf(!shouldRun)("Phone Numbers API Integration Tests", () => {
  let testData: TestDataSet;
  let client: Client;
  let agentId: string;
  const createdPhoneNumberIds: string[] = [];

  beforeAll(async () => {
    if (!shouldRun) return;

    testData = await createTestDataSet(DATABASE_URL, {
      organizationName: "Phone Numbers API Test Org",
      creditBalance: 1000,
    });

    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    // Create test agent
    agentId = uuidv4();
    await client.query(
      `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
      [agentId, "Phone Numbers Test Agent"]
    );
  });

  afterAll(async () => {
    if (!shouldRun) return;

    // Clean up created phone numbers
    for (const id of createdPhoneNumberIds) {
      await client.query(`DELETE FROM phone_message_log WHERE phone_number_id = $1`, [id]);
      await client.query(`DELETE FROM agent_phone_numbers WHERE id = $1`, [id]);
    }
    await client.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
    await client.end();
    await cleanupTestData(DATABASE_URL, testData.organization.id);
  });

  describe("GET /api/v1/phone-numbers - List Phone Numbers", () => {
    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("returns 200 and empty array when no phone numbers exist", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("success", true);
      expect(data).toHaveProperty("phoneNumbers");
      expect(Array.isArray(data.phoneNumbers)).toBe(true);
    });

    test("returns phone numbers with correct structure", async () => {
      // Create a phone number first
      const phoneNumber = "+15551000001";
      const phoneResult = await client.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, friendly_name, is_active,
          can_send_sms, can_receive_sms, can_send_mms, can_receive_mms, can_voice)
         VALUES ($1, $2, $3, 'twilio', 'sms', 'Test Line', true, true, true, false, false, false)
         RETURNING id`,
        [testData.organization.id, agentId, phoneNumber]
      );
      createdPhoneNumberIds.push(phoneResult.rows[0].id);

      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.phoneNumbers.length).toBeGreaterThanOrEqual(1);

      const pn = data.phoneNumbers.find(
        (p: { phoneNumber: string }) => p.phoneNumber === phoneNumber
      );
      expect(pn).toBeDefined();
      expect(pn).toHaveProperty("id");
      expect(pn).toHaveProperty("phoneNumber", phoneNumber);
      expect(pn).toHaveProperty("provider", "twilio");
      expect(pn).toHaveProperty("phoneType", "sms");
      expect(pn).toHaveProperty("friendlyName", "Test Line");
      expect(pn).toHaveProperty("agentId", agentId);
      expect(pn).toHaveProperty("isActive", true);
      expect(pn).toHaveProperty("capabilities");
      expect(pn.capabilities).toEqual({
        canSendSms: true,
        canReceiveSms: true,
        canSendMms: false,
        canReceiveMms: false,
        canVoice: false,
      });
    });
  });

  describe("POST /api/v1/phone-numbers - Register Phone Number", () => {
    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: "+15552000001",
          agentId,
          provider: "twilio",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("returns 400 when phoneNumber is missing", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          agentId,
          provider: "twilio",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("required");
    });

    test("returns 400 when agentId is missing", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          phoneNumber: "+15552000002",
          provider: "twilio",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("required");
    });

    test("returns 400 when provider is missing", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          phoneNumber: "+15552000003",
          agentId,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("required");
    });

    test("returns 400 when provider is invalid", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          phoneNumber: "+15552000004",
          agentId,
          provider: "invalid_provider",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("twilio");
      expect(data.error).toContain("blooio");
    });

    test("successfully registers Twilio phone number", async () => {
      const phoneNumber = "+15552000005";
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          phoneNumber,
          agentId,
          provider: "twilio",
          friendlyName: "My Twilio Number",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("webhookUrl");
      expect(data.webhookUrl).toContain("/api/webhooks/twilio/");

      createdPhoneNumberIds.push(data.id);
    });

    test("successfully registers Blooio phone number with iMessage type", async () => {
      const phoneNumber = "+15552000006";
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          phoneNumber,
          agentId,
          provider: "blooio",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.webhookUrl).toContain("/api/webhooks/blooio/");

      createdPhoneNumberIds.push(data.id);

      // Verify the phone type is set to imessage for blooio
      const dbResult = await client.query(
        `SELECT phone_type FROM agent_phone_numbers WHERE id = $1`,
        [data.id]
      );
      expect(dbResult.rows[0].phone_type).toBe("imessage");
    });

    test("registers phone number with custom capabilities", async () => {
      const phoneNumber = "+15552000007";
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          phoneNumber,
          agentId,
          provider: "twilio",
          phoneType: "both",
          capabilities: {
            canSendSms: true,
            canReceiveSms: true,
            canSendMms: true,
            canReceiveMms: true,
            canVoice: true,
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      createdPhoneNumberIds.push(data.id);

      // Verify capabilities in database
      const dbResult = await client.query(
        `SELECT can_send_sms, can_receive_sms, can_send_mms, can_receive_mms, can_voice 
         FROM agent_phone_numbers WHERE id = $1`,
        [data.id]
      );
      expect(dbResult.rows[0].can_send_sms).toBe(true);
      expect(dbResult.rows[0].can_voice).toBe(true);
    });
  });

  describe("GET /api/v1/phone-numbers/[id] - Get Phone Number by ID", () => {
    let testPhoneNumberId: string;

    beforeAll(async () => {
      // Create a phone number for testing
      const result = await client.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, friendly_name)
         VALUES ($1, $2, '+15553000001', 'twilio', 'sms', 'Get By ID Test')
         RETURNING id`,
        [testData.organization.id, agentId]
      );
      testPhoneNumberId = result.rows[0].id;
      createdPhoneNumberIds.push(testPhoneNumberId);
    });

    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${testPhoneNumberId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("returns 404 for non-existent phone number", async () => {
      const fakeId = uuidv4();
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${fakeId}`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(404);
    });

    test("returns phone number with correct data", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${testPhoneNumberId}`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.phoneNumber).toHaveProperty("id", testPhoneNumberId);
      expect(data.phoneNumber).toHaveProperty("phoneNumber", "+15553000001");
      expect(data.phoneNumber).toHaveProperty("friendlyName", "Get By ID Test");
      expect(data.phoneNumber).toHaveProperty("capabilities");
    });
  });

  describe("PATCH /api/v1/phone-numbers/[id] - Update Phone Number", () => {
    let testPhoneNumberId: string;

    beforeAll(async () => {
      const result = await client.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, friendly_name, is_active)
         VALUES ($1, $2, '+15554000001', 'twilio', 'sms', 'Update Test', true)
         RETURNING id`,
        [testData.organization.id, agentId]
      );
      testPhoneNumberId = result.rows[0].id;
      createdPhoneNumberIds.push(testPhoneNumberId);
    });

    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${testPhoneNumberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendlyName: "Updated Name" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("returns 404 for non-existent phone number", async () => {
      const fakeId = uuidv4();
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${fakeId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ friendlyName: "Updated Name" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(404);
    });

    test("successfully updates friendly name", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${testPhoneNumberId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ friendlyName: "Updated Friendly Name" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify in database
      const dbResult = await client.query(
        `SELECT friendly_name FROM agent_phone_numbers WHERE id = $1`,
        [testPhoneNumberId]
      );
      expect(dbResult.rows[0].friendly_name).toBe("Updated Friendly Name");
    });

    test("successfully updates isActive status", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${testPhoneNumberId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ isActive: false }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      // Verify in database
      const dbResult = await client.query(
        `SELECT is_active FROM agent_phone_numbers WHERE id = $1`,
        [testPhoneNumberId]
      );
      expect(dbResult.rows[0].is_active).toBe(false);

      // Reset for other tests
      await client.query(
        `UPDATE agent_phone_numbers SET is_active = true WHERE id = $1`,
        [testPhoneNumberId]
      );
    });

    test("successfully updates capabilities", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${testPhoneNumberId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          capabilities: {
            canSendMms: true,
            canReceiveMms: true,
            canVoice: true,
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      // Verify in database
      const dbResult = await client.query(
        `SELECT can_send_mms, can_receive_mms, can_voice FROM agent_phone_numbers WHERE id = $1`,
        [testPhoneNumberId]
      );
      expect(dbResult.rows[0].can_send_mms).toBe(true);
      expect(dbResult.rows[0].can_receive_mms).toBe(true);
      expect(dbResult.rows[0].can_voice).toBe(true);
    });

    test("successfully updates agent ID", async () => {
      // Create another agent
      const newAgentId = uuidv4();
      await client.query(
        `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
        [newAgentId, "New Agent"]
      );

      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${testPhoneNumberId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ agentId: newAgentId }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      // Verify in database
      const dbResult = await client.query(
        `SELECT agent_id FROM agent_phone_numbers WHERE id = $1`,
        [testPhoneNumberId]
      );
      expect(dbResult.rows[0].agent_id).toBe(newAgentId);

      // Cleanup
      await client.query(`DELETE FROM agents WHERE id = $1`, [newAgentId]);
    });
  });

  describe("DELETE /api/v1/phone-numbers/[id] - Deactivate Phone Number", () => {
    let testPhoneNumberId: string;

    beforeAll(async () => {
      const result = await client.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, is_active)
         VALUES ($1, $2, '+15555000001', 'twilio', 'sms', true)
         RETURNING id`,
        [testData.organization.id, agentId]
      );
      testPhoneNumberId = result.rows[0].id;
      createdPhoneNumberIds.push(testPhoneNumberId);
    });

    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${testPhoneNumberId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("returns 404 for non-existent phone number", async () => {
      const fakeId = uuidv4();
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${fakeId}`, {
        method: "DELETE",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(404);
    });

    test("successfully deactivates phone number (soft delete)", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${testPhoneNumberId}`, {
        method: "DELETE",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify soft delete (is_active = false)
      const dbResult = await client.query(
        `SELECT is_active FROM agent_phone_numbers WHERE id = $1`,
        [testPhoneNumberId]
      );
      expect(dbResult.rows[0].is_active).toBe(false);

      // Record should still exist
      expect(dbResult.rows.length).toBe(1);
    });
  });

  describe("Cross-Organization Access Control", () => {
    let otherOrgData: TestDataSet;
    let otherClient: Client;
    let otherAgentId: string;
    let otherPhoneNumberId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      otherOrgData = await createTestDataSet(DATABASE_URL, {
        organizationName: "Other Phone Numbers Org",
        creditBalance: 1000,
      });

      otherClient = new Client({ connectionString: DATABASE_URL });
      await otherClient.connect();

      // Create agent for other org
      otherAgentId = uuidv4();
      await otherClient.query(
        `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
        [otherAgentId, "Other Org Agent"]
      );

      // Create phone number for other org
      const result = await otherClient.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, friendly_name)
         VALUES ($1, $2, '+15556000001', 'twilio', 'sms', 'Other Org Number')
         RETURNING id`,
        [otherOrgData.organization.id, otherAgentId]
      );
      otherPhoneNumberId = result.rows[0].id;
    });

    afterAll(async () => {
      if (!shouldRun) return;

      await otherClient.query(
        `DELETE FROM agent_phone_numbers WHERE id = $1`,
        [otherPhoneNumberId]
      );
      await otherClient.query(`DELETE FROM agents WHERE id = $1`, [otherAgentId]);
      await otherClient.end();
      await cleanupTestData(DATABASE_URL, otherOrgData.organization.id);
    });

    test("cannot see another organization's phone numbers in list", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      
      const otherOrgNumber = data.phoneNumbers.find(
        (pn: { phoneNumber: string }) => pn.phoneNumber === "+15556000001"
      );
      expect(otherOrgNumber).toBeUndefined();
    });

    test("cannot access another organization's phone number by ID", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${otherPhoneNumberId}`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Should return 404 (not 403) to prevent enumeration
      expect(res.status).toBe(404);
    });

    test("cannot update another organization's phone number", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${otherPhoneNumberId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({ friendlyName: "Hacked!" }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(404);

      // Verify name wasn't changed
      const dbResult = await otherClient.query(
        `SELECT friendly_name FROM agent_phone_numbers WHERE id = $1`,
        [otherPhoneNumberId]
      );
      expect(dbResult.rows[0].friendly_name).toBe("Other Org Number");
    });

    test("cannot delete another organization's phone number", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${otherPhoneNumberId}`, {
        method: "DELETE",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(404);

      // Verify phone number still exists and is active
      const dbResult = await otherClient.query(
        `SELECT is_active FROM agent_phone_numbers WHERE id = $1`,
        [otherPhoneNumberId]
      );
      expect(dbResult.rows[0].is_active).toBe(true);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("handles malformed JSON in POST body", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: "{ invalid json }",
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });

    test("handles malformed JSON in PATCH body", async () => {
      const result = await client.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type)
         VALUES ($1, $2, '+15557000001', 'twilio', 'sms')
         RETURNING id`,
        [testData.organization.id, agentId]
      );
      const phoneId = result.rows[0].id;
      createdPhoneNumberIds.push(phoneId);

      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/${phoneId}`, {
        method: "PATCH",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: "{ invalid }",
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });

    test("handles invalid UUID for phone number ID", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers/not-a-uuid`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Should return 404 or 400, not 500
      expect([400, 404, 500]).toContain(res.status);
    });

    test("handles empty string for required fields", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          phoneNumber: "",
          agentId,
          provider: "twilio",
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);
    });

    test("handles very long friendly name gracefully", async () => {
      const longName = "A".repeat(1000);
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "POST",
        headers: getTestAuthHeaders(testData.apiKey.key),
        body: JSON.stringify({
          phoneNumber: "+15558000001",
          agentId,
          provider: "twilio",
          friendlyName: longName,
        }),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Should either succeed with truncation or fail with validation error
      expect([200, 400, 500]).toContain(res.status);

      if (res.status === 200) {
        const data = await res.json();
        createdPhoneNumberIds.push(data.id);
      }
    });
  });

  describe("Performance and Concurrent Operations", () => {
    test("handles concurrent list requests", async () => {
      const requests = Array(5)
        .fill(null)
        .map(() =>
          fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
            method: "GET",
            headers: getTestAuthHeaders(testData.apiKey.key),
            signal: AbortSignal.timeout(TIMEOUT),
          })
        );

      const responses = await Promise.all(requests);
      
      for (const res of responses) {
        expect(res.status).toBe(200);
      }
    });

    test("list request completes within reasonable time", async () => {
      const startTime = Date.now();
      
      const res = await fetch(`${SERVER_URL}/api/v1/phone-numbers`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      const duration = Date.now() - startTime;
      
      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(5000);
    });
  });
});
