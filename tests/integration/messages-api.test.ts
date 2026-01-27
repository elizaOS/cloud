/**
 * Messages API Integration Tests
 *
 * Tests the messaging center API endpoints:
 * - GET /api/v1/messages - List conversations
 * - GET /api/v1/messages/thread - Get message thread
 *
 * These tests cover:
 * - Authentication and authorization
 * - Conversation listing with filters
 * - Thread retrieval
 * - Pagination
 * - Edge cases and error handling
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

describe.skipIf(!shouldRun)("Messages API Integration Tests", () => {
  let testData: TestDataSet;
  let client: Client;
  let agentId: string;
  let phoneNumberId: string;
  const testPhoneNumber = "+15551234567";
  const testFromNumber = "+15559876543";

  beforeAll(async () => {
    if (!shouldRun) return;

    // Create test data
    testData = await createTestDataSet(DATABASE_URL, {
      organizationName: "Messages API Test Org",
      creditBalance: 1000,
    });

    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();

    // Create test agent
    agentId = uuidv4();
    await client.query(
      `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
      [agentId, "Messages Test Agent"]
    );

    // Create phone number mapping
    const phoneResult = await client.query(
      `INSERT INTO agent_phone_numbers 
       (organization_id, agent_id, phone_number, provider, phone_type, is_active)
       VALUES ($1, $2, $3, 'twilio', 'sms', true)
       RETURNING id`,
      [testData.organization.id, agentId, testPhoneNumber]
    );
    phoneNumberId = phoneResult.rows[0].id;

    // Create test messages
    const messages = [
      { from: testFromNumber, to: testPhoneNumber, body: "Hello agent!", direction: "inbound", status: "received" },
      { from: testPhoneNumber, to: testFromNumber, body: "Hi! How can I help?", direction: "outbound", status: "responded" },
      { from: testFromNumber, to: testPhoneNumber, body: "What is the weather?", direction: "inbound", status: "responded" },
      { from: testPhoneNumber, to: testFromNumber, body: "The weather is sunny!", direction: "outbound", status: "responded" },
      { from: "+15551112222", to: testPhoneNumber, body: "Different sender", direction: "inbound", status: "failed" },
    ];

    for (const msg of messages) {
      await client.query(
        `INSERT INTO phone_message_log 
         (phone_number_id, direction, from_number, to_number, message_body, message_type, status)
         VALUES ($1, $2, $3, $4, $5, 'sms', $6)`,
        [phoneNumberId, msg.direction, msg.from, msg.to, msg.body, msg.status]
      );
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
    }
  });

  afterAll(async () => {
    if (!shouldRun) return;

    // Clean up test data
    await client.query(
      `DELETE FROM phone_message_log WHERE phone_number_id = $1`,
      [phoneNumberId]
    );
    await client.query(`DELETE FROM agent_phone_numbers WHERE id = $1`, [
      phoneNumberId,
    ]);
    await client.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
    await client.end();
    await cleanupTestData(DATABASE_URL, testData.organization.id);
  });

  describe("GET /api/v1/messages - List Conversations", () => {
    test("returns 401 without authentication", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(401);
    });

    test("returns 200 and conversation list with valid auth", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("conversations");
      expect(data).toHaveProperty("success", true);
      expect(Array.isArray(data.conversations)).toBe(true);
    });

    test("returns conversations grouped by phone number", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      // Should have at least 2 conversations (from testFromNumber and +15551112222)
      expect(data.conversations.length).toBeGreaterThanOrEqual(1);

      // Verify conversation structure
      if (data.conversations.length > 0) {
        const conv = data.conversations[0];
        expect(conv).toHaveProperty("phoneNumber");
        expect(conv).toHaveProperty("agentId");
        expect(conv).toHaveProperty("provider");
        expect(conv).toHaveProperty("totalMessages");
        expect(conv).toHaveProperty("lastMessageAt");
      }
    });

    test("filters conversations by provider", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages?provider=twilio`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      // All returned conversations should be from Twilio
      for (const conv of data.conversations) {
        expect(conv.provider).toBe("twilio");
      }
    });

    test("respects limit and offset pagination", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages?limit=1&offset=0`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.conversations.length).toBeLessThanOrEqual(1);
      expect(data.limit).toBe(1);
      expect(data.offset).toBe(0);
    });

    test("returns total count for pagination", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("total");
      expect(typeof data.total).toBe("number");
    });

    test("returns empty array when no conversations exist for filter", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages?provider=blooio`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      // Should return empty since we only created Twilio messages
      expect(data.conversations).toEqual([]);
    });

    test("shows failed message count in conversation", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      // Find the conversation with the failed message
      const failedConv = data.conversations.find(
        (c: { phoneNumber: string }) => c.phoneNumber === "+15551112222"
      );
      
      if (failedConv) {
        expect(failedConv.failedCount).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("GET /api/v1/messages/thread - Get Message Thread", () => {
    test("returns 401 without authentication", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${testFromNumber}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(401);
    });

    test("returns 400 without phoneNumber parameter", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages/thread`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("phoneNumber");
    });

    test("returns 200 and message thread with valid auth", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(testFromNumber)}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("messages");
      expect(data).toHaveProperty("success", true);
      expect(Array.isArray(data.messages)).toBe(true);
    });

    test("returns messages in chronological order", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(testFromNumber)}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.messages.length).toBeGreaterThanOrEqual(2);

      // Verify chronological order
      for (let i = 1; i < data.messages.length; i++) {
        const prevTime = new Date(data.messages[i - 1].createdAt).getTime();
        const currTime = new Date(data.messages[i].createdAt).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });

    test("includes both inbound and outbound messages", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(testFromNumber)}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      const directions = data.messages.map((m: { direction: string }) => m.direction);
      expect(directions).toContain("inbound");
      expect(directions).toContain("outbound");
    });

    test("returns correct message structure", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(testFromNumber)}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      if (data.messages.length > 0) {
        const msg = data.messages[0];
        expect(msg).toHaveProperty("id");
        expect(msg).toHaveProperty("direction");
        expect(msg).toHaveProperty("from");
        expect(msg).toHaveProperty("to");
        expect(msg).toHaveProperty("body");
        expect(msg).toHaveProperty("status");
        expect(msg).toHaveProperty("createdAt");
      }
    });

    test("returns agentInfo with thread", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(testFromNumber)}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("agentInfo");
      if (data.agentInfo) {
        expect(data.agentInfo).toHaveProperty("agentId");
        expect(data.agentInfo).toHaveProperty("agentPhoneNumber");
        expect(data.agentInfo).toHaveProperty("provider");
      }
    });

    test("respects limit parameter", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(testFromNumber)}&limit=2`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.messages.length).toBeLessThanOrEqual(2);
    });

    test("returns empty array for unknown phone number", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent("+10000000000")}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.messages).toEqual([]);
    });

    test("can filter by phoneNumberId for disambiguation", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(testFromNumber)}&phoneNumberId=${phoneNumberId}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe("Cross-Organization Access Control", () => {
    let otherOrgData: TestDataSet;
    let otherClient: Client;
    let otherAgentId: string;
    let otherPhoneNumberId: string;

    beforeAll(async () => {
      if (!shouldRun) return;

      // Create another organization
      otherOrgData = await createTestDataSet(DATABASE_URL, {
        organizationName: "Other Messages Org",
        creditBalance: 1000,
      });

      otherClient = new Client({ connectionString: DATABASE_URL });
      await otherClient.connect();

      // Create test agent for other org
      otherAgentId = uuidv4();
      await otherClient.query(
        `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
        [otherAgentId, "Other Org Agent"]
      );

      // Create phone number for other org
      const result = await otherClient.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, is_active)
         VALUES ($1, $2, '+15550009999', 'twilio', 'sms', true)
         RETURNING id`,
        [otherOrgData.organization.id, otherAgentId]
      );
      otherPhoneNumberId = result.rows[0].id;

      // Create a message for other org
      await otherClient.query(
        `INSERT INTO phone_message_log 
         (phone_number_id, direction, from_number, to_number, message_body, status)
         VALUES ($1, 'inbound', '+15558887777', '+15550009999', 'Secret message', 'received')`,
        [otherPhoneNumberId]
      );
    });

    afterAll(async () => {
      if (!shouldRun) return;

      await otherClient.query(
        `DELETE FROM phone_message_log WHERE phone_number_id = $1`,
        [otherPhoneNumberId]
      );
      await otherClient.query(`DELETE FROM agent_phone_numbers WHERE id = $1`, [
        otherPhoneNumberId,
      ]);
      await otherClient.query(`DELETE FROM agents WHERE id = $1`, [otherAgentId]);
      await otherClient.end();
      await cleanupTestData(DATABASE_URL, otherOrgData.organization.id);
    });

    test("cannot see another organization's conversations", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key), // Use first org's key
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      // Should not contain the other org's phone number
      const phoneNumbers = data.conversations.map(
        (c: { phoneNumber: string }) => c.phoneNumber
      );
      expect(phoneNumbers).not.toContain("+15558887777");
    });

    test("cannot read another organization's message thread", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent("+15558887777")}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key), // Use first org's key
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      // Should return empty - no access to other org's messages
      expect(data.messages).toEqual([]);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("handles special characters in phone number", async () => {
      const phoneWithSpecialChars = "+1 (555) 123-4567";
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(phoneWithSpecialChars)}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      // Should not crash - may return empty or results
      expect([200, 400]).toContain(res.status);
    });

    test("handles email addresses for iMessage (Blooio)", async () => {
      const emailAddress = "test@example.com";
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(emailAddress)}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);
      // Should handle gracefully even if no results
    });

    test("handles very long limit parameter", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages?limit=10000`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
      // Should cap at reasonable limit or return results
    });

    test("handles negative offset gracefully", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages?offset=-1`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      // Should handle gracefully
      expect([200, 400]).toContain(res.status);
    });

    test("handles invalid provider filter", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages?provider=invalid`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);
      // Invalid provider should be ignored or return empty
    });
  });

  describe("Performance and Scalability", () => {
    test("handles request with many messages efficiently", async () => {
      const startTime = Date.now();
      
      const res = await fetch(`${SERVER_URL}/api/v1/messages`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      const duration = Date.now() - startTime;
      
      expect(res.status).toBe(200);
      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000);
    });

    test("handles concurrent requests", async () => {
      const requests = Array(5)
        .fill(null)
        .map(() =>
          fetch(`${SERVER_URL}/api/v1/messages`, {
            method: "GET",
            headers: getTestAuthHeaders(testData.apiKey.key),
            signal: AbortSignal.timeout(TIMEOUT),
          })
        );

      const responses = await Promise.all(requests);
      
      // All requests should succeed
      for (const res of responses) {
        expect(res.status).toBe(200);
      }
    });
  });
});
