/**
 * Workflow Triggers Integration Tests
 *
 * Tests for the complete trigger flow including API behavior simulation.
 * These tests don't require actual API calls - they test the logic.
 */

import { describe, it, expect } from "bun:test";

// ==========================================================================
// TRIGGER CREATION VALIDATION
// ==========================================================================

describe("Workflow Triggers Integration - Create Validation", () => {
  function validateTriggerConfig(
    triggerType: string,
    config: Record<string, unknown>
  ): { valid: boolean; error?: string } {
    switch (triggerType) {
      case "message_keyword":
        if (!config.keywords || !Array.isArray(config.keywords) || config.keywords.length === 0) {
          return { valid: false, error: "Keyword trigger requires at least one keyword" };
        }
        break;

      case "message_contains":
        if (!config.contains || typeof config.contains !== "string" || config.contains.trim() === "") {
          return { valid: false, error: "Contains trigger requires a non-empty substring" };
        }
        break;

      case "message_from":
        if (!config.phoneNumbers || !Array.isArray(config.phoneNumbers) || config.phoneNumbers.length === 0) {
          return { valid: false, error: "From trigger requires at least one phone number" };
        }
        break;

      case "message_regex":
        if (!config.pattern) {
          return { valid: false, error: "Regex trigger requires a pattern" };
        }
        try {
          new RegExp(config.pattern as string);
        } catch {
          return { valid: false, error: "Invalid regex pattern" };
        }
        break;

      case "schedule":
        if (!config.schedule) {
          return { valid: false, error: "Schedule trigger requires a cron expression" };
        }
        const parts = (config.schedule as string).split(" ");
        if (parts.length < 5 || parts.length > 6) {
          return { valid: false, error: "Invalid cron expression format" };
        }
        break;
    }

    return { valid: true };
  }

  describe("Keyword Trigger Validation", () => {
    it("should reject empty keywords array", () => {
      const result = validateTriggerConfig("message_keyword", { keywords: [] });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("keyword");
    });

    it("should accept valid keywords", () => {
      const result = validateTriggerConfig("message_keyword", { keywords: ["schedule", "calendar"] });
      expect(result.valid).toBe(true);
    });
  });

  describe("Contains Trigger Validation", () => {
    it("should reject empty contains string", () => {
      const result = validateTriggerConfig("message_contains", { contains: "" });
      expect(result.valid).toBe(false);
    });

    it("should reject whitespace-only contains", () => {
      const result = validateTriggerConfig("message_contains", { contains: "   " });
      expect(result.valid).toBe(false);
    });

    it("should accept valid contains string", () => {
      const result = validateTriggerConfig("message_contains", { contains: "appointment" });
      expect(result.valid).toBe(true);
    });
  });

  describe("Regex Trigger Validation", () => {
    it("should reject missing pattern", () => {
      const result = validateTriggerConfig("message_regex", {});
      expect(result.valid).toBe(false);
    });

    it("should reject invalid regex pattern", () => {
      const result = validateTriggerConfig("message_regex", { pattern: "[invalid(" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("regex");
    });

    it("should accept valid regex pattern", () => {
      const result = validateTriggerConfig("message_regex", { pattern: "(schedule|book)" });
      expect(result.valid).toBe(true);
    });
  });

  describe("Schedule Trigger Validation", () => {
    it("should reject missing schedule", () => {
      const result = validateTriggerConfig("schedule", {});
      expect(result.valid).toBe(false);
    });

    it("should reject invalid cron format", () => {
      const result = validateTriggerConfig("schedule", { schedule: "invalid" });
      expect(result.valid).toBe(false);
    });

    it("should accept valid 5-part cron", () => {
      const result = validateTriggerConfig("schedule", { schedule: "0 9 * * *" });
      expect(result.valid).toBe(true);
    });

    it("should accept valid 6-part cron", () => {
      const result = validateTriggerConfig("schedule", { schedule: "0 0 9 * * *" });
      expect(result.valid).toBe(true);
    });
  });
});

// ==========================================================================
// TRIGGER MATCHING FLOW
// ==========================================================================

describe("Workflow Triggers Integration - Matching Flow", () => {
  interface TriggerConfig {
    keywords?: string[];
    contains?: string;
    pattern?: string;
    phoneNumbers?: string[];
    caseSensitive?: boolean;
  }

  interface Trigger {
    id: string;
    workflow_id: string;
    trigger_type: string;
    trigger_config: TriggerConfig;
    response_config: { sendResponse: boolean; responseTemplate?: string };
    provider_filter: string;
    priority: number;
    is_active: boolean;
  }

  interface Message {
    from: string;
    to: string;
    body: string;
    provider: "twilio" | "blooio";
  }

  function findMatchingTrigger(
    triggers: Trigger[],
    message: Message
  ): { trigger: Trigger; matchedValue: string } | null {
    // Sort by priority (highest first)
    const sorted = [...triggers].sort((a, b) => b.priority - a.priority);

    // Filter by provider
    const filtered = sorted.filter(
      (t) => t.is_active && (t.provider_filter === "all" || t.provider_filter === message.provider)
    );

    for (const trigger of filtered) {
      const config = trigger.trigger_config;
      const messageBody = config.caseSensitive
        ? message.body
        : message.body.toLowerCase();

      switch (trigger.trigger_type) {
        case "message_keyword": {
          const keywords = config.keywords || [];
          for (const keyword of keywords) {
            const keywordToMatch = config.caseSensitive ? keyword : keyword.toLowerCase();
            const regex = new RegExp(`\\b${keywordToMatch}\\b`, "i");
            if (regex.test(messageBody)) {
              return { trigger, matchedValue: keyword };
            }
          }
          break;
        }

        case "message_contains": {
          const contains = config.contains || "";
          const containsToMatch = config.caseSensitive ? contains : contains.toLowerCase();
          if (messageBody.includes(containsToMatch)) {
            return { trigger, matchedValue: contains };
          }
          break;
        }

        case "message_regex": {
          if (config.pattern) {
            try {
              const flags = config.caseSensitive ? "" : "i";
              const regex = new RegExp(config.pattern, flags);
              const match = message.body.match(regex);
              if (match) {
                return { trigger, matchedValue: match[0] };
              }
            } catch {
              // Skip invalid regex
            }
          }
          break;
        }
      }
    }

    return null;
  }

  it("should find matching trigger with highest priority", () => {
    const triggers: Trigger[] = [
      {
        id: "low",
        workflow_id: "wf1",
        trigger_type: "message_keyword",
        trigger_config: { keywords: ["schedule"] },
        response_config: { sendResponse: true },
        provider_filter: "all",
        priority: 0,
        is_active: true,
      },
      {
        id: "high",
        workflow_id: "wf2",
        trigger_type: "message_keyword",
        trigger_config: { keywords: ["schedule"] },
        response_config: { sendResponse: true },
        provider_filter: "all",
        priority: 10,
        is_active: true,
      },
    ];

    const result = findMatchingTrigger(triggers, {
      from: "+1234567890",
      to: "+0987654321",
      body: "show me my schedule",
      provider: "twilio",
    });

    expect(result).not.toBeNull();
    expect(result?.trigger.id).toBe("high");
  });

  it("should filter by provider", () => {
    const triggers: Trigger[] = [
      {
        id: "twilio-only",
        workflow_id: "wf1",
        trigger_type: "message_keyword",
        trigger_config: { keywords: ["schedule"] },
        response_config: { sendResponse: true },
        provider_filter: "twilio",
        priority: 10,
        is_active: true,
      },
      {
        id: "all-providers",
        workflow_id: "wf2",
        trigger_type: "message_keyword",
        trigger_config: { keywords: ["schedule"] },
        response_config: { sendResponse: true },
        provider_filter: "all",
        priority: 0,
        is_active: true,
      },
    ];

    // Should match twilio-only trigger for twilio provider
    const twilioResult = findMatchingTrigger(triggers, {
      from: "+1234567890",
      to: "+0987654321",
      body: "schedule",
      provider: "twilio",
    });
    expect(twilioResult?.trigger.id).toBe("twilio-only");

    // Should only match all-providers trigger for blooio
    const blooioResult = findMatchingTrigger(triggers, {
      from: "+1234567890",
      to: "+0987654321",
      body: "schedule",
      provider: "blooio",
    });
    expect(blooioResult?.trigger.id).toBe("all-providers");
  });

  it("should skip inactive triggers", () => {
    const triggers: Trigger[] = [
      {
        id: "inactive",
        workflow_id: "wf1",
        trigger_type: "message_keyword",
        trigger_config: { keywords: ["schedule"] },
        response_config: { sendResponse: true },
        provider_filter: "all",
        priority: 100,
        is_active: false,
      },
      {
        id: "active",
        workflow_id: "wf2",
        trigger_type: "message_keyword",
        trigger_config: { keywords: ["schedule"] },
        response_config: { sendResponse: true },
        provider_filter: "all",
        priority: 0,
        is_active: true,
      },
    ];

    const result = findMatchingTrigger(triggers, {
      from: "+1234567890",
      to: "+0987654321",
      body: "schedule",
      provider: "twilio",
    });

    expect(result?.trigger.id).toBe("active");
  });

  it("should return null when no trigger matches", () => {
    const triggers: Trigger[] = [
      {
        id: "1",
        workflow_id: "wf1",
        trigger_type: "message_keyword",
        trigger_config: { keywords: ["help"] },
        response_config: { sendResponse: true },
        provider_filter: "all",
        priority: 0,
        is_active: true,
      },
    ];

    const result = findMatchingTrigger(triggers, {
      from: "+1234567890",
      to: "+0987654321",
      body: "random message",
      provider: "twilio",
    });

    expect(result).toBeNull();
  });
});

// ==========================================================================
// EXECUTION FLOW SIMULATION
// ==========================================================================

describe("Workflow Triggers Integration - Execution Flow", () => {
  interface ExecutionResult {
    success: boolean;
    output?: Record<string, unknown>;
    error?: string;
    executionTimeMs: number;
  }

  interface TriggerExecutionResult {
    success: boolean;
    workflowId: string;
    triggerId: string;
    response?: string;
    error?: string;
  }

  function simulateExecution(
    triggerId: string,
    workflowId: string,
    workflowResult: ExecutionResult,
    responseConfig: { sendResponse: boolean; responseTemplate?: string }
  ): TriggerExecutionResult {
    if (!workflowResult.success) {
      return {
        success: false,
        workflowId,
        triggerId,
        error: workflowResult.error,
      };
    }

    let response: string | undefined;
    if (responseConfig.sendResponse && workflowResult.output) {
      if (responseConfig.responseTemplate) {
        response = responseConfig.responseTemplate;
        for (const [key, value] of Object.entries(workflowResult.output)) {
          response = response.replace(
            new RegExp(`\\{\\{${key}\\}\\}`, "g"),
            String(value)
          );
        }
      } else if (typeof workflowResult.output.message === "string") {
        response = workflowResult.output.message;
      } else {
        response = "Workflow executed successfully.";
      }
    }

    return {
      success: true,
      workflowId,
      triggerId,
      response,
    };
  }

  it("should return success with response when workflow succeeds", () => {
    const result = simulateExecution(
      "trigger-1",
      "workflow-1",
      {
        success: true,
        output: { summary: "3 meetings today", count: 3 },
        executionTimeMs: 150,
      },
      {
        sendResponse: true,
        responseTemplate: "Your schedule: {{summary}}",
      }
    );

    expect(result.success).toBe(true);
    expect(result.response).toBe("Your schedule: 3 meetings today");
  });

  it("should return error when workflow fails", () => {
    const result = simulateExecution(
      "trigger-1",
      "workflow-1",
      {
        success: false,
        error: "API connection failed",
        executionTimeMs: 50,
      },
      { sendResponse: true }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("API connection failed");
    expect(result.response).toBeUndefined();
  });

  it("should not send response when sendResponse is false", () => {
    const result = simulateExecution(
      "trigger-1",
      "workflow-1",
      {
        success: true,
        output: { data: "test" },
        executionTimeMs: 100,
      },
      { sendResponse: false }
    );

    expect(result.success).toBe(true);
    expect(result.response).toBeUndefined();
  });

  it("should use message field as default response", () => {
    const result = simulateExecution(
      "trigger-1",
      "workflow-1",
      {
        success: true,
        output: { message: "Email sent successfully" },
        executionTimeMs: 200,
      },
      { sendResponse: true }
    );

    expect(result.response).toBe("Email sent successfully");
  });

  it("should use default message when no template or message field", () => {
    const result = simulateExecution(
      "trigger-1",
      "workflow-1",
      {
        success: true,
        output: { someData: 123 },
        executionTimeMs: 100,
      },
      { sendResponse: true }
    );

    expect(result.response).toBe("Workflow executed successfully.");
  });
});

// ==========================================================================
// COMPLETE WEBHOOK FLOW SIMULATION
// ==========================================================================

describe("Workflow Triggers Integration - Complete Webhook Flow", () => {
  it("should simulate complete Twilio webhook flow", () => {
    // Simulate incoming message
    const incomingMessage = {
      from: "+15551234567",
      to: "+15559876543",
      body: "schedule",
      provider: "twilio" as const,
      messageSid: "SM123",
    };

    // Simulate active triggers for org
    const activeTriggers = [
      {
        id: "trigger-1",
        workflow_id: "workflow-1",
        trigger_type: "message_keyword",
        trigger_config: { keywords: ["schedule", "calendar"] },
        response_config: { sendResponse: true, responseTemplate: "Here's your schedule: {{summary}}" },
        provider_filter: "all",
        priority: 10,
        is_active: true,
      },
    ];

    // Step 1: Find matching trigger
    let matchedTrigger = null;
    for (const trigger of activeTriggers) {
      if (trigger.trigger_type === "message_keyword") {
        const keywords = trigger.trigger_config.keywords || [];
        for (const keyword of keywords) {
          const regex = new RegExp(`\\b${keyword}\\b`, "i");
          if (regex.test(incomingMessage.body)) {
            matchedTrigger = trigger;
            break;
          }
        }
      }
      if (matchedTrigger) break;
    }

    expect(matchedTrigger).not.toBeNull();
    expect(matchedTrigger?.id).toBe("trigger-1");

    // Step 2: Execute workflow (simulated)
    const workflowResult = {
      success: true,
      output: { summary: "Meeting at 3pm, Call at 5pm" },
      executionTimeMs: 250,
    };

    // Step 3: Build response
    let response = matchedTrigger!.response_config.responseTemplate || "";
    for (const [key, value] of Object.entries(workflowResult.output)) {
      response = response.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, "g"),
        String(value)
      );
    }

    expect(response).toBe("Here's your schedule: Meeting at 3pm, Call at 5pm");

    // Step 4: Response would be sent back via Twilio
    const twilioResponse = {
      to: incomingMessage.from,
      from: incomingMessage.to,
      body: response,
    };

    expect(twilioResponse.to).toBe("+15551234567");
    expect(twilioResponse.from).toBe("+15559876543");
    expect(twilioResponse.body).toContain("schedule");
  });

  it("should fall through to agent when no trigger matches", () => {
    const incomingMessage = {
      from: "+15551234567",
      to: "+15559876543",
      body: "hello there",
      provider: "twilio" as const,
    };

    const activeTriggers = [
      {
        id: "trigger-1",
        trigger_type: "message_keyword",
        trigger_config: { keywords: ["schedule"] },
        provider_filter: "all",
        is_active: true,
      },
    ];

    // Check triggers
    let matchedTrigger = null;
    for (const trigger of activeTriggers) {
      if (trigger.trigger_type === "message_keyword") {
        const keywords = trigger.trigger_config.keywords || [];
        for (const keyword of keywords) {
          const regex = new RegExp(`\\b${keyword}\\b`, "i");
          if (regex.test(incomingMessage.body)) {
            matchedTrigger = trigger;
            break;
          }
        }
      }
    }

    // No trigger matched - should route to agent
    expect(matchedTrigger).toBeNull();

    // This is where messageRouterService.routeIncomingMessage would be called
    const shouldRouteToAgent = matchedTrigger === null;
    expect(shouldRouteToAgent).toBe(true);
  });
});
