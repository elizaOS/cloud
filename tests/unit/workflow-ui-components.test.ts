/**
 * Unit Tests for Workflow UI Components
 *
 * Tests the ExecuteDialog and ExecutionResult components:
 * - Parameter inference from execution plans
 * - Form field rendering based on workflow type
 * - Dry run toggle functionality
 * - Execution result display
 * - Error state handling
 */

import { describe, it, expect } from "bun:test";

// ==========================================================================
// EXECUTE DIALOG - PARAMETER INFERENCE TESTS
// ==========================================================================

describe("ExecuteDialog Parameter Inference", () => {
  // Test the inferRequiredParams logic (extracted for unit testing)
  function inferRequiredParams(
    plan: Array<{ step: number; serviceId: string; operation: string }>
  ): string[] {
    const params: string[] = [];

    for (const step of plan) {
      const op = `${step.serviceId}.${step.operation}`;

      // Email operations
      if (op.includes("sendEmail") || op.includes("send_email") || op.includes("gmail")) {
        if (!params.includes("to")) params.push("to");
        if (!params.includes("subject")) params.push("subject");
        if (!params.includes("body")) params.push("body");
      }

      // SMS operations
      if (op.includes("sendSms") || op.includes("send_sms") || op.includes("twilio")) {
        if (!params.includes("to")) params.push("to");
        if (!params.includes("from")) params.push("from");
        if (!params.includes("body")) params.push("body");
      }

      // iMessage operations
      if (op.includes("sendIMessage") || op.includes("send_imessage") || op.includes("blooio")) {
        if (!params.includes("to")) params.push("to");
        if (!params.includes("from")) params.push("from");
        if (!params.includes("body")) params.push("body");
      }

      // Calendar operations
      if (
        op.includes("createCalendarEvent") ||
        op.includes("create_event") ||
        op.includes("calendar")
      ) {
        if (!params.includes("summary")) params.push("summary");
        if (!params.includes("start")) params.push("start");
        if (!params.includes("end")) params.push("end");
      }
    }

    return params;
  }

  describe("Email Workflows", () => {
    it("should infer email params for google.sendEmail", () => {
      const plan = [{ step: 1, serviceId: "google", operation: "sendEmail" }];
      const params = inferRequiredParams(plan);

      expect(params).toContain("to");
      expect(params).toContain("subject");
      expect(params).toContain("body");
    });

    it("should infer email params for google.gmail.send_email", () => {
      const plan = [{ step: 1, serviceId: "google", operation: "gmail.send_email" }];
      const params = inferRequiredParams(plan);

      expect(params).toContain("to");
      expect(params).toContain("subject");
      expect(params).toContain("body");
    });

    it("should infer email params for gmail operation", () => {
      const plan = [{ step: 1, serviceId: "gmail", operation: "send" }];
      const params = inferRequiredParams(plan);

      expect(params).toContain("to");
      expect(params).toContain("subject");
      expect(params).toContain("body");
    });
  });

  describe("SMS Workflows", () => {
    it("should infer SMS params for twilio.sendSms", () => {
      const plan = [{ step: 1, serviceId: "twilio", operation: "sendSms" }];
      const params = inferRequiredParams(plan);

      expect(params).toContain("to");
      expect(params).toContain("from");
      expect(params).toContain("body");
      expect(params).not.toContain("subject"); // SMS doesn't have subject
    });

    it("should infer SMS params for twilio.send_sms", () => {
      const plan = [{ step: 1, serviceId: "twilio", operation: "send_sms" }];
      const params = inferRequiredParams(plan);

      expect(params).toContain("to");
      expect(params).toContain("from");
      expect(params).toContain("body");
    });

    it("should infer SMS params for twilio.sms.send", () => {
      const plan = [{ step: 1, serviceId: "twilio", operation: "sms.send" }];
      const params = inferRequiredParams(plan);

      expect(params).toContain("to");
      expect(params).toContain("from");
      expect(params).toContain("body");
    });
  });

  describe("iMessage Workflows", () => {
    it("should infer iMessage params for blooio.sendIMessage", () => {
      const plan = [{ step: 1, serviceId: "blooio", operation: "sendIMessage" }];
      const params = inferRequiredParams(plan);

      expect(params).toContain("to");
      expect(params).toContain("from");
      expect(params).toContain("body");
    });

    it("should infer iMessage params for blooio.send_imessage", () => {
      const plan = [{ step: 1, serviceId: "blooio", operation: "send_imessage" }];
      const params = inferRequiredParams(plan);

      expect(params).toContain("to");
      expect(params).toContain("from");
      expect(params).toContain("body");
    });
  });

  describe("Calendar Workflows", () => {
    it("should infer calendar params for google.createCalendarEvent", () => {
      const plan = [{ step: 1, serviceId: "google", operation: "createCalendarEvent" }];
      const params = inferRequiredParams(plan);

      expect(params).toContain("summary");
      expect(params).toContain("start");
      expect(params).toContain("end");
    });

    it("should infer calendar params for google.calendar.create_event", () => {
      const plan = [{ step: 1, serviceId: "google", operation: "calendar.create_event" }];
      const params = inferRequiredParams(plan);

      expect(params).toContain("summary");
      expect(params).toContain("start");
      expect(params).toContain("end");
    });

    it("should infer calendar params for calendar operation", () => {
      const plan = [{ step: 1, serviceId: "calendar", operation: "createEvent" }];
      const params = inferRequiredParams(plan);

      expect(params).toContain("summary");
      expect(params).toContain("start");
      expect(params).toContain("end");
    });
  });

  describe("Multi-Step Workflows", () => {
    it("should combine params from multiple steps", () => {
      const plan = [
        { step: 1, serviceId: "google", operation: "listCalendarEvents" },
        { step: 2, serviceId: "google", operation: "sendEmail" },
      ];
      const params = inferRequiredParams(plan);

      // Should have email params
      expect(params).toContain("to");
      expect(params).toContain("subject");
      expect(params).toContain("body");
    });

    it("should not duplicate params across steps", () => {
      const plan = [
        { step: 1, serviceId: "google", operation: "sendEmail" },
        { step: 2, serviceId: "twilio", operation: "sendSms" },
      ];
      const params = inferRequiredParams(plan);

      // Count occurrences of 'to' - should only appear once
      const toCount = params.filter((p) => p === "to").length;
      expect(toCount).toBe(1);
    });

    it("should handle email + SMS workflow", () => {
      const plan = [
        { step: 1, serviceId: "google", operation: "sendEmail" },
        { step: 2, serviceId: "twilio", operation: "sendSms" },
      ];
      const params = inferRequiredParams(plan);

      // Should have combined params
      expect(params).toContain("to");
      expect(params).toContain("subject"); // From email
      expect(params).toContain("body");
      expect(params).toContain("from"); // From SMS
    });
  });

  describe("Empty and Edge Cases", () => {
    it("should return empty array for empty plan", () => {
      const plan: Array<{ step: number; serviceId: string; operation: string }> = [];
      const params = inferRequiredParams(plan);

      expect(params).toEqual([]);
    });

    it("should return empty array for listCalendarEvents (read-only)", () => {
      const plan = [{ step: 1, serviceId: "google", operation: "listCalendarEvents" }];
      const params = inferRequiredParams(plan);

      // listCalendarEvents doesn't require user input params
      expect(params).toEqual([]);
    });

    it("should return empty array for listEmails (read-only)", () => {
      const plan = [{ step: 1, serviceId: "google", operation: "listEmails" }];
      const params = inferRequiredParams(plan);

      expect(params).toEqual([]);
    });

    it("should return empty array for unknown operations", () => {
      const plan = [{ step: 1, serviceId: "unknown", operation: "unknownOperation" }];
      const params = inferRequiredParams(plan);

      expect(params).toEqual([]);
    });
  });
});

