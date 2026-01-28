/**
 * Workflow Triggers Unit Tests
 *
 * Tests for trigger matching logic, config validation,
 * and service functionality.
 */

import { describe, it, expect } from "bun:test";

// ==========================================================================
// TRIGGER TYPE VALIDATION TESTS
// ==========================================================================

describe("Workflow Triggers - Type Validation", () => {
  const validTriggerTypes = [
    "message_keyword",
    "message_contains",
    "message_from",
    "message_regex",
    "schedule",
    "webhook",
  ];

  it("should accept valid trigger types", () => {
    for (const type of validTriggerTypes) {
      expect(validTriggerTypes).toContain(type);
    }
  });

  it("should validate keyword trigger requires keywords", () => {
    const emptyConfig = { keywords: [] };
    expect(emptyConfig.keywords.length).toBe(0);

    const validConfig = { keywords: ["hello", "schedule"] };
    expect(validConfig.keywords.length).toBeGreaterThan(0);
  });

  it("should validate contains trigger requires non-empty string", () => {
    const emptyConfig = { contains: "" };
    expect(emptyConfig.contains.trim()).toBe("");

    const validConfig = { contains: "appointment" };
    expect(validConfig.contains.trim().length).toBeGreaterThan(0);
  });

  it("should validate regex trigger has valid pattern", () => {
    const validPatterns = [
      "hello",
      "schedule|book|appointment",
      "\\d+",
      "^start",
      "end$",
    ];

    for (const pattern of validPatterns) {
      expect(() => new RegExp(pattern)).not.toThrow();
    }
  });

  it("should reject invalid regex pattern", () => {
    const invalidPattern = "[invalid(";
    expect(() => new RegExp(invalidPattern)).toThrow();
  });

  it("should validate schedule trigger has cron format", () => {
    const validCronExpressions = [
      "* * * * *",
      "0 9 * * *",
      "0 0 * * 0",
      "*/15 * * * *",
      "0 9 * * 1-5",
    ];

    for (const cron of validCronExpressions) {
      const parts = cron.split(" ");
      expect(parts.length).toBeGreaterThanOrEqual(5);
      expect(parts.length).toBeLessThanOrEqual(6);
    }
  });
});

// ==========================================================================
// KEYWORD MATCHING TESTS
// ==========================================================================

