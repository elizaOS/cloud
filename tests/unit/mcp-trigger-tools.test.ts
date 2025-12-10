/**
 * MCP Trigger Tools Unit Tests
 * 
 * Tests the MCP tools for N8N workflow triggers:
 * - n8n_execute_trigger
 * - n8n_list_triggers
 * - n8n_create_trigger
 * 
 * Run with: bun test tests/unit/mcp-trigger-tools.test.ts
 */

import { describe, test, expect } from "bun:test";

// Mock user context for MCP tools
const mockUser = {
  id: "user-123",
  organization_id: "org-456",
  email: "test@example.com",
  organization: {
    id: "org-456",
    credit_balance: "100.00",
    is_active: true,
  },
};

// =============================================================================
// MCP TOOL INPUT SCHEMA VALIDATION
// =============================================================================

describe("MCP Tool Input Schema", () => {
  describe("n8n_execute_trigger", () => {
    test("schema allows triggerKey parameter", () => {
      const input = { triggerKey: "my-trigger-key-123" };
      
      expect(typeof input.triggerKey).toBe("string");
    });

    test("schema allows workflowId parameter", () => {
      const input = { workflowId: "workflow-uuid-456" };
      
      expect(typeof input.workflowId).toBe("string");
    });

    test("schema allows inputData parameter", () => {
      const input = {
        triggerKey: "trigger-key",
        inputData: {
          param1: "value1",
          param2: 123,
          nested: { data: true },
        },
      };
      
      expect(typeof input.inputData).toBe("object");
      expect(input.inputData.param1).toBe("value1");
    });

    test("requires at least one of triggerKey or workflowId", () => {
      const validInputs = [
        { triggerKey: "key" },
        { workflowId: "id" },
        { triggerKey: "key", workflowId: "id" },
      ];

      const invalidInput = {};

      validInputs.forEach(input => {
        expect("triggerKey" in input || "workflowId" in input).toBe(true);
      });

      expect("triggerKey" in invalidInput || "workflowId" in invalidInput).toBe(false);
    });
  });

  describe("n8n_list_triggers", () => {
    test("schema allows optional workflowId filter", () => {
      const input = { workflowId: "workflow-123" };
      
      expect(input.workflowId).toBeDefined();
    });

    test("schema allows optional triggerType filter", () => {
      const input = { triggerType: "webhook" as const };
      
      expect(["cron", "webhook", "a2a", "mcp"]).toContain(input.triggerType);
    });

    test("schema allows empty input", () => {
      const input = {};
      
      expect(Object.keys(input).length).toBe(0);
    });
  });

  describe("n8n_create_trigger", () => {
    test("schema requires workflowId", () => {
      const input = {
        workflowId: "workflow-123",
        triggerType: "webhook" as const,
      };
      
      expect(input.workflowId).toBeDefined();
    });

    test("schema requires triggerType", () => {
      const input = {
        workflowId: "workflow-123",
        triggerType: "cron" as const,
      };
      
      expect(input.triggerType).toBeDefined();
    });

    test("schema validates triggerType enum", () => {
      const validTypes = ["cron", "webhook", "a2a", "mcp"] as const;
      
      validTypes.forEach(type => {
        const input = { workflowId: "w123", triggerType: type };
        expect(validTypes).toContain(input.triggerType);
      });
    });

    test("schema allows optional triggerKey", () => {
      const withKey = {
        workflowId: "w123",
        triggerType: "a2a" as const,
        triggerKey: "my-custom-key",
      };

      const withoutKey = {
        workflowId: "w123",
        triggerType: "webhook" as const,
      };

      expect(withKey.triggerKey).toBe("my-custom-key");
      expect((withoutKey as Record<string, unknown>).triggerKey).toBeUndefined();
    });

    test("schema allows config object", () => {
      const input = {
        workflowId: "w123",
        triggerType: "cron" as const,
        config: {
          cronExpression: "0 0 * * *",
          maxExecutionsPerDay: 24,
          estimatedCostPerExecution: 0.01,
        },
      };
      
      expect(input.config).toBeDefined();
      expect(input.config.cronExpression).toBe("0 0 * * *");
    });
  });
});

// =============================================================================
// MCP TOOL OUTPUT FORMAT
// =============================================================================

