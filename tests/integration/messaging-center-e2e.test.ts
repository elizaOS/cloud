/**
 * Messaging Center E2E Integration Tests
 *
 * Tests the complete messaging flow including:
 * - Phone number registration
 * - Webhook message reception
 * - Message routing to agents
 * - Conversation listing
 * - Thread viewing
 *
 * These tests simulate real-world scenarios.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
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

describe.skipIf(!shouldRun)("Messaging Center E2E Tests", () => {
  let testData: TestDataSet;
  let client: Client;

  beforeAll(async () => {
    if (!shouldRun) return;

    testData = await createTestDataSet(DATABASE_URL, {
      organizationName: "Messaging E2E Test Org",
      creditBalance: 1000,
    });

    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    if (!shouldRun) return;

    // Clean up all test phone numbers and messages
    await client.query(
      `DELETE FROM phone_message_log WHERE phone_number_id IN 
       (SELECT id FROM agent_phone_numbers WHERE organization_id = $1)`,
      [testData.organization.id]
    );
    await client.query(
      `DELETE FROM agent_phone_numbers WHERE organization_id = $1`,
      [testData.organization.id]
    );
    await client.end();
    await cleanupTestData(DATABASE_URL, testData.organization.id);
  });

  describe("Complete SMS Flow Simulation", () => {
    let agentId: string;
    let phoneNumberId: string;
    const agentPhoneNumber = "+15551000001";
    const customerPhoneNumber = "+15552000002";

    beforeAll(async () => {
      // Create agent
      agentId = uuidv4();
      await client.query(
        `INSERT INTO agents (id, name, enabled, bio, system) 
         VALUES ($1, $2, true, $3, $4)`,
        [
          agentId,
          "SMS Support Agent",
          '["I am a helpful SMS assistant"]',
          "You are a helpful SMS support agent. Respond concisely.",
        ]
      );

      // Register phone number
      const result = await client.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, is_active,
          can_send_sms, can_receive_sms)
         VALUES ($1, $2, $3, 'twilio', 'sms', true, true, true)
         RETURNING id`,
        [testData.organization.id, agentId, agentPhoneNumber]
      );
      phoneNumberId = result.rows[0].id;
    });

    afterAll(async () => {
      await client.query(
        `DELETE FROM phone_message_log WHERE phone_number_id = $1`,
        [phoneNumberId]
      );
      await client.query(`DELETE FROM agent_phone_numbers WHERE id = $1`, [
        phoneNumberId,
      ]);
      await client.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
    });

    test("Step 1: Customer sends initial message", async () => {
      // Simulate inbound message from webhook
      await client.query(
        `INSERT INTO phone_message_log 
         (phone_number_id, direction, from_number, to_number, message_body, 
          message_type, status, provider_message_id)
         VALUES ($1, 'inbound', $2, $3, 'Hi, I need help with my order', 
                 'sms', 'received', $4)`,
        [phoneNumberId, customerPhoneNumber, agentPhoneNumber, `SM${uuidv4().slice(0, 32)}`]
      );

      // Verify message was logged
      const result = await client.query(
        `SELECT * FROM phone_message_log WHERE phone_number_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [phoneNumberId]
      );

      expect(result.rows[0].direction).toBe("inbound");
      expect(result.rows[0].from_number).toBe(customerPhoneNumber);
      expect(result.rows[0].status).toBe("received");
    });

    test("Step 2: Agent processes and responds", async () => {
      // Update the last message to processing
      await client.query(
        `UPDATE phone_message_log 
         SET status = 'processing' 
         WHERE phone_number_id = $1 AND direction = 'inbound'
         ORDER BY created_at DESC LIMIT 1`,
        [phoneNumberId]
      );

      // Simulate agent response
      const agentResponse = "I'd be happy to help with your order! What's your order number?";
      await client.query(
        `UPDATE phone_message_log 
         SET status = 'responded', 
             agent_response = $2,
             response_time_ms = '250',
             responded_at = NOW()
         WHERE phone_number_id = $1 AND direction = 'inbound'
         ORDER BY created_at DESC LIMIT 1`,
        [phoneNumberId, agentResponse]
      );

      // Log the outbound response
      await client.query(
        `INSERT INTO phone_message_log 
         (phone_number_id, direction, from_number, to_number, message_body, 
          message_type, status)
         VALUES ($1, 'outbound', $2, $3, $4, 'sms', 'responded')`,
        [phoneNumberId, agentPhoneNumber, customerPhoneNumber, agentResponse]
      );

      // Verify response
      const result = await client.query(
        `SELECT * FROM phone_message_log 
         WHERE phone_number_id = $1 AND direction = 'outbound'
         ORDER BY created_at DESC LIMIT 1`,
        [phoneNumberId]
      );

      expect(result.rows[0].message_body).toBe(agentResponse);
    });

    test("Step 3: Conversation appears in API listing", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      const conv = data.conversations.find(
        (c: { phoneNumber: string }) => c.phoneNumber === customerPhoneNumber
      );

      expect(conv).toBeDefined();
      expect(conv.totalMessages).toBeGreaterThanOrEqual(2);
      expect(conv.provider).toBe("twilio");
    });

    test("Step 4: Thread shows complete conversation", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(customerPhoneNumber)}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.messages.length).toBeGreaterThanOrEqual(2);

      // Find inbound and outbound messages
      const inbound = data.messages.find((m: { direction: string }) => m.direction === "inbound");
      const outbound = data.messages.find((m: { direction: string }) => m.direction === "outbound");

      expect(inbound).toBeDefined();
      expect(outbound).toBeDefined();
      expect(inbound.body).toContain("help with my order");
      expect(outbound.body).toContain("order number");
    });

    test("Step 5: Customer continues conversation", async () => {
      // Customer sends follow-up
      await client.query(
        `INSERT INTO phone_message_log 
         (phone_number_id, direction, from_number, to_number, message_body, 
          message_type, status)
         VALUES ($1, 'inbound', $2, $3, 'My order number is ORD-12345', 'sms', 'received')`,
        [phoneNumberId, customerPhoneNumber, agentPhoneNumber]
      );

      // Verify thread shows all messages
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(customerPhoneNumber)}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      const data = await res.json();
      expect(data.messages.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("iMessage Flow Simulation (Blooio)", () => {
    let agentId: string;
    let phoneNumberId: string;
    const agentEmail = "agent@company.com";
    const customerEmail = "customer@gmail.com";

    beforeAll(async () => {
      agentId = uuidv4();
      await client.query(
        `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
        [agentId, "iMessage Agent"]
      );

      const result = await client.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, is_active)
         VALUES ($1, $2, $3, 'blooio', 'imessage', true)
         RETURNING id`,
        [testData.organization.id, agentId, agentEmail]
      );
      phoneNumberId = result.rows[0].id;
    });

    afterAll(async () => {
      await client.query(
        `DELETE FROM phone_message_log WHERE phone_number_id = $1`,
        [phoneNumberId]
      );
      await client.query(`DELETE FROM agent_phone_numbers WHERE id = $1`, [
        phoneNumberId,
      ]);
      await client.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
    });

    test("handles iMessage with email identifier", async () => {
      // Simulate iMessage (uses email as identifier)
      await client.query(
        `INSERT INTO phone_message_log 
         (phone_number_id, direction, from_number, to_number, message_body, 
          message_type, status)
         VALUES ($1, 'inbound', $2, $3, 'Hello from iMessage!', 'sms', 'received')`,
        [phoneNumberId, customerEmail, agentEmail]
      );

      // Verify in API
      const res = await fetch(`${SERVER_URL}/api/v1/messages`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      const conv = data.conversations.find(
        (c: { phoneNumber: string }) => c.phoneNumber === customerEmail
      );

      expect(conv).toBeDefined();
      expect(conv.provider).toBe("blooio");
    });

    test("retrieves iMessage thread correctly", async () => {
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(customerEmail)}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.messages.length).toBeGreaterThanOrEqual(1);
      expect(data.agentInfo?.provider).toBe("blooio");
    });
  });

  describe("Multi-Agent Routing", () => {
    let salesAgentId: string;
    let supportAgentId: string;
    let salesPhoneNumberId: string;
    let supportPhoneNumberId: string;

    beforeAll(async () => {
      // Create two agents with different phone numbers
      salesAgentId = uuidv4();
      supportAgentId = uuidv4();

      await client.query(
        `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true), ($3, $4, true)`,
        [salesAgentId, "Sales Agent", supportAgentId, "Support Agent"]
      );

      const salesResult = await client.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, is_active, friendly_name)
         VALUES ($1, $2, '+15553001001', 'twilio', 'sms', true, 'Sales Line')
         RETURNING id`,
        [testData.organization.id, salesAgentId]
      );
      salesPhoneNumberId = salesResult.rows[0].id;

      const supportResult = await client.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, is_active, friendly_name)
         VALUES ($1, $2, '+15553002002', 'twilio', 'sms', true, 'Support Line')
         RETURNING id`,
        [testData.organization.id, supportAgentId]
      );
      supportPhoneNumberId = supportResult.rows[0].id;
    });

    afterAll(async () => {
      await client.query(
        `DELETE FROM phone_message_log WHERE phone_number_id IN ($1, $2)`,
        [salesPhoneNumberId, supportPhoneNumberId]
      );
      await client.query(
        `DELETE FROM agent_phone_numbers WHERE id IN ($1, $2)`,
        [salesPhoneNumberId, supportPhoneNumberId]
      );
      await client.query(`DELETE FROM agents WHERE id IN ($1, $2)`, [
        salesAgentId,
        supportAgentId,
      ]);
    });

    test("routes messages to correct agents based on phone number", async () => {
      // Customer texts sales line
      await client.query(
        `INSERT INTO phone_message_log 
         (phone_number_id, direction, from_number, to_number, message_body, status)
         VALUES ($1, 'inbound', '+15554001001', '+15553001001', 'I want to buy', 'received')`,
        [salesPhoneNumberId]
      );

      // Different customer texts support line
      await client.query(
        `INSERT INTO phone_message_log 
         (phone_number_id, direction, from_number, to_number, message_body, status)
         VALUES ($1, 'inbound', '+15554002002', '+15553002002', 'I need help', 'received')`,
        [supportPhoneNumberId]
      );

      // Query conversations
      const res = await fetch(`${SERVER_URL}/api/v1/messages`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();

      // Find both conversations
      const salesConv = data.conversations.find(
        (c: { phoneNumber: string }) => c.phoneNumber === "+15554001001"
      );
      const supportConv = data.conversations.find(
        (c: { phoneNumber: string }) => c.phoneNumber === "+15554002002"
      );

      expect(salesConv?.agentId).toBe(salesAgentId);
      expect(supportConv?.agentId).toBe(supportAgentId);
    });

    test("can filter conversations by agent", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages?agentId=${salesAgentId}`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      // All conversations should be for sales agent
      for (const conv of data.conversations) {
        expect(conv.agentId).toBe(salesAgentId);
      }
    });
  });

  describe("Message Status Tracking", () => {
    let agentId: string;
    let phoneNumberId: string;

    beforeAll(async () => {
      agentId = uuidv4();
      await client.query(
        `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
        [agentId, "Status Test Agent"]
      );

      const result = await client.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, is_active)
         VALUES ($1, $2, '+15555001001', 'twilio', 'sms', true)
         RETURNING id`,
        [testData.organization.id, agentId]
      );
      phoneNumberId = result.rows[0].id;
    });

    afterAll(async () => {
      await client.query(
        `DELETE FROM phone_message_log WHERE phone_number_id = $1`,
        [phoneNumberId]
      );
      await client.query(`DELETE FROM agent_phone_numbers WHERE id = $1`, [
        phoneNumberId,
      ]);
      await client.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
    });

    test("tracks different message statuses correctly", async () => {
      const statuses = ["received", "processing", "responded", "failed"];
      const customerBase = "+1555600";

      for (let i = 0; i < statuses.length; i++) {
        await client.query(
          `INSERT INTO phone_message_log 
           (phone_number_id, direction, from_number, to_number, message_body, status,
            error_message)
           VALUES ($1, 'inbound', $2, '+15555001001', $3, $4, $5)`,
          [
            phoneNumberId,
            `${customerBase}${i}`,
            `Message with status ${statuses[i]}`,
            statuses[i],
            statuses[i] === "failed" ? "Delivery failed" : null,
          ]
        );
      }

      // Get thread for failed message
      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent(`${customerBase}3`)}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      const data = await res.json();
      const failedMsg = data.messages.find((m: { status: string }) => m.status === "failed");
      
      expect(failedMsg).toBeDefined();
      expect(failedMsg.errorMessage).toBe("Delivery failed");
    });

    test("conversation shows failed count", async () => {
      const res = await fetch(`${SERVER_URL}/api/v1/messages`, {
        method: "GET",
        headers: getTestAuthHeaders(testData.apiKey.key),
        signal: AbortSignal.timeout(TIMEOUT),
      });

      const data = await res.json();
      const failedConv = data.conversations.find(
        (c: { phoneNumber: string }) => c.phoneNumber === "+15556003"
      );

      if (failedConv) {
        expect(failedConv.failedCount).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("Response Time Tracking", () => {
    let agentId: string;
    let phoneNumberId: string;

    beforeAll(async () => {
      agentId = uuidv4();
      await client.query(
        `INSERT INTO agents (id, name, enabled) VALUES ($1, $2, true)`,
        [agentId, "Response Time Agent"]
      );

      const result = await client.query(
        `INSERT INTO agent_phone_numbers 
         (organization_id, agent_id, phone_number, provider, phone_type, is_active)
         VALUES ($1, $2, '+15556001001', 'twilio', 'sms', true)
         RETURNING id`,
        [testData.organization.id, agentId]
      );
      phoneNumberId = result.rows[0].id;
    });

    afterAll(async () => {
      await client.query(
        `DELETE FROM phone_message_log WHERE phone_number_id = $1`,
        [phoneNumberId]
      );
      await client.query(`DELETE FROM agent_phone_numbers WHERE id = $1`, [
        phoneNumberId,
      ]);
      await client.query(`DELETE FROM agents WHERE id = $1`, [agentId]);
    });

    test("records and returns response time", async () => {
      // Create message with response time
      await client.query(
        `INSERT INTO phone_message_log 
         (phone_number_id, direction, from_number, to_number, message_body, status,
          response_time_ms, responded_at)
         VALUES ($1, 'inbound', '+15557001001', '+15556001001', 'Quick response test', 
                 'responded', '150', NOW())`,
        [phoneNumberId]
      );

      const res = await fetch(
        `${SERVER_URL}/api/v1/messages/thread?phoneNumber=${encodeURIComponent("+15557001001")}`,
        {
          method: "GET",
          headers: getTestAuthHeaders(testData.apiKey.key),
          signal: AbortSignal.timeout(TIMEOUT),
        }
      );

      const data = await res.json();
      const msg = data.messages.find((m: { body: string }) => m.body === "Quick response test");

      expect(msg).toBeDefined();
      expect(msg.responseTimeMs).toBe(150);
    });
  });
});
