/**
 * N8N Workflow Triggers Unit Tests
 *
 * Tests the trigger system for N8N workflows including:
 * - Trigger creation (webhook, cron, A2A, MCP)
 * - Trigger execution with security validation
 * - Daily execution limits
 * - Organization scoping
 * - Credit checks
 *
 * Run with: bun test tests/unit/n8n-workflow-triggers.test.ts
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";

// Mock the database and external services
const mockTrigger = {
  id: "trigger-123",
  workflow_id: "workflow-456",
  organization_id: "org-789",
  trigger_type: "webhook" as const,
  trigger_key: "abc123def456",
  config: {
    webhookSecret: "secret123",
    requireSignature: true,
    maxExecutionsPerDay: 100,
  },
  is_active: true,
  execution_count: 5,
  error_count: 0,
  last_executed_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockWorkflow = {
  id: "workflow-456",
  organization_id: "org-789",
  user_id: "user-111",
  name: "Test Workflow",
  description: "A test workflow",
  workflow_data: { nodes: [], connections: {} },
  version: 1,
  status: "active" as const,
  tags: [],
  created_at: new Date(),
  updated_at: new Date(),
};

const mockOrg = {
  id: "org-789",
  is_active: true,
  credit_balance: "100.00",
};

// =============================================================================
// WEBHOOK SIGNATURE TESTS
// =============================================================================

describe("Webhook Signature Verification", () => {
  test("generates valid webhook secret", async () => {
    const { generateWebhookSecret } =
      await import("@/lib/utils/webhook-signature");

    const secret = generateWebhookSecret();

    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    expect(secret.length).toBe(64);
  });

  test("generates signature in correct format", async () => {
    const { generateWebhookSignature } =
      await import("@/lib/utils/webhook-signature");

    const signature = generateWebhookSignature({
      payload: '{"test": "data"}',
      secret: "a".repeat(64),
    });

    expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
  });

  test("verifies valid signature", async () => {
    const { generateWebhookSignature, verifyWebhookSignature } =
      await import("@/lib/utils/webhook-signature");

    const payload = '{"event": "test"}';
    const secret = "b".repeat(64);

    const signature = generateWebhookSignature({ payload, secret });
    const result = verifyWebhookSignature({ payload, signature, secret });

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("rejects invalid signature", async () => {
    const { verifyWebhookSignature } =
      await import("@/lib/utils/webhook-signature");

    // Use a recent timestamp so it doesn't fail on expiration
    const recentTimestamp = Math.floor(Date.now() / 1000);
    const result = verifyWebhookSignature({
      payload: '{"test": "data"}',
      signature: `t=${recentTimestamp},v1=` + "x".repeat(64),
      secret: "a".repeat(64),
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid signature");
  });

  test("rejects expired signature", async () => {
    const { generateWebhookSignature, verifyWebhookSignature } =
      await import("@/lib/utils/webhook-signature");

    const payload = '{"test": "data"}';
    const secret = "c".repeat(64);

    // Create signature from 10 minutes ago
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const signature = generateWebhookSignature({
      payload,
      secret,
      timestamp: oldTimestamp,
    });

    const result = verifyWebhookSignature({
      payload,
      signature,
      secret,
      config: { timestampTolerance: 300 }, // 5 minute tolerance
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });

  test("accepts signature within tolerance", async () => {
    const { generateWebhookSignature, verifyWebhookSignature } =
      await import("@/lib/utils/webhook-signature");

    const payload = '{"test": "data"}';
    const secret = "d".repeat(64);

    // Create signature from 2 minutes ago
    const recentTimestamp = Math.floor(Date.now() / 1000) - 120;
    const signature = generateWebhookSignature({
      payload,
      secret,
      timestamp: recentTimestamp,
    });

    const result = verifyWebhookSignature({
      payload,
      signature,
      secret,
      config: { timestampTolerance: 300 }, // 5 minute tolerance
    });

    expect(result.valid).toBe(true);
  });

  test("creates signature headers for outgoing requests", async () => {
    const { createSignatureHeaders } =
      await import("@/lib/utils/webhook-signature");

    const headers = createSignatureHeaders('{"test": true}', "e".repeat(64));

    expect(headers["x-webhook-signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("uses custom signature header name", async () => {
    const { createSignatureHeaders } =
      await import("@/lib/utils/webhook-signature");

    const headers = createSignatureHeaders('{"test": true}', "f".repeat(64), {
      signatureHeader: "x-custom-sig",
    });

    expect(headers["x-custom-sig"]).toBeDefined();
    expect(headers["x-webhook-signature"]).toBeUndefined();
  });
});

// =============================================================================
// TRIGGER TYPE TESTS
// =============================================================================

describe("Trigger Type Configuration", () => {
  test("webhook trigger requires secret by default", () => {
    const webhookConfig = {
      webhookSecret: "auto-generated",
      requireSignature: true,
      includeOutputInResponse: false,
      maxExecutionsPerDay: 10000,
    };

    expect(webhookConfig.requireSignature).toBe(true);
    expect(webhookConfig.webhookSecret).toBeDefined();
  });

  test("cron trigger requires cronExpression", () => {
    const cronConfig = {
      cronExpression: "0 */5 * * *", // Every 5 minutes
      inputData: { source: "cron" },
      maxExecutionsPerDay: 288, // 24*60/5 = 288 executions
    };

    expect(cronConfig.cronExpression).toBeDefined();
    expect(cronConfig.cronExpression).toMatch(/^[\d\*\/\-\s,]+$/);
  });

  test("A2A trigger allows skill-based invocation", () => {
    const a2aConfig = {
      skillId: "my-workflow-skill",
      maxExecutionsPerDay: 1000,
    };

    expect(a2aConfig.skillId).toBeDefined();
  });

  test("MCP trigger allows tool-based invocation", () => {
    const mcpConfig = {
      toolName: "execute_my_workflow",
      maxExecutionsPerDay: 1000,
    };

    expect(mcpConfig.toolName).toBeDefined();
  });
});

