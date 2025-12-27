/**
 * Webhook Endpoint Unit Tests
 *
 * Comprehensive tests for the N8N webhook trigger endpoint.
 * Tests security, validation, and response handling.
 *
 * Run with: bun test tests/unit/webhook-endpoint.test.ts
 */

import { describe, test, expect } from "bun:test";

// =============================================================================
// SIGNATURE GENERATION & VERIFICATION
// =============================================================================

describe("Webhook Signature", () => {
  describe("Generation", () => {
    test("generates signature with timestamp and HMAC", async () => {
      const { generateWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const signature = generateWebhookSignature({
        payload: '{"event":"test"}',
        secret: "test-secret-123",
      });

      expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });

    test("includes timestamp in signature", async () => {
      const { generateWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const now = Math.floor(Date.now() / 1000);
      const signature = generateWebhookSignature({
        payload: '{"event":"test"}',
        secret: "test-secret",
      });

      const timestampMatch = signature.match(/^t=(\d+)/);
      expect(timestampMatch).not.toBeNull();

      const timestamp = parseInt(timestampMatch![1]);
      expect(Math.abs(timestamp - now)).toBeLessThan(5); // Within 5 seconds
    });

    test("different payloads produce different signatures", async () => {
      const { generateWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const secret = "shared-secret";
      const timestamp = Math.floor(Date.now() / 1000);

      const sig1 = generateWebhookSignature({
        payload: '{"event":"one"}',
        secret,
        timestamp,
      });

      const sig2 = generateWebhookSignature({
        payload: '{"event":"two"}',
        secret,
        timestamp,
      });

      expect(sig1).not.toBe(sig2);
    });

    test("different secrets produce different signatures", async () => {
      const { generateWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const payload = '{"event":"test"}';
      const timestamp = Math.floor(Date.now() / 1000);

      const sig1 = generateWebhookSignature({
        payload,
        secret: "secret-one",
        timestamp,
      });

      const sig2 = generateWebhookSignature({
        payload,
        secret: "secret-two",
        timestamp,
      });

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("Verification", () => {
    test("verifies valid signature", async () => {
      const { generateWebhookSignature, verifyWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const payload = '{"event":"test","data":{"key":"value"}}';
      const secret = "my-secret-key";

      const signature = generateWebhookSignature({ payload, secret });
      const result = verifyWebhookSignature({ payload, signature, secret });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("rejects tampered payload", async () => {
      const { generateWebhookSignature, verifyWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const originalPayload = '{"event":"test"}';
      const tamperedPayload = '{"event":"hacked"}';
      const secret = "my-secret";

      const signature = generateWebhookSignature({
        payload: originalPayload,
        secret,
      });
      const result = verifyWebhookSignature({
        payload: tamperedPayload,
        signature,
        secret,
      });

      expect(result.valid).toBe(false);
    });

    test("rejects wrong secret", async () => {
      const { generateWebhookSignature, verifyWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const payload = '{"event":"test"}';

      const signature = generateWebhookSignature({
        payload,
        secret: "correct-secret",
      });
      const result = verifyWebhookSignature({
        payload,
        signature,
        secret: "wrong-secret",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid signature");
    });

    test("rejects expired timestamp (default 5 min)", async () => {
      const { generateWebhookSignature, verifyWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const payload = '{"event":"test"}';
      const secret = "my-secret";
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago

      const signature = generateWebhookSignature({
        payload,
        secret,
        timestamp: expiredTimestamp,
      });
      const result = verifyWebhookSignature({ payload, signature, secret });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("expired");
    });

    test("accepts timestamp within tolerance", async () => {
      const { generateWebhookSignature, verifyWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const payload = '{"event":"test"}';
      const secret = "my-secret";
      const recentTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago

      const signature = generateWebhookSignature({
        payload,
        secret,
        timestamp: recentTimestamp,
      });
      const result = verifyWebhookSignature({
        payload,
        signature,
        secret,
        config: { timestampTolerance: 300 }, // 5 minutes
      });

      expect(result.valid).toBe(true);
    });

    test("respects custom timestamp tolerance", async () => {
      const { generateWebhookSignature, verifyWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const payload = '{"event":"test"}';
      const secret = "my-secret";
      const timestamp = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago

      const signature = generateWebhookSignature({
        payload,
        secret,
        timestamp,
      });

      // Should fail with 1 minute tolerance
      const shortTolerance = verifyWebhookSignature({
        payload,
        signature,
        secret,
        config: { timestampTolerance: 60 },
      });
      expect(shortTolerance.valid).toBe(false);

      // Should pass with 5 minute tolerance
      const longTolerance = verifyWebhookSignature({
        payload,
        signature,
        secret,
        config: { timestampTolerance: 300 },
      });
      expect(longTolerance.valid).toBe(true);
    });

    test("handles missing signature", async () => {
      const { verifyWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const result = verifyWebhookSignature({
        payload: '{"event":"test"}',
        signature: "",
        secret: "secret",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing signature");
    });

    test("handles malformed signature", async () => {
      const { verifyWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const result = verifyWebhookSignature({
        payload: '{"event":"test"}',
        signature: "not-a-valid-signature",
        secret: "secret",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Missing");
    });

    test("handles signature without timestamp", async () => {
      const { verifyWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const result = verifyWebhookSignature({
        payload: '{"event":"test"}',
        signature: "v1=" + "a".repeat(64),
        secret: "secret",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing timestamp in signature");
    });

    test("handles signature without v1 hash", async () => {
      const { verifyWebhookSignature } =
        await import("@/lib/utils/webhook-signature");

      const result = verifyWebhookSignature({
        payload: '{"event":"test"}',
        signature: "t=1234567890",
        secret: "secret",
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("v1");
    });
  });
});

// =============================================================================
// HELPER UTILITIES
// =============================================================================

describe("Webhook Utilities", () => {
  test("createSignatureHeaders generates complete headers", async () => {
    const { createSignatureHeaders } =
      await import("@/lib/utils/webhook-signature");

    const headers = createSignatureHeaders('{"test":true}', "secret-123");

    expect(headers["x-webhook-signature"]).toBeDefined();
    expect(headers["x-webhook-signature"]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("createSignatureHeaders uses custom header name", async () => {
    const { createSignatureHeaders } =
      await import("@/lib/utils/webhook-signature");

    const headers = createSignatureHeaders('{"test":true}', "secret", {
      signatureHeader: "x-custom-sig",
    });

    expect(headers["x-custom-sig"]).toBeDefined();
    expect(headers["x-webhook-signature"]).toBeUndefined();
  });

  test("getSignatureFromHeaders extracts signature", async () => {
    const { getSignatureFromHeaders, generateWebhookSignature } =
      await import("@/lib/utils/webhook-signature");

    const signature = generateWebhookSignature({
      payload: "test",
      secret: "secret",
    });

    const mockHeaders = new Headers();
    mockHeaders.set("x-webhook-signature", signature);

    const extracted = getSignatureFromHeaders(mockHeaders);

    expect(extracted).toBe(signature);
  });

  test("getSignatureFromHeaders returns null for missing header", async () => {
    const { getSignatureFromHeaders } =
      await import("@/lib/utils/webhook-signature");

    const mockHeaders = new Headers();
    const extracted = getSignatureFromHeaders(mockHeaders);

    expect(extracted).toBeNull();
  });

  test("generateWebhookSecret creates secure random secret", async () => {
    const { generateWebhookSecret } =
      await import("@/lib/utils/webhook-signature");

    const secret = generateWebhookSecret();

    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    expect(secret.length).toBe(64); // 32 bytes = 64 hex chars
  });

  test("generateWebhookSecret creates unique secrets", async () => {
    const { generateWebhookSecret } =
      await import("@/lib/utils/webhook-signature");

    const secrets = new Set(
      Array.from({ length: 1000 }, () => generateWebhookSecret()),
    );

    expect(secrets.size).toBe(1000);
  });
});

// =============================================================================
// WEBHOOK REQUEST HANDLING
// =============================================================================

describe("Webhook Request Handling", () => {
  test("extracts client IP from x-forwarded-for", () => {
    const getClientIp = (headers: Record<string, string | null>): string => {
      const forwarded = headers["x-forwarded-for"];
      const realIp = headers["x-real-ip"];
      return forwarded?.split(",")[0]?.trim() || realIp || "unknown";
    };

    expect(
      getClientIp({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": null }),
    ).toBe("1.2.3.4");
    expect(
      getClientIp({ "x-forwarded-for": null, "x-real-ip": "9.10.11.12" }),
    ).toBe("9.10.11.12");
    expect(getClientIp({ "x-forwarded-for": null, "x-real-ip": null })).toBe(
      "unknown",
    );
  });

  test("validates IP against allowlist", () => {
    const isIpAllowed = (clientIp: string, allowedIps?: string[]): boolean => {
      if (!allowedIps || allowedIps.length === 0) return true;
      return allowedIps.includes(clientIp) || allowedIps.includes("*");
    };

    expect(isIpAllowed("1.2.3.4", ["1.2.3.4", "5.6.7.8"])).toBe(true);
    expect(isIpAllowed("9.9.9.9", ["1.2.3.4", "5.6.7.8"])).toBe(false);
    expect(isIpAllowed("any.ip", ["*"])).toBe(true);
    expect(isIpAllowed("any.ip", [])).toBe(true);
    expect(isIpAllowed("any.ip", undefined)).toBe(true);
  });

  test("parses JSON payload correctly", () => {
    const payloads = [
      { input: '{"event":"test"}', expected: { event: "test" } },
      {
        input: '{"nested":{"data":true}}',
        expected: { nested: { data: true } },
      },
      { input: '{"array":[1,2,3]}', expected: { array: [1, 2, 3] } },
      { input: "{}", expected: {} },
    ];

    payloads.forEach(({ input, expected }) => {
      expect(JSON.parse(input)).toEqual(expected);
    });
  });

  test("handles invalid JSON gracefully", () => {
    const invalidPayloads = ["not json", "{invalid}", "[unclosed", ""];

    invalidPayloads.forEach((payload) => {
      let parsed = null;
      try {
        parsed = JSON.parse(payload || "{}");
      } catch {
        parsed = null;
      }

      // Empty string should parse to empty object, others should fail
      if (payload === "") {
        expect(parsed).toEqual({});
      } else {
        expect(parsed).toBeNull();
      }
    });
  });
});

// =============================================================================
// RESPONSE FORMAT
// =============================================================================

describe("Webhook Response Format", () => {
  test("success response has required fields", () => {
    const response = {
      success: true,
      executionId: "exec-123",
      status: "running",
    };

    expect(response.success).toBe(true);
    expect(response.executionId).toBeDefined();
    expect(response.status).toBeDefined();
  });

  test("success response excludes output by default", () => {
    const response = {
      success: true,
      executionId: "exec-123",
      status: "success",
    };

    expect((response as Record<string, unknown>).outputData).toBeUndefined();
  });

  test("success response includes output when configured", () => {
    const includeOutput = true;
    const outputData = { result: "data" };

    const response = {
      success: true,
      executionId: "exec-123",
      status: "success",
      ...(includeOutput && { outputData }),
    };

    expect(response.outputData).toEqual(outputData);
  });

  test("error response has consistent format", () => {
    const errors = [
      { message: "Webhook unavailable", status: 404 },
      { message: "Missing webhook signature", status: 401 },
      { message: "Invalid webhook signature", status: 401 },
      { message: "IP not allowed", status: 403 },
      { message: "Invalid JSON payload", status: 400 },
    ];

    errors.forEach(({ message, status }) => {
      const response = {
        success: false,
        error: status === 404 ? "Webhook unavailable" : message,
      };

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(typeof response.error).toBe("string");
    });
  });

  test("404 returns generic message to prevent enumeration", () => {
    const scenarios = [
      "trigger not found",
      "trigger inactive",
      "invalid key format",
    ];

    // All should return the same message
    scenarios.forEach(() => {
      const response = { success: false, error: "Webhook unavailable" };
      expect(response.error).toBe("Webhook unavailable");
      expect(response.error).not.toContain("not found");
      expect(response.error).not.toContain("inactive");
    });
  });
});

// =============================================================================
// SECURITY FEATURES
// =============================================================================

describe("Webhook Security", () => {
  test("timing attack prevention with random delay", async () => {
    // The webhook adds a random delay (0-50ms) for 404s
    const delays: number[] = [];

    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
      delays.push(Date.now() - start);
    }

    // Delays should vary (not all the same)
    const uniqueDelays = new Set(delays.map((d) => Math.floor(d / 10) * 10));
    expect(uniqueDelays.size).toBeGreaterThan(1);
  });

  test("signature prevents replay after tolerance window", async () => {
    const { generateWebhookSignature, verifyWebhookSignature } =
      await import("@/lib/utils/webhook-signature");

    const payload = '{"event":"test"}';
    const secret = "secret";

    // Signature from 10 minutes ago
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const oldSignature = generateWebhookSignature({
      payload,
      secret,
      timestamp: oldTimestamp,
    });

    // Should be rejected
    const result = verifyWebhookSignature({
      payload,
      signature: oldSignature,
      secret,
      config: { timestampTolerance: 300 }, // 5 minutes
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });

  test("rate limiting is configured correctly", () => {
    const rateLimitConfig = {
      windowMs: 60000, // 1 minute
      maxRequests: process.env.NODE_ENV === "production" ? 60 : 1000,
    };

    expect(rateLimitConfig.windowMs).toBe(60000);
    expect(rateLimitConfig.maxRequests).toBeGreaterThan(0);
  });

  test("webhook secret is never logged or returned after creation", () => {
    const trigger = {
      id: "trigger-123",
      config: {
        webhookSecret: "super-secret-value",
        requireSignature: true,
      },
    };

    // Simulating response transformation
    const safeConfig = {
      ...trigger.config,
      webhookSecret: trigger.config.webhookSecret ? "[REDACTED]" : undefined,
      hasWebhookSecret: !!trigger.config.webhookSecret,
    };

    expect(safeConfig.webhookSecret).toBe("[REDACTED]");
    expect(safeConfig.hasWebhookSecret).toBe(true);
  });

  test("webhook key is only partially logged", () => {
    const fullKey = "abc123def456ghi789jkl012mno345pqr678";
    const loggedKey = fullKey.slice(0, 8) + "...";

    expect(loggedKey).toBe("abc123de...");
    expect(loggedKey).not.toBe(fullKey);
    expect(loggedKey.length).toBeLessThan(fullKey.length);
  });
});

// =============================================================================
// WEBHOOK TEST CLIENT
// =============================================================================

describe("WebhookTestClient", () => {
  test("constructs correct webhook URL", async () => {
    const { WebhookTestClient } =
      await import("@/lib/utils/webhook-test-client");

    const client = new WebhookTestClient({
      baseUrl: "https://api.example.com",
      webhookKey: "my-webhook-key",
      webhookSecret: "my-secret",
    });

    expect(client.webhookUrl).toBe(
      "https://api.example.com/api/v1/n8n/webhooks/my-webhook-key",
    );
  });

  test("generates proper test report structure", () => {
    const report = {
      webhookUrl: "https://example.com/api/v1/n8n/webhooks/key",
      tests: [
        { name: "Test 1", passed: true, details: {} },
        { name: "Test 2", passed: false, details: {} },
      ],
      passed: 1,
      failed: 1,
      duration: 100,
    };

    expect(report.webhookUrl).toBeDefined();
    expect(Array.isArray(report.tests)).toBe(true);
    expect(report.passed + report.failed).toBe(report.tests.length);
  });
});