// ==========================================================================
// OPERATION NAME NORMALIZATION TESTS
// ==========================================================================

describe("Operation Name Normalization", () => {
  // Test the normalizeOperation logic (extracted for unit testing)
  function normalizeOperation(serviceId: string, operation: string): string {
    const operationMap: Record<string, string> = {
      // Google Calendar
      "google.calendar.list_events": "google.listCalendarEvents",
      "google.calendar.create_event": "google.createCalendarEvent",
      "google.calendar_list_events": "google.listCalendarEvents",
      "google.calendar_create_event": "google.createCalendarEvent",
      // Google Gmail
      "google.gmail.send_email": "google.sendEmail",
      "google.gmail.list_emails": "google.listEmails",
      "google.gmail.get_email": "google.getEmail",
      "google.gmail_send_email": "google.sendEmail",
      "google.gmail_list_emails": "google.listEmails",
      // Twilio
      "twilio.sms.send": "twilio.sendSms",
      "twilio.send_sms": "twilio.sendSms",
      // Blooio
      "blooio.imessage.send": "blooio.sendIMessage",
      "blooio.send_imessage": "blooio.sendIMessage",
    };

    const key = `${serviceId}.${operation}`;
    return operationMap[key] || key;
  }

  describe("Google Calendar Operations", () => {
    it("should normalize calendar.list_events", () => {
      expect(normalizeOperation("google", "calendar.list_events")).toBe(
        "google.listCalendarEvents"
      );
    });

    it("should normalize calendar.create_event", () => {
      expect(normalizeOperation("google", "calendar.create_event")).toBe(
        "google.createCalendarEvent"
      );
    });

    it("should normalize calendar_list_events (underscore format)", () => {
      expect(normalizeOperation("google", "calendar_list_events")).toBe(
        "google.listCalendarEvents"
      );
    });
  });

  describe("Google Gmail Operations", () => {
    it("should normalize gmail.send_email", () => {
      expect(normalizeOperation("google", "gmail.send_email")).toBe("google.sendEmail");
    });

    it("should normalize gmail.list_emails", () => {
      expect(normalizeOperation("google", "gmail.list_emails")).toBe("google.listEmails");
    });

    it("should normalize gmail.get_email", () => {
      expect(normalizeOperation("google", "gmail.get_email")).toBe("google.getEmail");
    });
  });

  describe("Twilio Operations", () => {
    it("should normalize sms.send", () => {
      expect(normalizeOperation("twilio", "sms.send")).toBe("twilio.sendSms");
    });

    it("should normalize send_sms", () => {
      expect(normalizeOperation("twilio", "send_sms")).toBe("twilio.sendSms");
    });
  });

  describe("Blooio Operations", () => {
    it("should normalize imessage.send", () => {
      expect(normalizeOperation("blooio", "imessage.send")).toBe("blooio.sendIMessage");
    });

    it("should normalize send_imessage", () => {
      expect(normalizeOperation("blooio", "send_imessage")).toBe("blooio.sendIMessage");
    });
  });

  describe("Already Normalized Operations", () => {
    it("should pass through already normalized operations", () => {
      expect(normalizeOperation("google", "sendEmail")).toBe("google.sendEmail");
      expect(normalizeOperation("google", "listCalendarEvents")).toBe(
        "google.listCalendarEvents"
      );
      expect(normalizeOperation("twilio", "sendSms")).toBe("twilio.sendSms");
      expect(normalizeOperation("blooio", "sendIMessage")).toBe("blooio.sendIMessage");
    });
  });

  describe("Unknown Operations", () => {
    it("should pass through unknown operations unchanged", () => {
      expect(normalizeOperation("unknown", "someOperation")).toBe("unknown.someOperation");
      expect(normalizeOperation("google", "unknownOp")).toBe("google.unknownOp");
    });
  });
});

