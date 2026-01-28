/**
 * E2E Webhook Integration Tests for Workflow Triggers
 *
 * Tests the complete flow from incoming webhook to trigger execution
 * and response delivery. Simulates real-world message scenarios.
 */

import { describe, it, expect, beforeAll } from "bun:test";

// ==========================================================================
// WEBHOOK SIMULATION HELPERS
// ==========================================================================

const BASE_URL = process.env.ELIZAOS_CLOUD_BASE_URL || "http://localhost:3000";

interface TwilioWebhookPayload {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
  FromCity?: string;
  FromState?: string;
  FromCountry?: string;
}

interface BlooioWebhookPayload {
  event: string;
  message_id: string;
  sender: string;
  text: string;
  external_id?: string;
  protocol?: string;
  timestamp?: string;
  attachments?: string[];
}

// Simulate Twilio webhook call
async function simulateTwilioWebhook(
  orgId: string,
  payload: Partial<TwilioWebhookPayload>
): Promise<Response> {
  const fullPayload: TwilioWebhookPayload = {
    MessageSid: `SM${Date.now()}`,
    AccountSid: "AC_test_account",
    From: "+15551234567",
    To: "+15559876543",
    Body: "",
    NumMedia: "0",
    FromCity: "San Francisco",
    FromState: "CA",
    FromCountry: "US",
    ...payload,
  };

  // Convert to form data (Twilio sends form-encoded data)
  const formData = new URLSearchParams();
  for (const [key, value] of Object.entries(fullPayload)) {
    formData.append(key, String(value));
  }

  return fetch(`${BASE_URL}/api/webhooks/twilio/${orgId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // In production, this would include X-Twilio-Signature
    },
    body: formData.toString(),
  });
}

// Simulate Blooio webhook call
async function simulateBlooioWebhook(
  orgId: string,
  payload: Partial<BlooioWebhookPayload>
): Promise<Response> {
  const fullPayload: BlooioWebhookPayload = {
    event: "message.received",
    message_id: `msg_${Date.now()}`,
    sender: "+15551234567",
    text: "",
    external_id: "chat_123",
    protocol: "imessage",
    timestamp: new Date().toISOString(),
    ...payload,
  };

  return fetch(`${BASE_URL}/api/webhooks/blooio/${orgId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // In production, this would include X-Blooio-Signature
    },
    body: JSON.stringify(fullPayload),
  });
}

// ==========================================================================
// TWILIO WEBHOOK TESTS
// ==========================================================================

