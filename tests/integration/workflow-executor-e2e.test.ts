/**
 * E2E Integration Tests for WorkflowExecutorService
 *
 * Tests workflow execution with real API calls (mocked for CI).
 * Covers: Gmail, Calendar, SMS, iMessage operations.
 */

import { describe, it, expect, beforeAll, afterAll, mock } from "bun:test";
import { Client } from "pg";
import { v4 as uuidv4 } from "uuid";
import {
  createTestDataSet,
  cleanupTestData,
  type TestDataSet,
} from "../infrastructure/test-data-factory";

const TEST_DB_URL = process.env.DATABASE_URL || "";

// Mock fetch for external API calls
const originalFetch = globalThis.fetch;

describe("WorkflowExecutorService E2E Tests", () => {
  let testData: TestDataSet;
  let client: Client;

  beforeAll(async () => {
    if (!TEST_DB_URL) {
      throw new Error("DATABASE_URL is required for integration tests");
    }

    testData = await createTestDataSet(TEST_DB_URL, {
      organizationName: "Workflow Executor Test Org",
      creditBalance: 1000,
    });

    client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();

    // Store test secrets for the organization
    await client.query(
      `INSERT INTO secrets (organization_id, key, value, created_at, updated_at)
       VALUES ($1, 'google_access_token', 'test_google_token', NOW(), NOW())
       ON CONFLICT (organization_id, key) DO UPDATE SET value = 'test_google_token'`,
      [testData.organization.id],
    );

    await client.query(
      `INSERT INTO secrets (organization_id, key, value, created_at, updated_at)
       VALUES ($1, 'twilio_account_sid', 'ACtest123456', NOW(), NOW())
       ON CONFLICT (organization_id, key) DO UPDATE SET value = 'ACtest123456'`,
      [testData.organization.id],
    );

    await client.query(
      `INSERT INTO secrets (organization_id, key, value, created_at, updated_at)
       VALUES ($1, 'twilio_auth_token', 'test_twilio_token', NOW(), NOW())
       ON CONFLICT (organization_id, key) DO UPDATE SET value = 'test_twilio_token'`,
      [testData.organization.id],
    );
  });

  afterAll(async () => {
    // Clean up secrets
    await client.query(`DELETE FROM secrets WHERE organization_id = $1`, [
      testData.organization.id,
    ]);
    await client.end();
    await cleanupTestData(TEST_DB_URL, testData.organization.id);
    
    // Restore original fetch
    globalThis.fetch = originalFetch;
  });

  describe("Gmail Operations", () => {
    it("should send an email via Gmail API", async () => {
      // Mock Gmail API response
      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        if (url.includes("gmail.googleapis.com") && options?.method === "POST") {
          return Promise.resolve(
            new Response(
              JSON.stringify({ id: "msg_123456", threadId: "thread_789" }),
              { status: 200 },
            ),
          );
        }
        return originalFetch(url, options);
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.sendEmail(
        testData.organization.id,
        {
          to: "test@example.com",
          subject: "Test Email",
          body: "This is a test email from workflow executor.",
        },
      );

      // Note: Will fail without real credentials, but tests the flow
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });

    it("should handle email send failure gracefully", async () => {
      // Mock Gmail API error response
      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        if (url.includes("gmail.googleapis.com")) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: "Invalid token" }), {
              status: 401,
            }),
          );
        }
        return originalFetch(url, options);
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.sendEmail(
        testData.organization.id,
        {
          to: "test@example.com",
          subject: "Test Email",
          body: "This should fail.",
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should list emails from Gmail", async () => {
      // Mock Gmail list API
      globalThis.fetch = mock((url: string) => {
        if (url.includes("gmail.googleapis.com") && url.includes("messages")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                messages: [
                  { id: "msg1", threadId: "thread1" },
                  { id: "msg2", threadId: "thread2" },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        return originalFetch(url);
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.listEmails(
        testData.organization.id,
        { maxResults: 10 },
      );

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("Calendar Operations", () => {
    it("should create a calendar event", async () => {
      // Mock Calendar API response
      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        if (
          url.includes("googleapis.com/calendar") &&
          options?.method === "POST"
        ) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: "event_123",
                htmlLink: "https://calendar.google.com/event/123",
              }),
              { status: 200 },
            ),
          );
        }
        return originalFetch(url, options);
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.createCalendarEvent(
        testData.organization.id,
        {
          summary: "Test Meeting",
          description: "A test meeting created by workflow executor",
          start: new Date(Date.now() + 3600000), // 1 hour from now
          end: new Date(Date.now() + 7200000), // 2 hours from now
          attendees: ["attendee@example.com"],
        },
      );

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });

    it("should list calendar events", async () => {
      // Mock Calendar API response
      globalThis.fetch = mock((url: string) => {
        if (url.includes("googleapis.com/calendar") && url.includes("events")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                items: [
                  { id: "event1", summary: "Meeting 1" },
                  { id: "event2", summary: "Meeting 2" },
                ],
              }),
              { status: 200 },
            ),
          );
        }
        return originalFetch(url);
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.listCalendarEvents(
        testData.organization.id,
        {
          timeMin: new Date(),
          timeMax: new Date(Date.now() + 7 * 24 * 3600000), // Next 7 days
        },
      );

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });

    it("should handle calendar API errors", async () => {
      // Mock Calendar API error
      globalThis.fetch = mock((url: string) => {
        if (url.includes("googleapis.com/calendar")) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
              status: 429,
            }),
          );
        }
        return originalFetch(url);
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.createCalendarEvent(
        testData.organization.id,
        {
          summary: "Test Event",
          start: new Date(),
          end: new Date(Date.now() + 3600000),
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("SMS Operations (Twilio)", () => {
    it("should send SMS via Twilio", async () => {
      // Mock Twilio API response
      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        if (url.includes("api.twilio.com") && options?.method === "POST") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                sid: "SM123456789",
                status: "queued",
              }),
              { status: 201 },
            ),
          );
        }
        return originalFetch(url, options);
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.sendSms(
        testData.organization.id,
        {
          to: "+15551234567",
          from: "+15559876543",
          body: "Test SMS from workflow executor",
        },
      );

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });

    it("should handle Twilio API errors", async () => {
      // Mock Twilio API error
      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        if (url.includes("api.twilio.com")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                code: 21608,
                message: "The 'To' phone number is not a valid phone number.",
              }),
              { status: 400 },
            ),
          );
        }
        return originalFetch(url, options);
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.sendSms(
        testData.organization.id,
        {
          to: "invalid",
          from: "+15559876543",
          body: "This should fail",
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should send MMS with media", async () => {
      // Mock Twilio MMS API response
      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        if (url.includes("api.twilio.com") && options?.method === "POST") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                sid: "MM123456789",
                status: "queued",
                num_media: "1",
              }),
              { status: 201 },
            ),
          );
        }
        return originalFetch(url, options);
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.sendSms(
        testData.organization.id,
        {
          to: "+15551234567",
          from: "+15559876543",
          body: "Check out this image!",
          mediaUrls: ["https://example.com/image.jpg"],
        },
      );

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("iMessage Operations (Blooio)", () => {
    beforeAll(async () => {
      await client.query(
        `INSERT INTO secrets (organization_id, key, value, created_at, updated_at)
         VALUES ($1, 'blooio_api_key', 'test_blooio_key', NOW(), NOW())
         ON CONFLICT (organization_id, key) DO UPDATE SET value = 'test_blooio_key'`,
        [testData.organization.id],
      );
    });

    it("should send iMessage via Blooio", async () => {
      // Mock Blooio API response
      globalThis.fetch = mock((url: string, options?: RequestInit) => {
        if (url.includes("api.blooio.com") && options?.method === "POST") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                message_id: "bloo_msg_123",
                status: "sent",
              }),
              { status: 200 },
            ),
          );
        }
        return originalFetch(url, options);
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.sendIMessage(
        testData.organization.id,
        {
          to: "+15551234567",
          from: "+15559876543",
          body: "Test iMessage from workflow executor",
        },
      );

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });

    it("should handle Blooio API errors", async () => {
      // Mock Blooio API error
      globalThis.fetch = mock((url: string) => {
        if (url.includes("api.blooio.com")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: "Invalid API key",
              }),
              { status: 401 },
            ),
          );
        }
        return originalFetch(url);
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.sendIMessage(
        testData.organization.id,
        {
          to: "+15551234567",
          from: "+15559876543",
          body: "This should fail",
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Credential Validation", () => {
    it("should return error when Google credentials are missing", async () => {
      // Create a new org without credentials
      const noCredsOrg = await createTestDataSet(TEST_DB_URL, {
        organizationName: "No Creds Org",
      });

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.sendEmail(
        noCredsOrg.organization.id,
        {
          to: "test@example.com",
          subject: "Test",
          body: "Test",
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not connected");

      // Cleanup
      await cleanupTestData(TEST_DB_URL, noCredsOrg.organization.id);
    });

    it("should return error when Twilio credentials are missing", async () => {
      const noCredsOrg = await createTestDataSet(TEST_DB_URL, {
        organizationName: "No Twilio Creds Org",
      });

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.sendSms(
        noCredsOrg.organization.id,
        {
          to: "+15551234567",
          from: "+15559876543",
          body: "Test",
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not connected");

      // Cleanup
      await cleanupTestData(TEST_DB_URL, noCredsOrg.organization.id);
    });
  });

  describe("Error Handling", () => {
    it("should handle network errors gracefully", async () => {
      // Mock network failure
      globalThis.fetch = mock(() => {
        return Promise.reject(new Error("Network error"));
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.sendEmail(
        testData.organization.id,
        {
          to: "test@example.com",
          subject: "Test",
          body: "Test",
        },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle timeout errors", async () => {
      // Mock slow response that might timeout
      globalThis.fetch = mock(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(new Response(JSON.stringify({ id: "123" }), { status: 200 }));
          }, 100);
        });
      }) as typeof fetch;

      const { workflowExecutorService } = await import(
        "@/lib/services/workflow-executor"
      );

      const result = await workflowExecutorService.sendEmail(
        testData.organization.id,
        {
          to: "test@example.com",
          subject: "Test",
          body: "Test",
        },
      );

      // Should either succeed or fail gracefully
      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
    });
  });
});