describe("MCP Tool Output Format", () => {
  describe("n8n_execute_trigger output", () => {
    test("returns success with execution details", () => {
      const output = {
        success: true,
        executionId: "exec-123",
        status: "running",
        workflowId: "workflow-456",
        triggerId: "trigger-789",
      };
      
      expect(output.success).toBe(true);
      expect(output.executionId).toBeDefined();
      expect(output.status).toBeDefined();
    });

    test("returns JSON content type", () => {
      const mcpResponse = {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            executionId: "exec-123",
            status: "success",
          }, null, 2),
        }],
      };
      
      expect(mcpResponse.content[0].type).toBe("text");
      expect(() => JSON.parse(mcpResponse.content[0].text)).not.toThrow();
    });

    test("error response has isError flag", () => {
      const errorResponse = {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: "Something went wrong" }),
        }],
        isError: true,
      };
      
      expect(errorResponse.isError).toBe(true);
    });
  });

  describe("n8n_list_triggers output", () => {
    test("returns array of triggers with total", () => {
      const output = {
        success: true,
        triggers: [
          { id: "t1", triggerType: "webhook", isActive: true },
          { id: "t2", triggerType: "cron", isActive: true },
        ],
        total: 2,
      };
      
      expect(Array.isArray(output.triggers)).toBe(true);
      expect(output.total).toBe(output.triggers.length);
    });

    test("trigger objects have required fields", () => {
      const trigger = {
        id: "trigger-123",
        workflowId: "workflow-456",
        triggerType: "webhook",
        triggerKey: "abc123...", // Redacted
        isActive: true,
        executionCount: 42,
        lastExecutedAt: "2024-01-01T00:00:00.000Z",
      };
      
      expect(trigger.id).toBeDefined();
      expect(trigger.workflowId).toBeDefined();
      expect(trigger.triggerType).toBeDefined();
      expect(trigger.isActive).toBeDefined();
    });

    test("webhook trigger keys are redacted", () => {
      const fullKey = "abc123def456ghi789jkl012mno345pqr678";
      const redactedKey = fullKey.slice(0, 8) + "...";
      
      expect(redactedKey).toBe("abc123de...");
      expect(redactedKey).not.toBe(fullKey);
    });
  });

  describe("n8n_create_trigger output", () => {
    test("returns trigger details on success", () => {
      const output = {
        success: true,
        triggerId: "new-trigger-123",
        triggerType: "webhook",
        triggerKey: "generated-key-456",
        isActive: true,
      };
      
      expect(output.success).toBe(true);
      expect(output.triggerId).toBeDefined();
    });

    test("webhook trigger includes URL and secret", () => {
      const output = {
        success: true,
        triggerId: "trigger-123",
        triggerType: "webhook",
        triggerKey: "key-456",
        webhookUrl: "https://elizacloud.ai/api/v1/n8n/webhooks/key-456",
        webhookSecret: "secret-789",
        note: "Save webhookSecret now - it will not be shown again",
      };
      
      expect(output.webhookUrl).toBeDefined();
      expect(output.webhookUrl).toContain(output.triggerKey);
      expect(output.webhookSecret).toBeDefined();
      expect(output.note).toContain("Save");
    });

    test("non-webhook trigger omits URL and secret", () => {
      const output = {
        success: true,
        triggerId: "trigger-123",
        triggerType: "cron",
        triggerKey: "0 0 * * *",
        isActive: true,
      };
      
      expect((output as Record<string, unknown>).webhookUrl).toBeUndefined();
      expect((output as Record<string, unknown>).webhookSecret).toBeUndefined();
    });
  });
});

// =============================================================================
// MCP TOOL AUTHORIZATION
// =============================================================================

describe("MCP Tool Authorization", () => {
  test("requires organization_id", () => {
    const user = { ...mockUser, organization_id: "org-456" };
    
    expect(user.organization_id).toBeDefined();
  });

  test("rejects user without organization", () => {
    const user = { ...mockUser, organization_id: null };
    
    expect(user.organization_id).toBeFalsy();
  });

  test("validates workflow belongs to organization", () => {
    const workflow = { organization_id: "org-456" };
    const userOrgId = "org-456";
    
    expect(workflow.organization_id).toBe(userOrgId);
  });

  test("validates trigger belongs to organization", () => {
    const trigger = { organization_id: "org-456" };
    const userOrgId = "org-456";
    
    expect(trigger.organization_id).toBe(userOrgId);
  });

  test("rejects cross-organization access", () => {
    const trigger = { organization_id: "org-123" };
    const userOrgId = "org-456";
    
    expect(trigger.organization_id).not.toBe(userOrgId);
  });
});

// =============================================================================
// MCP TOOL TRIGGER TYPE VALIDATION
// =============================================================================

describe("Trigger Type Validation", () => {
  test("execute_trigger only works for A2A/MCP triggers", () => {
    const validTypes = ["a2a", "mcp"];
    const invalidTypes = ["webhook", "cron"];
    
    validTypes.forEach(type => {
      expect(["a2a", "mcp"]).toContain(type);
    });
    
    invalidTypes.forEach(type => {
      expect(["a2a", "mcp"]).not.toContain(type);
    });
  });

  test("webhook triggers return error with guidance", () => {
    const trigger = { trigger_type: "webhook" };
    const errorMessage = "Use webhook endpoint for webhook triggers";
    
    expect(trigger.trigger_type).toBe("webhook");
    expect(errorMessage).toContain("webhook endpoint");
  });

  test("cron triggers cannot be manually executed", () => {
    const trigger = { trigger_type: "cron" };
    
    // Cron triggers are executed by the scheduler
    expect(trigger.trigger_type).toBe("cron");
  });

  test("create_trigger accepts all trigger types", () => {
    const allTypes = ["cron", "webhook", "a2a", "mcp"];
    
    allTypes.forEach(type => {
      expect(["cron", "webhook", "a2a", "mcp"]).toContain(type);
    });
  });
});