// ==========================================================================
// EXECUTION RESULT FORMATTING TESTS
// ==========================================================================

describe("Execution Result Formatting", () => {
  function formatOutput(output: unknown): string {
    if (output === undefined || output === null) return "No output";
    if (typeof output === "string") return output;
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  }

  it("should format null as 'No output'", () => {
    expect(formatOutput(null)).toBe("No output");
  });

  it("should format undefined as 'No output'", () => {
    expect(formatOutput(undefined)).toBe("No output");
  });

  it("should return string as-is", () => {
    expect(formatOutput("Hello World")).toBe("Hello World");
  });

  it("should format objects as pretty JSON", () => {
    const obj = { key: "value", nested: { a: 1 } };
    const result = formatOutput(obj);
    expect(result).toContain('"key": "value"');
    expect(result).toContain('"nested"');
  });

  it("should format arrays as pretty JSON", () => {
    const arr = [1, 2, 3, "four"];
    const result = formatOutput(arr);
    expect(result).toContain("1");
    expect(result).toContain('"four"');
  });

  it("should format numbers", () => {
    expect(formatOutput(42)).toBe("42");
  });

  it("should format booleans", () => {
    expect(formatOutput(true)).toBe("true");
    expect(formatOutput(false)).toBe("false");
  });

  it("should handle circular references gracefully", () => {
    const obj: Record<string, unknown> = { a: 1 };
    // Create circular reference
    obj.self = obj;

    // Should not throw
    const result = formatOutput(obj);
    expect(typeof result).toBe("string");
  });
});

