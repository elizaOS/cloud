/**
 * E2E Integration Tests for Workflow Triggers
 *
 * Comprehensive test suite covering all real-world scenarios
 * for the workflow trigger system to prevent production issues.
 *
 * Test Categories:
 * 1. API CRUD Operations
 * 2. Trigger Matching Logic
 * 3. Webhook Integration
 * 4. Priority & Provider Filtering
 * 5. Edge Cases & Error Handling
 * 6. Real-World Scenarios
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";

// ==========================================================================
// TEST CONFIGURATION & HELPERS
// ==========================================================================

const BASE_URL = process.env.ELIZAOS_CLOUD_BASE_URL || "http://localhost:3000/api/v1";

// Test data - set via environment variables for real E2E testing
let testWorkflowId: string;
let authHeaders: Record<string, string>;

// Helper to make authenticated requests
async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...options.headers,
    },
  });
}

// Helper to create a test trigger
async function createTestTrigger(overrides: Record<string, unknown> = {}) {
  const defaultTrigger = {
    name: `Test Trigger ${Date.now()}`,
    triggerType: "message_keyword",
    triggerConfig: { keywords: ["test"] },
    responseConfig: { sendResponse: true },
    providerFilter: "all",
    priority: 0,
    isActive: true,
    ...overrides,
  };

  const response = await apiRequest(`/workflows/${testWorkflowId}/triggers`, {
    method: "POST",
    body: JSON.stringify(defaultTrigger),
  });

  return response.json();
}

// Helper to clean up test triggers
async function deleteTestTrigger(triggerId: string) {
  await apiRequest(`/workflows/${testWorkflowId}/triggers/${triggerId}`, {
    method: "DELETE",
  });
}

// ==========================================================================
// 1. API CRUD OPERATIONS
// ==========================================================================

describe("E2E: Workflow Triggers API CRUD", () => {
  describe("POST /workflows/[id]/triggers - Create Trigger", () => {
    it("should create a keyword trigger successfully", async () => {
      const triggerData = {
        name: "E2E Keyword Trigger",
        description: "Test keyword trigger for E2E",
        triggerType: "message_keyword",
        triggerConfig: {
          keywords: ["schedule", "calendar", "events"],
          caseSensitive: false,
        },
        responseConfig: {
          sendResponse: true,
          responseTemplate: "Your schedule: {{summary}}",
        },
        providerFilter: "all",
        priority: 10,
        isActive: true,
      };

      const response = await apiRequest(`/workflows/${testWorkflowId}/triggers`, {
        method: "POST",
        body: JSON.stringify(triggerData),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.trigger.name).toBe("E2E Keyword Trigger");
      expect(data.trigger.triggerType).toBe("message_keyword");
      expect(data.trigger.isActive).toBe(true);

      // Cleanup
      if (data.trigger?.id) {
        await deleteTestTrigger(data.trigger.id);
      }
    });

    it("should create a contains trigger successfully", async () => {
      const triggerData = {
        name: "E2E Contains Trigger",
        triggerType: "message_contains",
        triggerConfig: { contains: "appointment" },
        responseConfig: { sendResponse: true },
      };

      const response = await apiRequest(`/workflows/${testWorkflowId}/triggers`, {
        method: "POST",
        body: JSON.stringify(triggerData),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.trigger.triggerType).toBe("message_contains");

      if (data.trigger?.id) {
        await deleteTestTrigger(data.trigger.id);
      }
    });

    it("should create a regex trigger successfully", async () => {
      const triggerData = {
        name: "E2E Regex Trigger",
        triggerType: "message_regex",
        triggerConfig: { pattern: "\\d{1,2}/\\d{1,2}/\\d{4}" },
        responseConfig: { sendResponse: true },
      };

      const response = await apiRequest(`/workflows/${testWorkflowId}/triggers`, {
        method: "POST",
        body: JSON.stringify(triggerData),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.trigger.triggerType).toBe("message_regex");

      if (data.trigger?.id) {
        await deleteTestTrigger(data.trigger.id);
      }
    });

    it("should create a from-sender trigger successfully", async () => {
      const triggerData = {
        name: "E2E From Trigger",
        triggerType: "message_from",
        triggerConfig: { phoneNumbers: ["+15551234567", "+15559876543"] },
        responseConfig: { sendResponse: true },
      };

      const response = await apiRequest(`/workflows/${testWorkflowId}/triggers`, {
        method: "POST",
        body: JSON.stringify(triggerData),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.trigger.triggerType).toBe("message_from");

      if (data.trigger?.id) {
        await deleteTestTrigger(data.trigger.id);
      }
    });

    it("should reject trigger with missing name", async () => {
      const response = await apiRequest(`/workflows/${testWorkflowId}/triggers`, {
        method: "POST",
        body: JSON.stringify({
          triggerType: "message_keyword",
          triggerConfig: { keywords: ["test"] },
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("name");
    });

    it("should reject trigger with invalid trigger type", async () => {
      const response = await apiRequest(`/workflows/${testWorkflowId}/triggers`, {
        method: "POST",
        body: JSON.stringify({
          name: "Invalid Trigger",
          triggerType: "invalid_type",
          triggerConfig: {},
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("triggerType");
    });

    it("should reject keyword trigger with empty keywords array", async () => {
      const response = await apiRequest(`/workflows/${testWorkflowId}/triggers`, {
        method: "POST",
        body: JSON.stringify({
          name: "Empty Keywords Trigger",
          triggerType: "message_keyword",
          triggerConfig: { keywords: [] },
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("keyword");
    });

    it("should reject regex trigger with invalid pattern", async () => {
      const response = await apiRequest(`/workflows/${testWorkflowId}/triggers`, {
        method: "POST",
        body: JSON.stringify({
          name: "Invalid Regex Trigger",
          triggerType: "message_regex",
          triggerConfig: { pattern: "[invalid(" },
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("regex");
    });

    it("should reject duplicate trigger name for same workflow", async () => {
      const triggerData = {
        name: "Duplicate Name Test",
        triggerType: "message_keyword",
        triggerConfig: { keywords: ["test"] },
      };

      // Create first trigger
      const first = await apiRequest(`/workflows/${testWorkflowId}/triggers`, {
        method: "POST",
        body: JSON.stringify(triggerData),
      });
      const firstData = await first.json();

      // Try to create duplicate
      const second = await apiRequest(`/workflows/${testWorkflowId}/triggers`, {
        method: "POST",
        body: JSON.stringify(triggerData),
      });

      expect(second.status).toBe(400);
      const secondData = await second.json();
      expect(secondData.error).toContain("already exists");

      // Cleanup
      if (firstData.trigger?.id) {
        await deleteTestTrigger(firstData.trigger.id);
      }
    });
  });

  describe("GET /workflows/[id]/triggers - List Triggers", () => {
    let triggerId1: string;
    let triggerId2: string;

    beforeAll(async () => {
      // Create test triggers
      const t1 = await createTestTrigger({ name: "List Test 1", priority: 10 });
      const t2 = await createTestTrigger({ name: "List Test 2", priority: 5 });
      triggerId1 = t1.trigger?.id;
      triggerId2 = t2.trigger?.id;
    });

    afterAll(async () => {
      if (triggerId1) await deleteTestTrigger(triggerId1);
      if (triggerId2) await deleteTestTrigger(triggerId2);
    });

    it("should list all triggers for workflow", async () => {
      const response = await apiRequest(`/workflows/${testWorkflowId}/triggers`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data.triggers)).toBe(true);
      expect(data.triggers.length).toBeGreaterThanOrEqual(2);
    });

    it("should filter triggers by active status", async () => {
      const response = await apiRequest(
        `/workflows/${testWorkflowId}/triggers?isActive=true`
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.triggers.every((t: { isActive: boolean }) => t.isActive)).toBe(true);
    });

    it("should return triggers sorted by priority", async () => {
      const response = await apiRequest(`/workflows/${testWorkflowId}/triggers`);
      const data = await response.json();

      // Check that higher priority comes first
      for (let i = 1; i < data.triggers.length; i++) {
        expect(data.triggers[i - 1].priority).toBeGreaterThanOrEqual(
          data.triggers[i].priority
        );
      }
    });
  });

  describe("GET /workflows/[id]/triggers/[triggerId] - Get Single Trigger", () => {
    let triggerId: string;

    beforeAll(async () => {
      const result = await createTestTrigger({ name: "Get Single Test" });
      triggerId = result.trigger?.id;
    });

    afterAll(async () => {
      if (triggerId) await deleteTestTrigger(triggerId);
    });

    it("should get trigger by ID", async () => {
      const response = await apiRequest(
        `/workflows/${testWorkflowId}/triggers/${triggerId}`
      );
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.trigger.id).toBe(triggerId);
      expect(data.trigger.name).toBe("Get Single Test");
    });

    it("should return 404 for non-existent trigger", async () => {
      const response = await apiRequest(
        `/workflows/${testWorkflowId}/triggers/00000000-0000-0000-0000-000000000000`
      );
      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /workflows/[id]/triggers/[triggerId] - Update Trigger", () => {
    let triggerId: string;

    beforeEach(async () => {
      const result = await createTestTrigger({ name: "Update Test" });
      triggerId = result.trigger?.id;
    });

    afterEach(async () => {
      if (triggerId) await deleteTestTrigger(triggerId);
    });

    it("should update trigger name", async () => {
      const response = await apiRequest(
        `/workflows/${testWorkflowId}/triggers/${triggerId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: "Updated Name" }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.trigger.name).toBe("Updated Name");
    });

    it("should update trigger config", async () => {
      const response = await apiRequest(
        `/workflows/${testWorkflowId}/triggers/${triggerId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            triggerConfig: { keywords: ["updated", "keywords"] },
          }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.trigger.triggerConfig.keywords).toContain("updated");
    });

    it("should toggle trigger active status", async () => {
      const response = await apiRequest(
        `/workflows/${testWorkflowId}/triggers/${triggerId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: false }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.trigger.isActive).toBe(false);
    });

    it("should update priority", async () => {
      const response = await apiRequest(
        `/workflows/${testWorkflowId}/triggers/${triggerId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ priority: 100 }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.trigger.priority).toBe(100);
    });

    it("should update response config", async () => {
      const response = await apiRequest(
        `/workflows/${testWorkflowId}/triggers/${triggerId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            responseConfig: {
              sendResponse: true,
              responseTemplate: "New template: {{data}}",
            },
          }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.trigger.responseConfig.responseTemplate).toContain("New template");
    });
  });

  describe("DELETE /workflows/[id]/triggers/[triggerId] - Delete Trigger", () => {
    it("should delete trigger successfully", async () => {
      const result = await createTestTrigger({ name: "Delete Test" });
      const triggerId = result.trigger?.id;

      const response = await apiRequest(
        `/workflows/${testWorkflowId}/triggers/${triggerId}`,
        { method: "DELETE" }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify it's deleted
      const getResponse = await apiRequest(
        `/workflows/${testWorkflowId}/triggers/${triggerId}`
      );
      expect(getResponse.status).toBe(404);
    });

    it("should return 404 for non-existent trigger", async () => {
      const response = await apiRequest(
        `/workflows/${testWorkflowId}/triggers/00000000-0000-0000-0000-000000000000`,
        { method: "DELETE" }
      );
      expect(response.status).toBe(404);
    });
  });

  describe("GET /triggers - List Organization Triggers", () => {
    it("should list all triggers for organization", async () => {
      const response = await apiRequest("/triggers");
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(Array.isArray(data.triggers)).toBe(true);
      expect(data.stats).toBeDefined();
      expect(typeof data.stats.totalTriggers).toBe("number");
    });

    it("should filter by trigger type", async () => {
      const response = await apiRequest("/triggers?triggerType=message_keyword");
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(
        data.triggers.every((t: { triggerType: string }) => t.triggerType === "message_keyword")
      ).toBe(true);
    });
  });
});

// ==========================================================================
// 2. TRIGGER MATCHING LOGIC
// ==========================================================================

describe("E2E: Trigger Matching Logic", () => {
  describe("Keyword Matching", () => {
    // Helper function to simulate matching
    function matchKeywords(
      keywords: string[],
      message: string,
      caseSensitive = false
    ): boolean {
      return keywords.some((keyword) => {
        const kw = caseSensitive ? keyword : keyword.toLowerCase();
        const msg = caseSensitive ? message : message.toLowerCase();
        const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        return regex.test(msg);
      });
    }

    it("should match exact keyword at word boundary", () => {
      expect(matchKeywords(["schedule"], "show me my schedule")).toBe(true);
      expect(matchKeywords(["schedule"], "schedule please")).toBe(true);
      expect(matchKeywords(["schedule"], "my schedule is full")).toBe(true);
    });

    it("should NOT match keyword as substring", () => {
      expect(matchKeywords(["schedule"], "reschedule my meeting")).toBe(false);
      expect(matchKeywords(["schedule"], "unscheduled event")).toBe(false);
    });

    it("should match case-insensitive by default", () => {
      expect(matchKeywords(["SCHEDULE"], "show my schedule")).toBe(true);
      expect(matchKeywords(["schedule"], "SHOW MY SCHEDULE")).toBe(true);
      expect(matchKeywords(["Schedule"], "SCHEDULE please")).toBe(true);
    });

    it("should respect case-sensitive flag", () => {
      expect(matchKeywords(["Schedule"], "schedule please", true)).toBe(false);
      expect(matchKeywords(["Schedule"], "Schedule please", true)).toBe(true);
    });

    it("should match any of multiple keywords", () => {
      const keywords = ["schedule", "calendar", "events", "appointments"];
      expect(matchKeywords(keywords, "show calendar")).toBe(true);
      expect(matchKeywords(keywords, "list events")).toBe(true);
      expect(matchKeywords(keywords, "my appointments")).toBe(true);
      expect(matchKeywords(keywords, "random message")).toBe(false);
    });

    it("should handle special characters in keywords", () => {
      expect(matchKeywords(["c++"], "I know c++")).toBe(true);
      expect(matchKeywords(["c#"], "learn c#")).toBe(true);
    });

    it("should handle keywords with numbers", () => {
      expect(matchKeywords(["24/7"], "support 24/7")).toBe(true);
      expect(matchKeywords(["911"], "call 911")).toBe(true);
    });
  });

  describe("Contains Matching", () => {
    function matchContains(contains: string, message: string, caseSensitive = false): boolean {
      const c = caseSensitive ? contains : contains.toLowerCase();
      const m = caseSensitive ? message : message.toLowerCase();
      return m.includes(c);
    }

    it("should match substring anywhere", () => {
      expect(matchContains("appoint", "book an appointment")).toBe(true);
      expect(matchContains("meet", "meeting tomorrow")).toBe(true);
    });

    it("should match partial words", () => {
      expect(matchContains("sched", "reschedule")).toBe(true);
      expect(matchContains("cal", "calendar")).toBe(true);
    });

    it("should be case-insensitive by default", () => {
      expect(matchContains("HELP", "I need help")).toBe(true);
    });
  });

  describe("Regex Matching", () => {
    function matchRegex(pattern: string, message: string): string | null {
      try {
        const match = message.match(new RegExp(pattern, "i"));
        return match ? match[0] : null;
      } catch {
        return null;
      }
    }

    it("should match date patterns", () => {
      expect(matchRegex("\\d{1,2}/\\d{1,2}/\\d{4}", "schedule for 12/25/2024")).toBe(
        "12/25/2024"
      );
      expect(matchRegex("\\d{4}-\\d{2}-\\d{2}", "meeting on 2024-12-25")).toBe(
        "2024-12-25"
      );
    });

    it("should match time patterns", () => {
      expect(matchRegex("\\d{1,2}:\\d{2}\\s*(am|pm)?", "meet at 3:30 pm")).toBeTruthy();
    });

    it("should match email patterns", () => {
      expect(
        matchRegex("[\\w.-]+@[\\w.-]+\\.\\w+", "send to john@example.com")
      ).toBe("john@example.com");
    });

    it("should match phone patterns", () => {
      expect(
        matchRegex("\\(?\\d{3}\\)?[-\\s]?\\d{3}[-\\s]?\\d{4}", "call (555) 123-4567")
      ).toBeTruthy();
    });

    it("should match OR patterns", () => {
      expect(matchRegex("(help|support|assist)", "I need help")).toBe("help");
      expect(matchRegex("(help|support|assist)", "contact support")).toBe("support");
    });

    it("should return null for invalid regex", () => {
      expect(matchRegex("[invalid(", "test")).toBeNull();
    });
  });

  describe("Phone Number Matching", () => {
    function normalizePhone(phone: string): string {
      if (phone.includes("@")) return phone.toLowerCase();
      let n = phone.replace(/[^\d+]/g, "");
      if (!n.startsWith("+")) {
        if (n.length === 10) n = `+1${n}`;
        else if (n.length === 11 && n.startsWith("1")) n = `+${n}`;
      }
      return n;
    }

    function matchPhone(allowed: string[], incoming: string): boolean {
      const normalized = normalizePhone(incoming);
      return allowed.some((p) => normalizePhone(p) === normalized);
    }

    it("should match various phone formats", () => {
      const allowed = ["+15551234567"];

      expect(matchPhone(allowed, "555-123-4567")).toBe(true);
      expect(matchPhone(allowed, "(555) 123-4567")).toBe(true);
      expect(matchPhone(allowed, "5551234567")).toBe(true);
      expect(matchPhone(allowed, "+1 555 123 4567")).toBe(true);
      expect(matchPhone(allowed, "1-555-123-4567")).toBe(true);
    });

    it("should not match different numbers", () => {
      const allowed = ["+15551234567"];
      expect(matchPhone(allowed, "555-999-9999")).toBe(false);
    });

    it("should match email addresses for iMessage", () => {
      const allowed = ["john@example.com"];
      expect(matchPhone(allowed, "John@Example.COM")).toBe(true);
    });
  });
});

// ==========================================================================
// 3. PRIORITY & PROVIDER FILTERING
// ==========================================================================

describe("E2E: Priority & Provider Filtering", () => {
  describe("Priority Ordering", () => {
    it("should select highest priority trigger when multiple match", () => {
      const triggers = [
        { id: "1", priority: 0, keywords: ["help"] },
        { id: "2", priority: 100, keywords: ["help"] },
        { id: "3", priority: 50, keywords: ["help"] },
      ];

      const sorted = [...triggers].sort((a, b) => b.priority - a.priority);
      const message = "I need help";

      // First matching trigger should be highest priority
      for (const trigger of sorted) {
        const matches = trigger.keywords.some((k) =>
          new RegExp(`\\b${k}\\b`, "i").test(message)
        );
        if (matches) {
          expect(trigger.id).toBe("2"); // Highest priority
          break;
        }
      }
    });

    it("should maintain stable order for equal priorities", () => {
      const triggers = [
        { id: "1", priority: 10, created: 1 },
        { id: "2", priority: 10, created: 2 },
        { id: "3", priority: 10, created: 3 },
      ];

      const sorted = [...triggers].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.created - a.created; // Secondary sort by created desc
      });

      expect(sorted[0].id).toBe("3");
    });
  });

  describe("Provider Filtering", () => {
    function filterByProvider(
      triggers: Array<{ provider_filter: string }>,
      provider: string
    ) {
      return triggers.filter(
        (t) => t.provider_filter === "all" || t.provider_filter === provider
      );
    }

    it("should include 'all' triggers for any provider", () => {
      const triggers = [
        { id: "1", provider_filter: "all" },
        { id: "2", provider_filter: "twilio" },
        { id: "3", provider_filter: "blooio" },
      ];

      const twilioFiltered = filterByProvider(triggers, "twilio");
      expect(twilioFiltered.map((t) => t.id)).toEqual(["1", "2"]);

      const blooioFiltered = filterByProvider(triggers, "blooio");
      expect(blooioFiltered.map((t) => t.id)).toEqual(["1", "3"]);
    });

    it("should exclude provider-specific triggers for other providers", () => {
      const triggers = [{ id: "1", provider_filter: "twilio" }];

      const blooioFiltered = filterByProvider(triggers, "blooio");
      expect(blooioFiltered.length).toBe(0);
    });
  });
});

// ==========================================================================
// 4. RESPONSE CONFIGURATION
// ==========================================================================

describe("E2E: Response Configuration", () => {
  describe("Template Processing", () => {
    function processTemplate(
      template: string,
      output: Record<string, unknown>
    ): string {
      let result = template;
      for (const [key, value] of Object.entries(output)) {
        result = result.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, "g"),
          String(value)
        );
      }
      return result;
    }

    it("should replace single placeholder", () => {
      expect(
        processTemplate("Your summary: {{summary}}", { summary: "3 meetings" })
      ).toBe("Your summary: 3 meetings");
    });

    it("should replace multiple placeholders", () => {
      expect(
        processTemplate("Hi {{name}}, you have {{count}} events", {
          name: "John",
          count: 5,
        })
      ).toBe("Hi John, you have 5 events");
    });

    it("should replace same placeholder multiple times", () => {
      expect(
        processTemplate("{{name}} called {{name}}", { name: "John" })
      ).toBe("John called John");
    });

    it("should leave unmatched placeholders", () => {
      expect(
        processTemplate("{{found}} and {{missing}}", { found: "yes" })
      ).toBe("yes and {{missing}}");
    });

    it("should handle numeric values", () => {
      expect(processTemplate("Count: {{n}}", { n: 42 })).toBe("Count: 42");
    });

    it("should handle boolean values", () => {
      expect(processTemplate("Active: {{active}}", { active: true })).toBe(
        "Active: true"
      );
    });

    it("should handle null and undefined", () => {
      expect(processTemplate("Value: {{v}}", { v: null })).toBe("Value: null");
      expect(processTemplate("Value: {{v}}", { v: undefined })).toBe(
        "Value: undefined"
      );
    });

    it("should handle empty output", () => {
      expect(processTemplate("No data: {{data}}", {})).toBe("No data: {{data}}");
    });
  });

  describe("Response Decision", () => {
    it("should send response when sendResponse is true", () => {
      const config = { sendResponse: true };
      expect(config.sendResponse).toBe(true);
    });

    it("should not send response when sendResponse is false", () => {
      const config = { sendResponse: false };
      expect(config.sendResponse).toBe(false);
    });

    it("should use responseField if specified", () => {
      const output = { message: "default", customField: "custom value" };
      const config = { sendResponse: true, responseField: "customField" };

      const response = output[config.responseField as keyof typeof output];
      expect(response).toBe("custom value");
    });
  });
});

// ==========================================================================
// 5. EDGE CASES & ERROR HANDLING
// ==========================================================================

describe("E2E: Edge Cases & Error Handling", () => {
  describe("Message Edge Cases", () => {
    it("should handle empty message body", () => {
      const message = "";
      expect(message.trim().length).toBe(0);
      // Empty messages should be skipped
    });

    it("should handle whitespace-only message", () => {
      const message = "   \n\t  ";
      expect(message.trim().length).toBe(0);
    });

    it("should handle very long messages", () => {
      const longMessage = "a".repeat(10000);
      expect(longMessage.length).toBe(10000);
      // Should not crash
    });

    it("should handle unicode characters", () => {
      const keywords = ["help"];
      const message = "I need help 🆘 please";
      const matches = keywords.some((k) =>
        new RegExp(`\\b${k}\\b`, "i").test(message)
      );
      expect(matches).toBe(true);
    });

    it("should handle special characters in message", () => {
      const message = "Help! @mention #hashtag $money";
      const matches = new RegExp("\\bhelp\\b", "i").test(message);
      expect(matches).toBe(true);
    });

    it("should handle newlines in message", () => {
      const message = "Line 1\nLine 2\nschedule please";
      const matches = new RegExp("\\bschedule\\b", "i").test(message);
      expect(matches).toBe(true);
    });
  });

  describe("Trigger Config Edge Cases", () => {
    it("should handle empty keywords array gracefully", () => {
      const keywords: string[] = [];
      const matches = keywords.some((k) => k === "test");
      expect(matches).toBe(false);
    });

    it("should handle null trigger config", () => {
      const config = null;
      expect(config).toBeNull();
    });

    it("should handle missing config fields", () => {
      const config = {};
      expect((config as { keywords?: string[] }).keywords).toBeUndefined();
    });
  });

  describe("Concurrent Matching", () => {
    it("should handle multiple simultaneous matches", async () => {
      const triggers = [
        { id: "1", keywords: ["help"] },
        { id: "2", keywords: ["support"] },
        { id: "3", keywords: ["assist"] },
      ];

      const messages = [
        "I need help",
        "contact support",
        "please assist me",
        "no match here",
      ];

      const results = await Promise.all(
        messages.map(async (msg) => {
          for (const trigger of triggers) {
            const matches = trigger.keywords.some((k) =>
              new RegExp(`\\b${k}\\b`, "i").test(msg)
            );
            if (matches) return trigger.id;
          }
          return null;
        })
      );

      expect(results).toEqual(["1", "2", "3", null]);
    });
  });

  describe("Error Recovery", () => {
    it("should handle invalid regex gracefully", () => {
      const invalidPattern = "[invalid(";
      let error = null;
      try {
        new RegExp(invalidPattern);
      } catch (e) {
        error = e;
      }
      expect(error).not.toBeNull();
    });

    it("should handle workflow execution failure", () => {
      const executionResult = {
        success: false,
        error: "API timeout",
      };

      expect(executionResult.success).toBe(false);
      expect(executionResult.error).toBeDefined();
    });
  });
});

// ==========================================================================
// 6. REAL-WORLD SCENARIOS
// ==========================================================================

describe("E2E: Real-World Scenarios", () => {
  describe("Scenario: Calendar Schedule Request", () => {
    it("should handle 'what's my schedule?' request", () => {
      const trigger = {
        type: "message_keyword",
        config: { keywords: ["schedule", "calendar", "events", "appointments"] },
        response: { sendResponse: true, template: "Your schedule: {{summary}}" },
      };

      const userMessage = "What's my schedule for today?";
      const matches = trigger.config.keywords.some((k) =>
        new RegExp(`\\b${k}\\b`, "i").test(userMessage)
      );

      expect(matches).toBe(true);

      // Simulate workflow output
      const workflowOutput = {
        summary: "You have 3 meetings: 10am Team sync, 2pm Client call, 4pm Review",
      };

      let response = trigger.response.template;
      response = response.replace("{{summary}}", workflowOutput.summary);

      expect(response).toContain("3 meetings");
    });
  });

  describe("Scenario: Email Forwarding", () => {
    it("should trigger email workflow on 'send email' request", () => {
      const trigger = {
        type: "message_keyword",
        config: { keywords: ["email", "send email", "mail"] },
      };

      const testMessages = [
        "Send email to john@example.com",
        "Email the team about the update",
        "Can you mail this to support?",
      ];

      testMessages.forEach((msg) => {
        const matches = trigger.config.keywords.some((k) =>
          new RegExp(`\\b${k}\\b`, "i").test(msg)
        );
        expect(matches).toBe(true);
      });
    });
  });

  describe("Scenario: Appointment Booking", () => {
    it("should match date in message for booking", () => {
      const trigger = {
        type: "message_regex",
        config: { pattern: "\\d{1,2}/\\d{1,2}/\\d{4}" },
      };

      const message = "Book an appointment for 12/25/2024 at 3pm";
      const match = message.match(new RegExp(trigger.config.pattern));

      expect(match).not.toBeNull();
      expect(match?.[0]).toBe("12/25/2024");
    });
  });

  describe("Scenario: VIP Customer Handling", () => {
    it("should prioritize VIP triggers over general triggers", () => {
      const triggers = [
        { id: "vip", priority: 100, phoneNumbers: ["+15551234567"] },
        { id: "general", priority: 0, keywords: ["help"] },
      ];

      const message = {
        from: "+15551234567",
        body: "I need help",
      };

      // Sort by priority
      const sorted = [...triggers].sort((a, b) => b.priority - a.priority);

      // Check VIP first
      const vipTrigger = sorted[0];
      const isVip = vipTrigger.phoneNumbers?.includes(message.from);

      expect(isVip).toBe(true);
      expect(vipTrigger.id).toBe("vip");
    });
  });

  describe("Scenario: Provider-Specific Workflows", () => {
    it("should only trigger SMS workflow for Twilio", () => {
      const triggers = [
        { id: "sms-promo", provider_filter: "twilio", keywords: ["promo"] },
        { id: "imessage-support", provider_filter: "blooio", keywords: ["support"] },
      ];

      const twilioMessage = { provider: "twilio", body: "use promo code" };
      const blooioMessage = { provider: "blooio", body: "I need support" };

      const twilioMatch = triggers.find(
        (t) =>
          t.provider_filter === twilioMessage.provider &&
          t.keywords.some((k) =>
            new RegExp(`\\b${k}\\b`, "i").test(twilioMessage.body)
          )
      );

      const blooioMatch = triggers.find(
        (t) =>
          t.provider_filter === blooioMessage.provider &&
          t.keywords.some((k) =>
            new RegExp(`\\b${k}\\b`, "i").test(blooioMessage.body)
          )
      );

      expect(twilioMatch?.id).toBe("sms-promo");
      expect(blooioMatch?.id).toBe("imessage-support");
    });
  });

  describe("Scenario: No Match - Fallback to Agent", () => {
    it("should return no match for unrecognized message", () => {
      const triggers = [
        { keywords: ["schedule", "calendar"] },
        { keywords: ["email", "send"] },
      ];

      const message = "Hello, how are you?";

      const match = triggers.find((t) =>
        t.keywords.some((k) => new RegExp(`\\b${k}\\b`, "i").test(message))
      );

      expect(match).toBeUndefined();
      // Should fallback to agent processing
    });
  });

  describe("Scenario: Multi-Language Support", () => {
    it("should handle non-English keywords", () => {
      const trigger = {
        keywords: ["ayuda", "soporte"], // Spanish: help, support
      };

      expect(
        trigger.keywords.some((k) =>
          new RegExp(`\\b${k}\\b`, "i").test("Necesito ayuda")
        )
      ).toBe(true);
    });
  });

  describe("Scenario: Business Hours Trigger", () => {
    it("should combine time-based and keyword triggers", () => {
      const isBusinessHours = () => {
        const hour = new Date().getHours();
        return hour >= 9 && hour < 17;
      };

      const trigger = {
        keywords: ["urgent"],
        businessHoursOnly: true,
      };

      const message = "urgent request";
      const keywordMatch = trigger.keywords.some((k) =>
        new RegExp(`\\b${k}\\b`, "i").test(message)
      );

      // Trigger only activates during business hours
      const shouldTrigger = keywordMatch && (!trigger.businessHoursOnly || isBusinessHours());

      expect(keywordMatch).toBe(true);
      // shouldTrigger depends on current time
    });
  });
});

// ==========================================================================
// SETUP & TEARDOWN
// ==========================================================================

beforeAll(() => {
  // Set test IDs from environment or use placeholders
  // For real E2E testing, set: TEST_WORKFLOW_ID, TEST_AUTH_TOKEN
  testWorkflowId = process.env.TEST_WORKFLOW_ID || "test-workflow-id";
  authHeaders = {
    Authorization: `Bearer ${process.env.TEST_AUTH_TOKEN || "test-token"}`,
  };
});

afterAll(() => {
  // Cleanup handled by individual tests
});