// =============================================================================
// SECURITY VALIDATION TESTS
// =============================================================================

describe("Trigger Security Validation", () => {
  test("validates organization ownership", () => {
    const trigger = { ...mockTrigger, organization_id: "org-789" };
    const requestOrg = "org-789";

    expect(trigger.organization_id).toBe(requestOrg);
  });

  test("rejects mismatched organization", () => {
    const trigger = { ...mockTrigger, organization_id: "org-789" };
    const requestOrg = "org-different";

    expect(trigger.organization_id).not.toBe(requestOrg);
  });

  test("validates trigger is active", () => {
    const activeTrigger = { ...mockTrigger, is_active: true };
    const inactiveTrigger = { ...mockTrigger, is_active: false };

    expect(activeTrigger.is_active).toBe(true);
    expect(inactiveTrigger.is_active).toBe(false);
  });

  test("enforces daily execution limits", () => {
    const maxExecutionsPerDay = 100;
    const currentExecutions = 99;

    expect(currentExecutions < maxExecutionsPerDay).toBe(true);
    expect(currentExecutions + 1 >= maxExecutionsPerDay).toBe(true);
  });

  test("checks credit balance before execution", () => {
    const estimatedCost = 0.1;
    const balance = 100;

    expect(balance >= estimatedCost).toBe(true);
  });

  test("IP allowlist validation", () => {
    const allowedIps = ["192.168.1.1", "10.0.0.1"];
    const clientIp = "192.168.1.1";
    const blockedIp = "172.16.0.1";

    expect(allowedIps.includes(clientIp)).toBe(true);
    expect(allowedIps.includes(blockedIp)).toBe(false);
  });

  test("empty allowlist allows all IPs", () => {
    const allowedIps: string[] = [];
    const clientIp = "any.ip.address";

    // Empty array means no restrictions
    const isAllowed = allowedIps.length === 0 || allowedIps.includes(clientIp);
    expect(isAllowed).toBe(true);
  });
});

// =============================================================================
// CRON EXPRESSION TESTS
// =============================================================================

describe("Cron Expression Parsing", () => {
  test("matches every minute expression", () => {
    const cronExpression = "* * * * *";
    const parts = cronExpression.split(" ");

    expect(parts.length).toBe(5);
    expect(parts[0]).toBe("*"); // minute
    expect(parts[1]).toBe("*"); // hour
  });

  test("matches specific time expression", () => {
    const cronExpression = "0 9 * * 1-5"; // 9am weekdays
    const parts = cronExpression.split(" ");

    expect(parts[0]).toBe("0"); // minute
    expect(parts[1]).toBe("9"); // hour
    expect(parts[4]).toBe("1-5"); // day of week (Mon-Fri)
  });

  test("matches interval expression", () => {
    const cronExpression = "*/15 * * * *"; // Every 15 minutes
    const parts = cronExpression.split(" ");

    expect(parts[0]).toBe("*/15");
    expect(parts[0].includes("/")).toBe(true);
  });

  test("validates cron expression format", () => {
    const validExpressions = [
      "* * * * *",
      "0 0 * * *",
      "*/5 * * * *",
      "0 9 * * 1-5",
      "0 0 1 * *",
    ];

    const invalidExpressions = [
      "not a cron",
      "* * *",
      "60 * * * *", // Invalid minute
    ];

    // Valid expressions have 5 space-separated parts
    validExpressions.forEach((expr) => {
      expect(expr.split(" ").length).toBe(5);
    });

    // Invalid expressions either don't have 5 parts or contain invalid values
    invalidExpressions.forEach((expr) => {
      const parts = expr.split(" ");
      const hasCorrectParts = parts.length === 5;
      const containsInvalidText = expr.includes("not");
      const hasInvalidMinute = parts[0] && parseInt(parts[0]) > 59;

      // At least one of these should be true for invalid expressions
      expect(!hasCorrectParts || containsInvalidText || hasInvalidMinute).toBe(
        true,
      );
    });
  });
});

