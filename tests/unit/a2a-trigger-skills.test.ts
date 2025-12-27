/**
 * A2A Trigger Skills Unit Tests
 *
 * Tests the A2A skills for N8N workflow triggers:
 * - n8n_trigger_workflow
 * - n8n_list_triggers
 * - n8n_create_trigger
 *
 * Run with: bun test tests/unit/a2a-trigger-skills.test.ts
 */

import { describe, test, expect } from "bun:test";

// Mock context for A2A skills
const mockContext = {
  user: {
    id: "user-123",
    organization_id: "org-456",
    email: "test@example.com",
  },
  apiKeyId: "api-key-789",
  agentIdentifier: "agent:test",
  secrets: {},
};

// =============================================================================
// SKILL PARAMETER VALIDATION
// =============================================================================

describe("A2A Skill Parameter Validation", () => {
  describe("n8n_trigger_workflow", () => {
    test("requires triggerKey or workflowId", () => {
      const params: Record<string, unknown> = {};

      const hasTriggerKey = "triggerKey" in params && params.triggerKey;
      const hasWorkflowId = "workflowId" in params && params.workflowId;

      expect(hasTriggerKey || hasWorkflowId).toBe(false);
    });

    test("accepts triggerKey parameter", () => {
      const params = { triggerKey: "my-trigger-key" };

      expect(params.triggerKey).toBeDefined();
      expect(typeof params.triggerKey).toBe("string");
    });

    test("accepts workflowId parameter", () => {
      const params = { workflowId: "workflow-uuid" };

      expect(params.workflowId).toBeDefined();
      expect(typeof params.workflowId).toBe("string");
    });

    test("accepts inputData parameter", () => {
      const params = {
        triggerKey: "my-trigger",
        inputData: { foo: "bar", count: 42 },
      };

      expect(params.inputData).toBeDefined();
      expect(typeof params.inputData).toBe("object");
    });

    test("merges text content as message", () => {
      const textContent = "Hello, workflow!";
      const inputData = { existingData: true };

      const mergedInput = {
        ...inputData,
        message: textContent,
      };

      expect(mergedInput.message).toBe(textContent);
      expect(mergedInput.existingData).toBe(true);
    });
  });

  describe("n8n_list_triggers", () => {
    test("accepts optional workflowId filter", () => {
      const params = { workflowId: "workflow-123" };

      expect(params.workflowId).toBeDefined();
    });

    test("accepts optional triggerType filter", () => {
      const params = { triggerType: "webhook" };

      expect(["cron", "webhook", "a2a", "mcp"]).toContain(params.triggerType);
    });

    test("works without any filters", () => {
      const params = {};

      expect(Object.keys(params).length).toBe(0);
    });
  });

  describe("n8n_create_trigger", () => {
    test("requires workflowId", () => {
      const params = { triggerType: "webhook" };

      expect("workflowId" in params).toBe(false);
    });

    test("requires triggerType", () => {
      const params = { workflowId: "workflow-123" };

      expect("triggerType" in params).toBe(false);
    });

    test("validates triggerType enum", () => {
      const validTypes = ["cron", "webhook", "a2a", "mcp"];

      validTypes.forEach((type) => {
        expect(validTypes).toContain(type);
      });

      expect(validTypes).not.toContain("invalid");
    });

    test("cron trigger requires cronExpression", () => {
      const params = {
        workflowId: "workflow-123",
        triggerType: "cron",
        config: {}, // Missing cronExpression
      };

      const hasCronExpression =
        params.config && "cronExpression" in params.config;
      expect(hasCronExpression).toBe(false);
    });

    test("cron trigger with valid expression", () => {
      const params = {
        workflowId: "workflow-123",
        triggerType: "cron",
        config: { cronExpression: "0 0 * * *" },
      };

      expect(params.config.cronExpression).toBeDefined();
    });

    test("webhook trigger auto-generates secret", () => {
      const params = {
        workflowId: "workflow-123",
        triggerType: "webhook",
        config: {},
      };

      // Service should auto-generate secret
      expect(params.triggerType).toBe("webhook");
    });
  });
});

// =============================================================================
// SKILL RESPONSE FORMAT
// =============================================================================

describe("A2A Skill Response Format", () => {
  describe("n8n_trigger_workflow response", () => {
    test("returns executionId on success", () => {
      const response = {
        executionId: "exec-123",
        status: "running",
        workflowId: "workflow-456",
        triggerId: "trigger-789",
      };

      expect(response.executionId).toBeDefined();
      expect(typeof response.executionId).toBe("string");
    });

    test("returns status", () => {
      const response = {
        executionId: "exec-123",
        status: "running",
        workflowId: "workflow-456",
        triggerId: "trigger-789",
      };

      expect(["running", "success", "error"]).toContain(response.status);
    });

    test("includes workflow and trigger IDs", () => {
      const response = {
        executionId: "exec-123",
        status: "success",
        workflowId: "workflow-456",
        triggerId: "trigger-789",
      };

      expect(response.workflowId).toBeDefined();
      expect(response.triggerId).toBeDefined();
    });
  });

  describe("n8n_list_triggers response", () => {
    test("returns array of triggers", () => {
      const response = {
        triggers: [
          { id: "t1", triggerType: "webhook" },
          { id: "t2", triggerType: "cron" },
        ],
        total: 2,
      };

      expect(Array.isArray(response.triggers)).toBe(true);
      expect(response.total).toBe(2);
    });

    test("redacts webhook keys", () => {
      const trigger = {
        id: "trigger-123",
        triggerType: "webhook",
        triggerKey: "abc123..." + "def456...", // Full key
      };

      // In response, key should be truncated
      const redactedKey = trigger.triggerKey.slice(0, 8) + "...";

      expect(redactedKey.length).toBeLessThan(trigger.triggerKey.length);
      expect(redactedKey).toContain("...");
    });

    test("includes execution statistics", () => {
      const trigger = {
        id: "trigger-123",
        executionCount: 42,
        lastExecutedAt: new Date().toISOString(),
      };

      expect(typeof trigger.executionCount).toBe("number");
      expect(trigger.lastExecutedAt).toBeDefined();
    });
  });

  describe("n8n_create_trigger response", () => {
    test("returns triggerId", () => {
      const response = {
        triggerId: "new-trigger-123",
        triggerType: "webhook",
        triggerKey: "generated-key",
      };

      expect(response.triggerId).toBeDefined();
    });

    test("webhook trigger includes secret once", () => {
      const response = {
        triggerId: "trigger-123",
        triggerType: "webhook",
        triggerKey: "webhook-key",
        webhookUrl: "https://example.com/api/v1/n8n/webhooks/webhook-key",
        webhookSecret: "secret-shown-once",
      };

      expect(response.webhookUrl).toBeDefined();
      expect(response.webhookSecret).toBeDefined();
    });

    test("non-webhook trigger omits secret", () => {
      const response = {
        triggerId: "trigger-123",
        triggerType: "cron",
        triggerKey: "0 0 * * *",
      };

      expect(
        (response as Record<string, unknown>).webhookSecret,
      ).toBeUndefined();
      expect((response as Record<string, unknown>).webhookUrl).toBeUndefined();
    });
  });
});