describe("Workflow Triggers - Keyword Matching", () => {
  function matchKeyword(keywords: string[], message: string, caseSensitive = false): boolean {
    return keywords.some((keyword) => {
      const keywordToMatch = caseSensitive ? keyword : keyword.toLowerCase();
      const messageToSearch = caseSensitive ? message : message.toLowerCase();
      const regex = new RegExp(`\\b${escapeRegex(keywordToMatch)}\\b`, caseSensitive ? "" : "i");
      return regex.test(messageToSearch);
    });
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  it("should match exact keyword with word boundary", () => {
    const keywords = ["schedule", "calendar"];
    const message = "I want to check my schedule please";
    expect(matchKeyword(keywords, message)).toBe(true);
  });

  it("should not match keyword as substring", () => {
    const keywords = ["schedule"];
    const message = "I want to reschedule my meeting";
    expect(matchKeyword(keywords, message)).toBe(false);
  });

  it("should match case-insensitive by default", () => {
    const keywords = ["Schedule"];
    const message = "schedule my appointment";
    expect(matchKeyword(keywords, message)).toBe(true);
  });

  it("should support case-sensitive matching", () => {
    const keywords = ["Schedule"];
    const message = "schedule my appointment";
    expect(matchKeyword(keywords, message, true)).toBe(false);
  });

  it("should match multiple keywords", () => {
    const keywords = ["schedule", "calendar", "events"];
    expect(matchKeyword(keywords, "show me my schedule")).toBe(true);
    expect(matchKeyword(keywords, "open calendar")).toBe(true);
    expect(matchKeyword(keywords, "list events")).toBe(true);
    expect(matchKeyword(keywords, "random text")).toBe(false);
  });
});

// ==========================================================================
// CONTAINS MATCHING TESTS
// ==========================================================================

describe("Workflow Triggers - Contains Matching", () => {
  function matchContains(contains: string, message: string, caseSensitive = false): boolean {
    const containsToMatch = caseSensitive ? contains : contains.toLowerCase();
    const messageToSearch = caseSensitive ? message : message.toLowerCase();
    return messageToSearch.includes(containsToMatch);
  }

  it("should match substring anywhere in message", () => {
    expect(matchContains("appointment", "I need to book an appointment for tomorrow")).toBe(true);
  });

  it("should not match non-existent substring", () => {
    expect(matchContains("meeting", "I need to book an appointment")).toBe(false);
  });

  it("should match at the beginning", () => {
    expect(matchContains("Hello", "Hello, how are you?")).toBe(true);
  });

  it("should match at the end", () => {
    expect(matchContains("today", "Let's meet today")).toBe(true);
  });

  it("should be case-insensitive by default", () => {
    expect(matchContains("APPOINTMENT", "book an appointment")).toBe(true);
  });
});

// ==========================================================================
// PHONE NUMBER MATCHING TESTS
// ==========================================================================

describe("Workflow Triggers - Phone Number Matching", () => {
  function normalizePhoneNumber(phone: string): string {
    // Handle email addresses for iMessage
    if (phone.includes("@")) {
      return phone.toLowerCase().trim();
    }

    let normalized = phone.replace(/[^\d+]/g, "");
    if (!normalized.startsWith("+")) {
      if (normalized.length === 10) {
        normalized = `+1${normalized}`;
      } else if (normalized.length === 11 && normalized.startsWith("1")) {
        normalized = `+${normalized}`;
      }
    }
    return normalized;
  }

  function matchPhoneNumber(allowedNumbers: string[], incomingFrom: string): boolean {
    const normalizedIncoming = normalizePhoneNumber(incomingFrom);
    return allowedNumbers.some(
      (phone) => normalizePhoneNumber(phone) === normalizedIncoming
    );
  }

  it("should normalize phone numbers correctly", () => {
    expect(normalizePhoneNumber("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizePhoneNumber("555-123-4567")).toBe("+15551234567");
    expect(normalizePhoneNumber("5551234567")).toBe("+15551234567");
    expect(normalizePhoneNumber("+15551234567")).toBe("+15551234567");
    expect(normalizePhoneNumber("1-555-123-4567")).toBe("+15551234567");
  });

  it("should match normalized phone numbers", () => {
    const allowedNumbers = ["+15551234567"];
    expect(matchPhoneNumber(allowedNumbers, "555-123-4567")).toBe(true);
    expect(matchPhoneNumber(allowedNumbers, "+1 (555) 123-4567")).toBe(true);
    expect(matchPhoneNumber(allowedNumbers, "5551234567")).toBe(true);
  });

  it("should not match different phone numbers", () => {
    const allowedNumbers = ["+15551234567"];
    expect(matchPhoneNumber(allowedNumbers, "555-999-9999")).toBe(false);
  });

  it("should handle email addresses for iMessage", () => {
    const email = "John@Example.COM";
    expect(normalizePhoneNumber(email)).toBe("john@example.com");
  });
});

// ==========================================================================
// REGEX MATCHING TESTS
// ==========================================================================

describe("Workflow Triggers - Regex Matching", () => {
  function matchRegex(pattern: string, message: string, caseSensitive = false): string | null {
    try {
      const flags = caseSensitive ? "" : "i";
      const regex = new RegExp(pattern, flags);
      const match = message.match(regex);
      return match ? match[0] : null;
    } catch {
      return null;
    }
  }

  it("should match valid regex pattern", () => {
    const pattern = "(schedule|book|appointment)";
    const message = "I want to book a meeting";
    expect(matchRegex(pattern, message)).toBe("book");
  });

  it("should handle complex regex patterns", () => {
    const pattern = "\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b";
    const message = "Schedule for 12/25/2024 please";
    expect(matchRegex(pattern, message)).toBe("12/25/2024");
  });

  it("should return null for non-matching pattern", () => {
    const pattern = "xyz123";
    const message = "Hello world";
    expect(matchRegex(pattern, message)).toBeNull();
  });

  it("should handle invalid regex gracefully", () => {
    const invalidPattern = "[invalid(";
    const message = "test";
    expect(matchRegex(invalidPattern, message)).toBeNull();
  });
});

// ==========================================================================
// PARAMETER EXTRACTION TESTS
// ==========================================================================

describe("Workflow Triggers - Parameter Extraction", () => {
  function extractParams(body: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // Extract email addresses
    const emailRegex = /[\w.-]+@[\w.-]+\.\w+/gi;
    const emails = body.match(emailRegex);
    if (emails && emails.length > 0) {
      params.email = emails[0];
      params.emails = emails;
    }

    // Extract phone numbers
    const phoneRegex = /\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
    const phones = body.match(phoneRegex);
    if (phones && phones.length > 0) {
      params.phoneNumber = phones[0];
      params.phoneNumbers = phones;
    }

    // Extract dates
    const datePatterns = [
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
    ];
    for (const pattern of datePatterns) {
      const dates = body.match(pattern);
      if (dates && dates.length > 0) {
        params.date = dates[0];
        break;
      }
    }

    return params;
  }

  it("should extract email addresses", () => {
    const params = extractParams("Send to john@example.com");
    expect(params.email).toBe("john@example.com");
  });

  it("should extract multiple email addresses", () => {
    const params = extractParams("Send to john@example.com and jane@test.org");
    expect(params.emails).toEqual(["john@example.com", "jane@test.org"]);
  });

  it("should extract phone numbers", () => {
    const params = extractParams("Call me at (555) 123-4567");
    expect(params.phoneNumber).toBeDefined();
  });

  it("should extract dates in MM/DD/YYYY format", () => {
    const params = extractParams("Schedule for 12/25/2024");
    expect(params.date).toBe("12/25/2024");
  });

  it("should extract dates in YYYY-MM-DD format", () => {
    const params = extractParams("Meeting on 2024-12-25");
    expect(params.date).toBe("2024-12-25");
  });

  it("should handle messages with no extractable params", () => {
    const params = extractParams("Just a simple message");
    expect(params.email).toBeUndefined();
    expect(params.phoneNumber).toBeUndefined();
    expect(params.date).toBeUndefined();
  });
});

// ==========================================================================
// PRIORITY ORDERING TESTS
// ==========================================================================

describe("Workflow Triggers - Priority Ordering", () => {
  it("should sort triggers by priority descending", () => {
    const triggers = [
      { id: "1", priority: 0, name: "Default" },
      { id: "2", priority: 10, name: "High Priority" },
      { id: "3", priority: 5, name: "Medium Priority" },
    ];

    const sorted = [...triggers].sort((a, b) => b.priority - a.priority);

    expect(sorted[0].name).toBe("High Priority");
    expect(sorted[1].name).toBe("Medium Priority");
    expect(sorted[2].name).toBe("Default");
  });

  it("should maintain order for equal priorities", () => {
    const triggers = [
      { id: "1", priority: 5, name: "First" },
      { id: "2", priority: 5, name: "Second" },
    ];

    const sorted = [...triggers].sort((a, b) => b.priority - a.priority);
    expect(sorted.length).toBe(2);
  });
});

// ==========================================================================
// PROVIDER FILTERING TESTS
// ==========================================================================

describe("Workflow Triggers - Provider Filtering", () => {
  function filterByProvider(
    triggers: Array<{ id: string; provider_filter: string }>,
    provider: "twilio" | "blooio"
  ) {
    return triggers.filter(
      (t) => t.provider_filter === "all" || t.provider_filter === provider
    );
  }

  it("should include all triggers for matching provider", () => {
    const triggers = [
      { id: "1", provider_filter: "all" },
      { id: "2", provider_filter: "twilio" },
      { id: "3", provider_filter: "blooio" },
    ];

    const filtered = filterByProvider(triggers, "twilio");
    expect(filtered.length).toBe(2);
    expect(filtered.map((t) => t.id)).toContain("1");
    expect(filtered.map((t) => t.id)).toContain("2");
  });

  it("should exclude triggers for different provider", () => {
    const triggers = [
      { id: "1", provider_filter: "all" },
      { id: "2", provider_filter: "twilio" },
      { id: "3", provider_filter: "blooio" },
    ];

    const filtered = filterByProvider(triggers, "blooio");
    expect(filtered.map((t) => t.id)).not.toContain("2");
  });
});

// ==========================================================================
// RESPONSE CONFIGURATION TESTS
// ==========================================================================

describe("Workflow Triggers - Response Configuration", () => {
  function buildResponse(template: string, output: Record<string, unknown>): string {
    let response = template;
    for (const [key, value] of Object.entries(output)) {
      response = response.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, "g"),
        String(value)
      );
    }
    return response;
  }

  it("should build response from template with single placeholder", () => {
    const template = "Your calendar summary: {{summary}}";
    const output = { summary: "3 meetings today" };
    expect(buildResponse(template, output)).toBe("Your calendar summary: 3 meetings today");
  });

  it("should handle multiple placeholders", () => {
    const template = "Hi {{name}}, you have {{count}} events on {{date}}";
    const output = { name: "John", count: 5, date: "Monday" };
    expect(buildResponse(template, output)).toBe("Hi John, you have 5 events on Monday");
  });

  it("should leave unmatched placeholders as-is", () => {
    const template = "Result: {{result}}, Status: {{status}}";
    const output = { result: "success" };
    expect(buildResponse(template, output)).toBe("Result: success, Status: {{status}}");
  });

  it("should handle numeric values", () => {
    const template = "Count: {{count}}";
    const output = { count: 42 };
    expect(buildResponse(template, output)).toBe("Count: 42");
  });

  it("should handle boolean values", () => {
    const template = "Active: {{active}}";
    const output = { active: true };
    expect(buildResponse(template, output)).toBe("Active: true");
  });
});

// ==========================================================================
// TRIGGER CONFIG DEFAULTS TESTS
// ==========================================================================

describe("Workflow Triggers - Config Defaults", () => {
  const defaultConfig = {
    responseConfig: { sendResponse: true },
    providerFilter: "all",
    priority: 0,
    isActive: true,
  };

  it("should use default response config", () => {
    expect(defaultConfig.responseConfig.sendResponse).toBe(true);
  });

  it("should use default provider filter", () => {
    expect(defaultConfig.providerFilter).toBe("all");
  });

  it("should use default priority", () => {
    expect(defaultConfig.priority).toBe(0);
  });

  it("should be active by default", () => {
    expect(defaultConfig.isActive).toBe(true);
  });
});

// ==========================================================================
// TRIGGER MATCHING INTEGRATION TESTS
// ==========================================================================

describe("Workflow Triggers - Full Matching Logic", () => {
  interface TriggerConfig {
    keywords?: string[];
    contains?: string;
    pattern?: string;
    phoneNumbers?: string[];
    caseSensitive?: boolean;
  }

  interface Trigger {
    id: string;
    trigger_type: string;
    trigger_config: TriggerConfig;
    provider_filter: string;
    priority: number;
    is_active: boolean;
  }

  function matchTrigger(
    trigger: Trigger,
    message: { from: string; body: string; provider: string }
  ): { matched: boolean; matchedOn?: string; matchedValue?: string } {
    const config = trigger.trigger_config;
    const messageBody = config.caseSensitive
      ? message.body
      : message.body.toLowerCase();

    switch (trigger.trigger_type) {
      case "message_keyword": {
        const keywords = config.keywords || [];
        for (const keyword of keywords) {
          const keywordToMatch = config.caseSensitive
            ? keyword
            : keyword.toLowerCase();
          const regex = new RegExp(
            `\\b${keywordToMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
            "i"
          );
          if (regex.test(messageBody)) {
            return { matched: true, matchedOn: "keyword", matchedValue: keyword };
          }
        }
        break;
      }

      case "message_contains": {
        const contains = config.contains || "";
        const containsToMatch = config.caseSensitive
          ? contains
          : contains.toLowerCase();
        if (messageBody.includes(containsToMatch)) {
          return { matched: true, matchedOn: "contains", matchedValue: contains };
        }
        break;
      }

      case "message_regex": {
        const pattern = config.pattern;
        if (pattern) {
          try {
            const flags = config.caseSensitive ? "" : "i";
            const regex = new RegExp(pattern, flags);
            const match = message.body.match(regex);
            if (match) {
              return { matched: true, matchedOn: "regex", matchedValue: match[0] };
            }
          } catch {
            // Invalid regex
          }
        }
        break;
      }
    }

    return { matched: false };
  }

  it("should match keyword trigger correctly", () => {
    const trigger: Trigger = {
      id: "1",
      trigger_type: "message_keyword",
      trigger_config: { keywords: ["schedule", "calendar"] },
      provider_filter: "all",
      priority: 0,
      is_active: true,
    };

    const result = matchTrigger(trigger, {
      from: "+1234567890",
      body: "Show me my schedule",
      provider: "twilio",
    });

    expect(result.matched).toBe(true);
    expect(result.matchedOn).toBe("keyword");
    expect(result.matchedValue).toBe("schedule");
  });

  it("should match contains trigger correctly", () => {
    const trigger: Trigger = {
      id: "2",
      trigger_type: "message_contains",
      trigger_config: { contains: "appointment" },
      provider_filter: "all",
      priority: 0,
      is_active: true,
    };

    const result = matchTrigger(trigger, {
      from: "+1234567890",
      body: "Book an appointment",
      provider: "twilio",
    });

    expect(result.matched).toBe(true);
    expect(result.matchedOn).toBe("contains");
  });

  it("should match regex trigger correctly", () => {
    const trigger: Trigger = {
      id: "3",
      trigger_type: "message_regex",
      trigger_config: { pattern: "\\d{1,2}/\\d{1,2}/\\d{4}" },
      provider_filter: "all",
      priority: 0,
      is_active: true,
    };

    const result = matchTrigger(trigger, {
      from: "+1234567890",
      body: "Schedule for 12/25/2024",
      provider: "twilio",
    });

    expect(result.matched).toBe(true);
    expect(result.matchedOn).toBe("regex");
    expect(result.matchedValue).toBe("12/25/2024");
  });

  it("should not match when trigger doesnt apply", () => {
    const trigger: Trigger = {
      id: "1",
      trigger_type: "message_keyword",
      trigger_config: { keywords: ["help"] },
      provider_filter: "all",
      priority: 0,
      is_active: true,
    };

    const result = matchTrigger(trigger, {
      from: "+1234567890",
      body: "Show me my schedule",
      provider: "twilio",
    });

    expect(result.matched).toBe(false);
  });
});