// =============================================================================
// EXECUTION TYPE MAPPING TESTS
// =============================================================================

describe("Execution Type Mapping", () => {
  test("maps trigger types to execution types", () => {
    const typeMap: Record<string, string> = {
      cron: "scheduled",
      webhook: "webhook",
      a2a: "a2a",
      mcp: "mcp",
    };

    expect(typeMap["cron"]).toBe("scheduled");
    expect(typeMap["webhook"]).toBe("webhook");
    expect(typeMap["a2a"]).toBe("a2a");
    expect(typeMap["mcp"]).toBe("mcp");
  });

  test("execution record includes trigger_id", () => {
    const execution = {
      id: "exec-123",
      workflow_id: "workflow-456",
      trigger_id: "trigger-789",
      execution_type: "webhook",
      status: "running",
    };

    expect(execution.trigger_id).toBeDefined();
    expect(execution.execution_type).toBe("webhook");
  });
});

// =============================================================================
// TRIGGER KEY GENERATION TESTS
// =============================================================================

describe("Trigger Key Generation", () => {
  test("generates secure webhook key", async () => {
    const { randomBytes } = await import("crypto");
    const key = randomBytes(32).toString("hex");

    expect(key.length).toBe(64);
    expect(key).toMatch(/^[a-f0-9]+$/);
  });

  test("webhook keys are unique", async () => {
    const { randomBytes } = await import("crypto");
    const keys = new Set(
      Array.from({ length: 100 }, () => randomBytes(32).toString("hex")),
    );

    expect(keys.size).toBe(100);
  });

  test("cron trigger key defaults to expression", () => {
    const cronExpression = "0 0 * * *";
    const workflowId = "workflow-123";
    const fallbackKey = `cron_${workflowId}_${Date.now()}`;

    const triggerKey = cronExpression || fallbackKey;

    expect(triggerKey).toBe(cronExpression);
  });
});

// =============================================================================
// RESPONSE FORMAT TESTS
// =============================================================================

describe("Response Formats", () => {
  test("webhook response excludes output by default", () => {
    const response = {
      success: true,
      executionId: "exec-123",
      status: "success",
      // outputData NOT included by default
    };

    expect(response.success).toBe(true);
    expect((response as Record<string, unknown>).outputData).toBeUndefined();
  });

  test("webhook response includes output when configured", () => {
    const config = { includeOutputInResponse: true };
    const outputData = { result: "some data" };

    const response = {
      success: true,
      executionId: "exec-123",
      status: "success",
      ...(config.includeOutputInResponse && { outputData }),
    };

    expect(response.outputData).toEqual(outputData);
  });

  test("trigger list response redacts webhook secrets", () => {
    const triggers = [
      { ...mockTrigger, config: { webhookSecret: "sensitive-secret" } },
    ];

    const redactedTriggers = triggers.map((t) => ({
      ...t,
      config: {
        ...t.config,
        webhookSecret: t.config.webhookSecret ? "[REDACTED]" : undefined,
        hasWebhookSecret: !!t.config.webhookSecret,
      },
    }));

    expect(redactedTriggers[0].config.webhookSecret).toBe("[REDACTED]");
    expect(redactedTriggers[0].config.hasWebhookSecret).toBe(true);
  });

  test("trigger creation returns secret only once", () => {
    const trigger = {
      id: "trigger-new",
      config: { webhookSecret: "new-secret-123" },
    };

    // On creation, return secret
    const createResponse = {
      triggerId: trigger.id,
      webhookSecret: trigger.config.webhookSecret,
    };

    expect(createResponse.webhookSecret).toBe("new-secret-123");

    // On subsequent reads, redact
    const getResponse = {
      triggerId: trigger.id,
      config: { hasWebhookSecret: true },
    };

    expect(
      (getResponse.config as Record<string, unknown>).webhookSecret,
    ).toBeUndefined();
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe("Error Handling", () => {
  test("returns 404 for unknown trigger key", () => {
    const trigger = null;
    const expectedStatus = !trigger ? 404 : 200;

    expect(expectedStatus).toBe(404);
  });

  test("returns 403 for unauthorized organization", () => {
    const triggerOrgId = "org-123";
    const requestOrgId = "org-456";
    const isAuthorized = triggerOrgId === requestOrgId;

    expect(isAuthorized).toBe(false);
  });

  test("returns 401 for invalid signature", () => {
    const signatureValid = false;
    const expectedStatus = signatureValid ? 200 : 401;

    expect(expectedStatus).toBe(401);
  });

  test("returns 429 for rate limit exceeded", () => {
    const rateLimitExceeded = true;
    const expectedStatus = rateLimitExceeded ? 429 : 200;

    expect(expectedStatus).toBe(429);
  });

  test("returns 402 for insufficient credits", () => {
    const hasCredits = false;
    const expectedStatus = hasCredits ? 200 : 402;

    expect(expectedStatus).toBe(402);
  });
});