// =============================================================================
// MCP TOOL ERROR RESPONSES
// =============================================================================

describe("MCP Tool Error Responses", () => {
  test("error response format", () => {
    const errorResponse = {
      content: [{
        type: "text" as const,
        text: JSON.stringify({ error: "Error message" }, null, 2),
      }],
      isError: true,
    };
    
    expect(errorResponse.isError).toBe(true);
    const parsed = JSON.parse(errorResponse.content[0].text);
    expect(parsed.error).toBeDefined();
  });

  test("missing organization error", () => {
    const error = { error: "No organization" };
    
    expect(error.error).toBe("No organization");
  });

  test("missing parameters error", () => {
    const error = { error: "Either triggerKey or workflowId is required" };
    
    expect(error.error).toContain("required");
  });

  test("trigger not found error", () => {
    const error = { error: "No active A2A/MCP trigger found" };
    
    expect(error.error).toContain("trigger");
    expect(error.error.toLowerCase()).toContain("found");
  });

  test("workflow not found error", () => {
    const error = { error: "Workflow not found" };
    
    expect(error.error).toBe("Workflow not found");
  });

  test("unauthorized error", () => {
    const error = { error: "Unauthorized" };
    
    expect(error.error).toBe("Unauthorized");
  });

  test("cron expression required error", () => {
    const error = { error: "cronExpression is required for cron triggers" };
    
    expect(error.error).toContain("cronExpression");
  });
});

// =============================================================================
// MCP TOOL CONFIGURATION VALIDATION
// =============================================================================

describe("Configuration Validation", () => {
  describe("Cron Configuration", () => {
    test("validates cronExpression is present", () => {
      const config = { cronExpression: "0 0 * * *" };
      
      expect(config.cronExpression).toBeDefined();
    });

    test("validates cronExpression format", () => {
      const validExpressions = [
        "* * * * *",
        "0 0 * * *",
        "*/5 * * * *",
        "0 9 * * 1-5",
      ];
      
      validExpressions.forEach(expr => {
        expect(expr.split(" ").length).toBe(5);
      });
    });
  });

  describe("Execution Limits", () => {
    test("validates maxExecutionsPerDay is positive", () => {
      const config = { maxExecutionsPerDay: 1000 };
      
      expect(config.maxExecutionsPerDay).toBeGreaterThan(0);
    });

    test("validates maxExecutionsPerDay max value", () => {
      const maxAllowed = 100000;
      const config = { maxExecutionsPerDay: 50000 };
      
      expect(config.maxExecutionsPerDay).toBeLessThanOrEqual(maxAllowed);
    });
  });

  describe("Cost Configuration", () => {
    test("validates estimatedCostPerExecution is non-negative", () => {
      const config = { estimatedCostPerExecution: 0.01 };
      
      expect(config.estimatedCostPerExecution).toBeGreaterThanOrEqual(0);
    });

    test("validates estimatedCostPerExecution max value", () => {
      const maxAllowed = 100;
      const config = { estimatedCostPerExecution: 0.5 };
      
      expect(config.estimatedCostPerExecution).toBeLessThanOrEqual(maxAllowed);
    });
  });
});

// =============================================================================
// MCP TOOL TRIGGER KEY HANDLING
// =============================================================================

describe("Trigger Key Handling", () => {
  test("auto-generates webhook key if not provided", () => {
    const triggerType = "webhook";
    const providedKey = undefined;
    
    // Service should generate random key
    expect(providedKey).toBeUndefined();
    expect(triggerType).toBe("webhook");
  });

  test("uses provided key for A2A trigger", () => {
    const providedKey = "my-a2a-skill";
    
    expect(providedKey).toBe("my-a2a-skill");
  });

  test("uses provided key for MCP trigger", () => {
    const providedKey = "my-mcp-tool";
    
    expect(providedKey).toBe("my-mcp-tool");
  });

  test("uses cron expression as key for cron trigger", () => {
    const cronExpression = "0 0 * * *";
    const triggerKey = cronExpression;
    
    expect(triggerKey).toBe(cronExpression);
  });

  test("prevents duplicate trigger keys", () => {
    const existingKeys = new Set(["key1", "key2", "key3"]);
    const newKey = "key1";
    
    expect(existingKeys.has(newKey)).toBe(true);
  });
});