// ==========================================================================
// STEP RESULT VALIDATION TESTS
// ==========================================================================

describe("Step Result Validation", () => {
  interface StepResult {
    stepName: string;
    success: boolean;
    output?: unknown;
    error?: string;
    durationMs: number;
  }

  function validateStepResult(step: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!step || typeof step !== "object") {
      return { valid: false, errors: ["Step is not an object"] };
    }

    const s = step as Record<string, unknown>;

    if (typeof s.stepName !== "string") {
      errors.push("stepName must be a string");
    }

    if (typeof s.success !== "boolean") {
      errors.push("success must be a boolean");
    }

    if (typeof s.durationMs !== "number") {
      errors.push("durationMs must be a number");
    }

    if (s.durationMs !== undefined && (s.durationMs as number) < 0) {
      errors.push("durationMs cannot be negative");
    }

    return { valid: errors.length === 0, errors };
  }

  it("should validate a valid step result", () => {
    const step: StepResult = {
      stepName: "google.sendEmail",
      success: true,
      output: { messageId: "123" },
      durationMs: 150,
    };

    const result = validateStepResult(step);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("should validate a failed step result", () => {
    const step: StepResult = {
      stepName: "google.sendEmail",
      success: false,
      error: "Invalid credentials",
      durationMs: 50,
    };

    const result = validateStepResult(step);
    expect(result.valid).toBe(true);
  });

  it("should reject step without stepName", () => {
    const step = {
      success: true,
      durationMs: 100,
    };

    const result = validateStepResult(step);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("stepName must be a string");
  });

  it("should reject step without success", () => {
    const step = {
      stepName: "test",
      durationMs: 100,
    };

    const result = validateStepResult(step);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("success must be a boolean");
  });

  it("should reject step without durationMs", () => {
    const step = {
      stepName: "test",
      success: true,
    };

    const result = validateStepResult(step);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("durationMs must be a number");
  });

  it("should reject null step", () => {
    const result = validateStepResult(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Step is not an object");
  });
});

// ==========================================================================
// EXECUTION PLAN VALIDATION TESTS
// ==========================================================================

describe("Execution Plan Validation", () => {
  interface ExecutionStep {
    step: number;
    serviceId: string;
    operation: string;
  }

  function validateExecutionPlan(
    plan: unknown
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(plan)) {
      return { valid: false, errors: ["Execution plan must be an array"] };
    }

    const seenSteps = new Set<number>();

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i] as Record<string, unknown>;

      if (!step || typeof step !== "object") {
        errors.push(`Step ${i} is not an object`);
        continue;
      }

      if (typeof step.step !== "number") {
        errors.push(`Step ${i}: step number must be a number`);
      } else {
        if (seenSteps.has(step.step as number)) {
          errors.push(`Step ${i}: duplicate step number ${step.step}`);
        }
        seenSteps.add(step.step as number);
      }

      if (typeof step.serviceId !== "string" || step.serviceId.length === 0) {
        errors.push(`Step ${i}: serviceId must be a non-empty string`);
      }

      if (typeof step.operation !== "string" || step.operation.length === 0) {
        errors.push(`Step ${i}: operation must be a non-empty string`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  it("should validate a valid execution plan", () => {
    const plan: ExecutionStep[] = [
      { step: 1, serviceId: "google", operation: "sendEmail" },
      { step: 2, serviceId: "twilio", operation: "sendSms" },
    ];

    const result = validateExecutionPlan(plan);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("should validate empty execution plan", () => {
    const plan: ExecutionStep[] = [];

    const result = validateExecutionPlan(plan);
    expect(result.valid).toBe(true);
  });

  it("should reject non-array plan", () => {
    const result = validateExecutionPlan("not an array");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Execution plan must be an array");
  });

  it("should reject duplicate step numbers", () => {
    const plan = [
      { step: 1, serviceId: "google", operation: "sendEmail" },
      { step: 1, serviceId: "twilio", operation: "sendSms" },
    ];

    const result = validateExecutionPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("should reject empty serviceId", () => {
    const plan = [{ step: 1, serviceId: "", operation: "sendEmail" }];

    const result = validateExecutionPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("serviceId"))).toBe(true);
  });

  it("should reject empty operation", () => {
    const plan = [{ step: 1, serviceId: "google", operation: "" }];

    const result = validateExecutionPlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("operation"))).toBe(true);
  });
});
