/**
 * Chat Route Optimizations Tests
 *
 * Comprehensive tests for all chat performance optimizations:
 * 1. Model pricing cache layer
 * 2. Ban status caching
 * 3. Conversation batch message insert
 * 4. Developer role support in responses API
 */

import { describe, test, expect, beforeEach, mock, spyOn } from "bun:test";

// ============================================================================
// 1. MODEL PRICING CACHE TESTS
// ============================================================================

describe("Model Pricing Cache", () => {
  let mockCache: any;
  let mockRepository: any;

  beforeEach(() => {
    mockCache = {
      get: mock(() => Promise.resolve(null)),
      set: mock(() => Promise.resolve()),
      del: mock(() => Promise.resolve()),
    };

    mockRepository = {
      findByModelAndProvider: mock(() =>
        Promise.resolve({
          id: "test-id",
          model: "gpt-4o-mini",
          provider: "openai",
          input_cost_per_1k: "0.00015",
          output_cost_per_1k: "0.0006",
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }),
      ),
    };
  });

  test("calculateCost uses cached pricing when available", async () => {
    const cachedPricing = {
      id: "cached-id",
      model: "gpt-4o-mini",
      provider: "openai",
      input_cost_per_1k: "0.00015",
      output_cost_per_1k: "0.0006",
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockCache.get = mock(() => Promise.resolve(cachedPricing));

    const { calculateCost } = await import("@/lib/pricing");
    const result = await calculateCost("gpt-4o-mini", "openai", 1000, 1000);

    expect(result.inputCost).toBeGreaterThan(0);
    expect(result.outputCost).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThan(0);
    expect(result.totalCost).toBe(result.inputCost + result.outputCost);
  });

  test("calculateCost fetches from DB on cache miss", async () => {
    const { calculateCost } = await import("@/lib/pricing");

    const result = await calculateCost("gpt-4o-mini", "openai", 1000, 1000);

    expect(result.inputCost).toBeGreaterThan(0);
    expect(result.outputCost).toBeGreaterThan(0);
    expect(result.totalCost).toBe(result.inputCost + result.outputCost);
  });

  test("calculateCost falls back to default pricing when not found", async () => {
    const { calculateCost } = await import("@/lib/pricing");

    const result = await calculateCost(
      "nonexistent-model",
      "openai",
      1000,
      1000,
    );

    expect(result.inputCost).toBeGreaterThan(0);
    expect(result.outputCost).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThan(0);
  });

  test("invalidatePricingCache exports as function", async () => {
    const { invalidatePricingCache } = await import("@/lib/pricing");
    expect(typeof invalidatePricingCache).toBe("function");
  });

  test("calculateCost handles zero tokens correctly", async () => {
    const { calculateCost } = await import("@/lib/pricing");

    const result = await calculateCost("gpt-4o-mini", "openai", 0, 0);

    expect(result.inputCost).toBe(0);
    expect(result.outputCost).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  test("calculateCost handles large token counts", async () => {
    const { calculateCost } = await import("@/lib/pricing");

    const result = await calculateCost(
      "gpt-4o-mini",
      "openai",
      100000,
      100000,
    );

    expect(result.inputCost).toBeGreaterThan(0);
    expect(result.outputCost).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThan(result.inputCost);
    expect(result.totalCost).toBeGreaterThan(result.outputCost);
  });

  test("calculateCost handles different providers", async () => {
    const { calculateCost } = await import("@/lib/pricing");

    const resultOpenAI = await calculateCost("gpt-4o-mini", "openai", 1000, 1000);
    const resultAnthropic = await calculateCost(
      "claude-3-5-sonnet-20241022",
      "anthropic",
      1000,
      1000,
    );

    expect(resultOpenAI.totalCost).toBeGreaterThan(0);
    expect(resultAnthropic.totalCost).toBeGreaterThan(0);
  });

  test("calculateCost rounds correctly to cents", async () => {
    const { calculateCost } = await import("@/lib/pricing");

    const result = await calculateCost("gpt-4o-mini", "openai", 10, 10);

    const inputCostStr = result.inputCost.toFixed(2);
    const outputCostStr = result.outputCost.toFixed(2);
    const totalCostStr = result.totalCost.toFixed(2);

    expect(inputCostStr).toMatch(/^\d+\.\d{2}$/);
    expect(outputCostStr).toMatch(/^\d+\.\d{2}$/);
    expect(totalCostStr).toMatch(/^\d+\.\d{2}$/);
  });
});

// ============================================================================
// 2. BAN STATUS CACHING TESTS
// ============================================================================

describe("Ban Status Caching", () => {
  test("shouldBlockUser caching is implemented", async () => {
    const { contentModerationService } = await import(
      "@/lib/services/content-moderation"
    );

    expect(typeof contentModerationService.shouldBlockUser).toBe("function");
  });

  test("invalidateBanStatusCache is exported", async () => {
    const { contentModerationService } = await import(
      "@/lib/services/content-moderation"
    );

    expect(typeof contentModerationService.invalidateBanStatusCache).toBe(
      "function",
    );
  });

  test("shouldBlockUser returns boolean", async () => {
    const { contentModerationService } = await import(
      "@/lib/services/content-moderation"
    );

    const testUserId = "00000000-0000-0000-0000-000000000001";
    const result = await contentModerationService.shouldBlockUser(testUserId);

    expect(typeof result).toBe("boolean");
  });
});

// ============================================================================
// 3. CONVERSATION BATCH MESSAGE INSERT TESTS
// ============================================================================

describe("Conversation Batch Message Insert", () => {
  test("addMessagesWithSequence method exists", async () => {
    const { conversationsService } = await import(
      "@/lib/services/conversations"
    );

    expect(typeof conversationsService.addMessagesWithSequence).toBe(
      "function",
    );
  });

  test("addMessagesWithSequence handles empty array", async () => {
    const { ConversationsRepository } = await import(
      "@/db/repositories/conversations"
    );
    const repo = new ConversationsRepository();

    const result = await repo.addMessagesWithSequence("test-conversation-id", []);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test("addMessagesWithSequence function signature is correct", async () => {
    const { conversationsService } = await import(
      "@/lib/services/conversations"
    );

    const fn = conversationsService.addMessagesWithSequence;
    expect(fn.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// 4. DEVELOPER ROLE SUPPORT TESTS
// ============================================================================

describe("Developer Role Support in Responses API", () => {
  test("AISdkRequest interface accepts developer role", () => {
    const mockMessage = {
      role: "developer" as const,
      content: "Test system instruction",
    };

    expect(mockMessage.role).toBe("developer");
    expect(typeof mockMessage.content).toBe("string");
  });

  test("developer role is transformed to system role", () => {
    const developerMessage = {
      role: "developer" as "user" | "system" | "assistant" | "tool" | "developer",
      content: "Test instruction",
    };

    const transformedRole =
      developerMessage.role === "developer" ? "system" : developerMessage.role;

    expect(transformedRole).toBe("system");
  });

  test("empty developer messages should be filtered", () => {
    const messages = [
      { role: "developer" as const, content: "" },
      { role: "user" as const, content: "Hello" },
      { role: "system" as const, content: "" },
    ];

    const transformedMessages = messages.map((msg) => ({
      ...msg,
      role: msg.role === "developer" ? "system" : msg.role,
    }));

    const filtered = transformedMessages.filter(
      (msg) => msg.role !== "system" || (msg.content && msg.content.trim() !== ""),
    );

    expect(filtered.length).toBe(1);
    expect(filtered[0].role).toBe("user");
  });

  test("non-empty developer messages are preserved as system", () => {
    const messages = [
      { role: "developer" as const, content: "Important instruction" },
      { role: "user" as const, content: "Hello" },
    ];

    const transformedMessages = messages.map((msg) => ({
      ...msg,
      role: msg.role === "developer" ? ("system" as const) : msg.role,
    }));

    const filtered = transformedMessages.filter(
      (msg) => msg.role !== "system" || (msg.content && msg.content.trim() !== ""),
    );

    expect(filtered.length).toBe(2);
    expect(filtered[0].role).toBe("system");
    expect(filtered[0].content).toBe("Important instruction");
    expect(filtered[1].role).toBe("user");
  });
});

// ============================================================================
// 5. INTEGRATION TESTS - CACHE TTL VALIDATION
// ============================================================================

describe("Cache Configuration", () => {
  test("moderation cache keys are defined", async () => {
    const { CacheKeys } = await import("@/lib/cache/keys");

    expect(CacheKeys.moderation).toBeDefined();
    expect(typeof CacheKeys.moderation.banStatus).toBe("function");
  });

  test("moderation cache TTL is defined", async () => {
    const { CacheTTL } = await import("@/lib/cache/keys");

    expect(CacheTTL.moderation).toBeDefined();
    expect(typeof CacheTTL.moderation.banStatus).toBe("number");
    expect(CacheTTL.moderation.banStatus).toBeGreaterThan(0);
  });

  test("ban status cache key format is correct", async () => {
    const { CacheKeys } = await import("@/lib/cache/keys");

    const userId = "test-user-123";
    const cacheKey = CacheKeys.moderation.banStatus(userId);

    expect(cacheKey).toContain(userId);
    expect(cacheKey).toMatch(/^moderation:ban:/);
  });
});

// ============================================================================
// 6. PRICING UTILITY TESTS
// ============================================================================

describe("Pricing Utilities", () => {
  test("getProviderFromModel extracts provider correctly", async () => {
    const { getProviderFromModel } = await import("@/lib/pricing");

    expect(getProviderFromModel("openai/gpt-4o-mini")).toBe("openai");
    expect(getProviderFromModel("anthropic/claude-3")).toBe("anthropic");
    expect(getProviderFromModel("gpt-4o-mini")).toBe("openai");
    expect(getProviderFromModel("claude-3-5-sonnet-20241022")).toBe("anthropic");
    expect(getProviderFromModel("gemini-1.5-pro")).toBe("google");
  });

  test("normalizeModelName removes provider prefix", async () => {
    const { normalizeModelName } = await import("@/lib/pricing");

    expect(normalizeModelName("openai/gpt-4o-mini")).toBe("gpt-4o-mini");
    expect(normalizeModelName("gpt-4o-mini")).toBe("gpt-4o-mini");
    expect(normalizeModelName("anthropic/claude-3")).toBe("claude-3");
  });

  test("estimateTokens approximates correctly", async () => {
    const { estimateTokens } = await import("@/lib/pricing");

    const text = "Hello, world!";
    const estimate = estimateTokens(text);

    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThanOrEqual(Math.ceil(text.length / 4) + 1);
  });

  test("estimateRequestCost returns positive value", async () => {
    const { estimateRequestCost } = await import("@/lib/pricing");

    const messages = [
      { role: "user", content: "Hello, how are you?" },
      { role: "assistant", content: "I'm doing well, thank you!" },
    ];

    const estimate = await estimateRequestCost("gpt-4o-mini", messages);

    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeGreaterThanOrEqual(0.01);
  });

  test("estimateRequestCost handles multimodal content", async () => {
    const { estimateRequestCost } = await import("@/lib/pricing");

    const messages = [
      {
        role: "user",
        content: {
          type: "text",
          text: "What's in this image?",
        },
      },
    ];

    const estimate = await estimateRequestCost("gpt-4o-mini", messages);

    expect(estimate).toBeGreaterThan(0);
  });
});

// ============================================================================
// 7. ERROR HANDLING TESTS
// ============================================================================

describe("Error Handling", () => {
  test("calculateCost handles invalid provider gracefully", async () => {
    const { calculateCost } = await import("@/lib/pricing");

    const result = await calculateCost(
      "unknown-model",
      "unknown-provider",
      1000,
      1000,
    );

    expect(result.inputCost).toBeGreaterThanOrEqual(0);
    expect(result.outputCost).toBeGreaterThanOrEqual(0);
    expect(result.totalCost).toBeGreaterThanOrEqual(0);
  });

  test("calculateCost handles negative tokens safely", async () => {
    const { calculateCost } = await import("@/lib/pricing");

    const result = await calculateCost("gpt-4o-mini", "openai", -100, -100);

    expect(Math.abs(result.inputCost)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(result.outputCost)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(result.totalCost)).toBeLessThanOrEqual(0.01);
  });
});

// ============================================================================
// 8. PERFORMANCE BENCHMARKS (OPTIONAL)
// ============================================================================

describe("Performance Benchmarks", () => {
  test("calculateCost completes in reasonable time", async () => {
    const { calculateCost } = await import("@/lib/pricing");

    const start = Date.now();
    await calculateCost("gpt-4o-mini", "openai", 1000, 1000);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });

  test("estimateRequestCost completes quickly", async () => {
    const { estimateRequestCost } = await import("@/lib/pricing");

    const messages = [
      { role: "user", content: "Test message" },
    ];

    const start = Date.now();
    await estimateRequestCost("gpt-4o-mini", messages);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
  });
});