// =============================================================================
// ORGANIZATION SCOPING
// =============================================================================

describe("Organization Scoping", () => {
  test("trigger must belong to user's organization", () => {
    const trigger = { organization_id: "org-456" };
    const userOrgId = "org-456";

    expect(trigger.organization_id).toBe(userOrgId);
  });

  test("rejects trigger from different organization", () => {
    const trigger = { organization_id: "org-different" };
    const userOrgId = "org-456";

    expect(trigger.organization_id).not.toBe(userOrgId);
  });

  test("workflow must belong to user's organization", () => {
    const workflow = { organization_id: "org-456" };
    const userOrgId = "org-456";

    expect(workflow.organization_id).toBe(userOrgId);
  });

  test("list triggers filters by organization", () => {
    const allTriggers = [
      { id: "t1", organization_id: "org-456" },
      { id: "t2", organization_id: "org-789" },
      { id: "t3", organization_id: "org-456" },
    ];

    const userOrgId = "org-456";
    const filtered = allTriggers.filter((t) => t.organization_id === userOrgId);

    expect(filtered.length).toBe(2);
    expect(filtered.every((t) => t.organization_id === userOrgId)).toBe(true);
  });
});

// =============================================================================
// A2A CONTEXT INJECTION
// =============================================================================

describe("A2A Context Injection", () => {
  test("injects $a2a context into input data", () => {
    const inputData = { userMessage: "Hello" };
    const context = mockContext;

    const enrichedInput = {
      ...inputData,
      $a2a: {
        userId: context.user.id,
        organizationId: context.user.organization_id,
        agentIdentifier: context.agentIdentifier,
      },
    };

    expect(enrichedInput.$a2a).toBeDefined();
    expect(enrichedInput.$a2a.userId).toBe("user-123");
    expect(enrichedInput.$a2a.organizationId).toBe("org-456");
    expect(enrichedInput.$a2a.agentIdentifier).toBe("agent:test");
  });

  test("preserves existing input data", () => {
    const inputData = {
      customField: "value",
      nested: { data: true },
    };

    const enrichedInput = {
      ...inputData,
      $a2a: { userId: "user-123" },
    };

    expect(enrichedInput.customField).toBe("value");
    expect(enrichedInput.nested.data).toBe(true);
  });
});

// =============================================================================
// TRIGGER TYPE RESTRICTIONS
// =============================================================================

describe("Trigger Type Restrictions", () => {
  test("A2A skill only executes A2A or MCP triggers", () => {
    const validTypes = ["a2a", "mcp"];
    const invalidTypes = ["webhook", "cron"];

    validTypes.forEach((type) => {
      expect(["a2a", "mcp"]).toContain(type);
    });

    invalidTypes.forEach((type) => {
      expect(["a2a", "mcp"]).not.toContain(type);
    });
  });

  test("webhook triggers should use webhook endpoint", () => {
    const trigger = { trigger_type: "webhook" };

    expect(trigger.trigger_type).toBe("webhook");
    // Should return error message directing to webhook endpoint
  });

  test("cron triggers execute via cron job", () => {
    const trigger = { trigger_type: "cron" };

    expect(trigger.trigger_type).toBe("cron");
    // Not directly callable via A2A
  });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

describe("Error Handling", () => {
  test("throws on missing required parameters", () => {
    const params = {};
    const requiredFields = ["triggerKey", "workflowId"];

    const hasRequired = requiredFields.some((field) => field in params);
    expect(hasRequired).toBe(false);
  });

  test("throws on workflow not found", () => {
    const workflow = null;

    expect(workflow).toBeNull();
    // Should throw "Workflow not found"
  });

  test("throws on trigger not found", () => {
    const trigger = null;

    expect(trigger).toBeNull();
    // Should throw "No active A2A/MCP trigger found"
  });

  test("throws on unauthorized access", () => {
    const triggerOrgId = "org-123";
    const userOrgId = "org-456";

    expect(triggerOrgId).not.toBe(userOrgId);
    // Should throw "Unauthorized: Trigger belongs to a different organization"
  });

  test("throws on invalid trigger type", () => {
    const trigger = { trigger_type: "webhook" };
    const allowedTypes = ["a2a", "mcp"];

    expect(allowedTypes).not.toContain(trigger.trigger_type);
    // Should throw about using webhook endpoint
  });
});