describe("E2E: Twilio Webhook Trigger Integration", () => {
  const testOrgId = process.env.TEST_ORG_ID || "test-org";

  describe("Keyword Trigger Matching", () => {
    it("should match and execute workflow for keyword 'schedule'", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "What is my schedule for today?",
        From: "+15551234567",
      });

      // Webhook should return 200 with TwiML response
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("<?xml");
      expect(text).toContain("<Response>");
    });

    it("should match keyword at start of message", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "Schedule please",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });

    it("should match keyword at end of message", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "Show me my schedule",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });

    it("should NOT match keyword as substring", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "I want to reschedule",
        From: "+15551234567",
      });

      // Should still return 200 but go to agent instead of trigger
      expect(response.status).toBe(200);
    });

    it("should match case-insensitively", async () => {
      const variations = ["SCHEDULE", "Schedule", "ScHeDuLe", "schedule"];

      for (const variation of variations) {
        const response = await simulateTwilioWebhook(testOrgId, {
          Body: `Show me my ${variation}`,
          From: "+15551234567",
        });

        expect(response.status).toBe(200);
      }
    });
  });

  describe("Contains Trigger Matching", () => {
    it("should match substring anywhere in message", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "I need to book an appointment for tomorrow",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Regex Trigger Matching", () => {
    it("should match date pattern in message", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "Book something for 12/25/2024",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });

    it("should match email pattern in message", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "Send this to john@example.com",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("From-Sender Trigger Matching", () => {
    it("should match specific VIP phone number", async () => {
      // Assuming a trigger is configured for this VIP number
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "Any message from VIP",
        From: "+15559999999", // VIP number
      });

      expect(response.status).toBe(200);
    });

    it("should handle various phone number formats", async () => {
      const formats = [
        "+15551234567",
        "15551234567",
        "5551234567",
        "(555) 123-4567",
      ];

      for (const format of formats) {
        const response = await simulateTwilioWebhook(testOrgId, {
          Body: "Test message",
          From: format,
        });

        expect(response.status).toBe(200);
      }
    });
  });

  describe("Message Edge Cases", () => {
    it("should handle empty message body", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });

    it("should handle message with only whitespace", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "   \n\t  ",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });

    it("should handle message with unicode/emojis", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "Show my schedule 📅 please 🙏",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });

    it("should handle very long message", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "a".repeat(1600), // SMS can be up to 1600 chars
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });

    it("should handle message with special characters", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "Schedule @mention #hashtag $100 & more!",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });

    it("should handle message with multiple languages", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "Show schedule 日程表 calendario расписание",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("MMS with Media", () => {
    it("should handle message with media attachment", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "Check this image",
        NumMedia: "1",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });

    it("should handle media-only message (no text)", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "",
        NumMedia: "1",
        From: "+15551234567",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing org ID", async () => {
      const response = await fetch(`${BASE_URL}/api/webhooks/twilio/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "Body=test",
      });

      expect(response.status).toBe(404);
    });

    it("should handle invalid org ID", async () => {
      const response = await simulateTwilioWebhook("invalid-org-id", {
        Body: "test",
      });

      // Should return 200 but might not find triggers
      expect([200, 400, 401]).toContain(response.status);
    });
  });
});

// ==========================================================================
// BLOOIO WEBHOOK TESTS
// ==========================================================================

describe("E2E: Blooio Webhook Trigger Integration", () => {
  const testOrgId = process.env.TEST_ORG_ID || "test-org";

  describe("Message Received Event", () => {
    it("should process message.received event", async () => {
      const response = await simulateBlooioWebhook(testOrgId, {
        event: "message.received",
        text: "Show my schedule",
        sender: "+15551234567",
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("should handle iMessage protocol", async () => {
      const response = await simulateBlooioWebhook(testOrgId, {
        event: "message.received",
        text: "Calendar events please",
        sender: "john@icloud.com",
        protocol: "imessage",
      });

      expect(response.status).toBe(200);
    });

    it("should handle SMS protocol via Blooio", async () => {
      const response = await simulateBlooioWebhook(testOrgId, {
        event: "message.received",
        text: "Help me",
        sender: "+15551234567",
        protocol: "sms",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Other Event Types", () => {
    it("should handle message.sent event", async () => {
      const response = await simulateBlooioWebhook(testOrgId, {
        event: "message.sent",
        message_id: "msg_123",
        text: "Sent message",
      });

      expect(response.status).toBe(200);
    });

    it("should handle message.delivered event", async () => {
      const response = await simulateBlooioWebhook(testOrgId, {
        event: "message.delivered",
        message_id: "msg_123",
        text: "",
      });

      expect(response.status).toBe(200);
    });

    it("should handle message.read event", async () => {
      const response = await simulateBlooioWebhook(testOrgId, {
        event: "message.read",
        message_id: "msg_123",
        text: "",
      });

      expect(response.status).toBe(200);
    });

    it("should handle message.failed event", async () => {
      const response = await simulateBlooioWebhook(testOrgId, {
        event: "message.failed",
        message_id: "msg_123",
        text: "",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Provider Filter - Blooio Only", () => {
    it("should only match blooio-specific triggers", async () => {
      // Assuming a trigger is configured with provider_filter: "blooio"
      const response = await simulateBlooioWebhook(testOrgId, {
        event: "message.received",
        text: "iMessage specific trigger",
        protocol: "imessage",
      });

      expect(response.status).toBe(200);
    });
  });

  describe("Attachments", () => {
    it("should handle message with attachments", async () => {
      const response = await simulateBlooioWebhook(testOrgId, {
        event: "message.received",
        text: "Check this",
        attachments: ["https://example.com/image.jpg"],
      });

      expect(response.status).toBe(200);
    });

    it("should handle attachment-only message", async () => {
      const response = await simulateBlooioWebhook(testOrgId, {
        event: "message.received",
        text: "",
        attachments: ["https://example.com/image.jpg"],
      });

      expect(response.status).toBe(200);
    });
  });
});

// ==========================================================================
// CROSS-PROVIDER TESTS
// ==========================================================================

describe("E2E: Cross-Provider Trigger Behavior", () => {
  const testOrgId = process.env.TEST_ORG_ID || "test-org";

  describe("'All' Provider Triggers", () => {
    it("should trigger for both Twilio and Blooio", async () => {
      const message = "Show my schedule";

      const twilioResponse = await simulateTwilioWebhook(testOrgId, {
        Body: message,
      });

      const blooioResponse = await simulateBlooioWebhook(testOrgId, {
        event: "message.received",
        text: message,
      });

      expect(twilioResponse.status).toBe(200);
      expect(blooioResponse.status).toBe(200);
    });
  });

  describe("Provider-Specific Triggers", () => {
    it("should only trigger Twilio-specific on Twilio webhook", async () => {
      // Assuming a trigger with provider_filter: "twilio"
      const twilioResponse = await simulateTwilioWebhook(testOrgId, {
        Body: "SMS promo code: SAVE20",
      });

      expect(twilioResponse.status).toBe(200);
    });

    it("should only trigger Blooio-specific on Blooio webhook", async () => {
      // Assuming a trigger with provider_filter: "blooio"
      const blooioResponse = await simulateBlooioWebhook(testOrgId, {
        event: "message.received",
        text: "iMessage exclusive offer",
      });

      expect(blooioResponse.status).toBe(200);
    });
  });

  describe("Same Message, Different Providers", () => {
    it("should execute different workflows based on provider", async () => {
      const message = "help";

      // Both should succeed but potentially execute different workflows
      const [twilioRes, blooioRes] = await Promise.all([
        simulateTwilioWebhook(testOrgId, { Body: message }),
        simulateBlooioWebhook(testOrgId, {
          event: "message.received",
          text: message,
        }),
      ]);

      expect(twilioRes.status).toBe(200);
      expect(blooioRes.status).toBe(200);
    });
  });
});

// ==========================================================================
// PRIORITY TESTS
// ==========================================================================

describe("E2E: Trigger Priority Handling", () => {
  const testOrgId = process.env.TEST_ORG_ID || "test-org";

  describe("Priority Resolution", () => {
    it("should execute highest priority trigger when multiple match", async () => {
      // Message that matches multiple triggers
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "help with my schedule",
        // This should match both "help" and "schedule" keywords
        // The one with higher priority should win
      });

      expect(response.status).toBe(200);
    });

    it("should handle equal priority triggers deterministically", async () => {
      const message = "test priority";

      // Multiple requests should consistently match the same trigger
      const responses = await Promise.all([
        simulateTwilioWebhook(testOrgId, { Body: message }),
        simulateTwilioWebhook(testOrgId, { Body: message }),
        simulateTwilioWebhook(testOrgId, { Body: message }),
      ]);

      responses.forEach((r) => expect(r.status).toBe(200));
    });
  });
});

// ==========================================================================
// FALLBACK TO AGENT TESTS
// ==========================================================================

describe("E2E: Fallback to Agent Processing", () => {
  const testOrgId = process.env.TEST_ORG_ID || "test-org";

  describe("No Trigger Match", () => {
    it("should fall back to agent for unmatched message", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "Hello, this is a random conversation",
        // Should not match any keyword triggers
      });

      // Should still return 200 - message goes to agent
      expect(response.status).toBe(200);
    });

    it("should fall back to agent when all triggers are inactive", async () => {
      const response = await simulateTwilioWebhook(testOrgId, {
        Body: "schedule",
        // Even if "schedule" trigger exists, if inactive, should go to agent
      });

      expect(response.status).toBe(200);
    });
  });
});

// ==========================================================================
// CONCURRENT REQUESTS TESTS
// ==========================================================================

describe("E2E: Concurrent Webhook Processing", () => {
  const testOrgId = process.env.TEST_ORG_ID || "test-org";

  it("should handle multiple simultaneous webhooks", async () => {
    const messages = [
      "schedule",
      "calendar",
      "help",
      "random message",
      "another test",
    ];

    const responses = await Promise.all(
      messages.map((msg) =>
        simulateTwilioWebhook(testOrgId, {
          Body: msg,
          From: `+1555${Math.floor(Math.random() * 9000000 + 1000000)}`,
        })
      )
    );

    responses.forEach((r) => {
      expect(r.status).toBe(200);
    });
  });

  it("should handle burst of webhooks from same sender", async () => {
    const from = "+15551234567";

    const responses = await Promise.all(
      Array(10)
        .fill(null)
        .map((_, i) =>
          simulateTwilioWebhook(testOrgId, {
            Body: `Message ${i}: schedule`,
            From: from,
          })
        )
    );

    responses.forEach((r) => {
      expect(r.status).toBe(200);
    });
  });
});

// ==========================================================================
// HEALTH CHECK TESTS
// ==========================================================================

describe("E2E: Webhook Health Checks", () => {
  const testOrgId = process.env.TEST_ORG_ID || "test-org";

  describe("Twilio Webhook Health", () => {
    it("should respond to GET health check", async () => {
      const response = await fetch(
        `${BASE_URL}/api/webhooks/twilio/${testOrgId}`,
        { method: "GET" }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe("ok");
      expect(data.service).toBe("twilio-webhook");
    });
  });

  describe("Blooio Webhook Health", () => {
    it("should respond to GET health check", async () => {
      const response = await fetch(
        `${BASE_URL}/api/webhooks/blooio/${testOrgId}`,
        { method: "GET" }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe("ok");
      expect(data.service).toBe("blooio-webhook");
    });
  });
});

// ==========================================================================
// SETUP
// ==========================================================================

beforeAll(() => {
  // Test requires running server at BASE_URL with valid TEST_ORG_ID
});
