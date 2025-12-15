/**
 * Domain Content Moderation Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// Mock the db module
const mockDb = {
  query: {
    userCharacters: {
      findFirst: mock(() => null),
      findMany: mock(() => []),
    },
  },
};

mock.module("@/db", () => ({ db: mockDb }));

// Mock drizzle-orm
mock.module("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  desc: (a: unknown) => ({ _desc: a }),
}));

// Mock repository
const mockRepo = {
  findById: mock(() => null),
  listNeedingContentScan: mock(() => []),
  listNeedingAiScan: mock(() => []),
  updateContentScan: mock(() => ({})),
  updateModerationStatus: mock(() => ({})),
};

mock.module("@/db/repositories/managed-domains", () => ({
  managedDomainsRepository: mockRepo,
}));

// Mock logger
mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
}));

// Mock error handling
mock.module("@/lib/utils/error-handling", () => ({
  extractErrorMessage: (e: unknown) =>
    e instanceof Error ? e.message : String(e),
}));

// Mock user-characters schema
mock.module("@/db/schemas/user-characters", () => ({
  userCharacters: {
    id: "id",
    is_public: "is_public",
    interaction_count: "interaction_count",
  },
}));

// Import after mocks
const { domainContentModerationService } =
  await import("@/lib/services/domain-content-moderation");

describe("Domain Content Moderation Service", () => {
  beforeEach(() => {
    mockRepo.findById.mockClear();
    mockRepo.listNeedingContentScan.mockClear();
    mockRepo.listNeedingAiScan.mockClear();
    mockDb.query.userCharacters.findFirst.mockClear();
    mockDb.query.userCharacters.findMany.mockClear();
  });

  describe("runHeuristics", () => {
    it("flags CSAM patterns as critical", () => {
      const result = domainContentModerationService.runHeuristics(
        "this contains child porn content",
      );
      expect(result.severity).toBe("critical");
      expect(result.flags.length).toBeGreaterThan(0);
      expect(result.flags[0].type).toBe("csam");
      expect(result.needsAi).toBe(false);
    });

    it("flags illegal patterns as high severity", () => {
      const result = domainContentModerationService.runHeuristics(
        "buy drugs cocaine here cheap",
      );
      expect(result.severity).toBe("high");
      expect(result.flags.some((f) => f.type === "illegal")).toBe(true);
    });

    it("flags scam patterns as medium severity", () => {
      const result = domainContentModerationService.runHeuristics(
        "double your bitcoin send 1 btc receive 2",
      );
      expect(result.severity).toBe("medium");
      expect(result.needsAi).toBe(true);
    });

    it("returns clean for normal content", () => {
      const result = domainContentModerationService.runHeuristics(
        "Welcome to our website about cooking recipes",
      );
      expect(result.severity).toBe("none");
      expect(result.flags.length).toBe(0);
      expect(result.needsAi).toBe(false);
    });

    it("detects pedo/paedo terms", () => {
      const result = domainContentModerationService.runHeuristics(
        "pedophile content here",
      );
      expect(result.severity).toBe("critical");
      expect(result.flags[0].type).toBe("csam");
    });

    it("detects hitman services", () => {
      const result = domainContentModerationService.runHeuristics(
        "hitman for hire service available",
      );
      expect(result.severity).toBe("high");
      expect(result.flags[0].type).toBe("illegal");
    });

    it("detects ransomware services", () => {
      const result = domainContentModerationService.runHeuristics(
        "ransomware as a service kit",
      );
      expect(result.severity).toBe("high");
      expect(result.flags[0].type).toBe("illegal");
    });

    it("detects crypto scams", () => {
      const result = domainContentModerationService.runHeuristics(
        "free bitcoin no risk investment",
      );
      expect(result.severity).toBe("medium");
    });
  });

  describe("shouldScan", () => {
    it("returns true when force option is set", async () => {
      const domain = {
        id: "test-id",
        contentScanCache: {
          contentHash: "abc123",
          scannedAt: new Date().toISOString(),
          result: "clean",
          confidence: 0.9,
          flags: [],
        },
        contentHash: "abc123",
        lastAiScanAt: new Date(),
      };

      const result = await domainContentModerationService.shouldScan(
        domain as any,
        "abc123",
        { force: true },
      );
      expect(result).toBe(true);
    });

    it("returns true when content hash changed", async () => {
      const domain = {
        id: "test-id",
        contentScanCache: {
          contentHash: "abc123",
          scannedAt: new Date().toISOString(),
          result: "clean",
          confidence: 0.9,
          flags: [],
        },
        contentHash: "abc123",
        lastAiScanAt: new Date(),
      };

      const result = await domainContentModerationService.shouldScan(
        domain as any,
        "different-hash",
      );
      expect(result).toBe(true);
    });

    it("returns false when content unchanged and recently scanned", async () => {
      const domain = {
        id: "test-id",
        contentScanCache: {
          contentHash: "abc123",
          scannedAt: new Date().toISOString(),
          result: "clean",
          confidence: 0.9,
          flags: [],
        },
        contentHash: "abc123",
        lastAiScanAt: new Date(),
      };

      const result = await domainContentModerationService.shouldScan(
        domain as any,
        "abc123",
      );
      expect(result).toBe(false);
    });

    it("returns true when AI scan is stale (>30 days)", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      const domain = {
        id: "test-id",
        contentScanCache: {
          contentHash: "abc123",
          scannedAt: new Date().toISOString(),
          result: "clean",
          confidence: 0.9,
          flags: [],
        },
        contentHash: "abc123",
        lastAiScanAt: oldDate,
      };

      const result = await domainContentModerationService.shouldScan(
        domain as any,
        "abc123",
      );
      expect(result).toBe(true);
    });
  });

  describe("getPublicAgentsForModeration", () => {
    it("returns formatted agent list", async () => {
      mockDb.query.userCharacters.findMany.mockResolvedValueOnce([
        {
          id: "agent-1",
          name: "Test Agent",
          organization_id: "org-1",
          is_public: true,
        },
        {
          id: "agent-2",
          name: "Another Agent",
          organization_id: "org-2",
          is_public: true,
        },
      ]);

      const result =
        await domainContentModerationService.getPublicAgentsForModeration(10);

      expect(result.length).toBe(2);
      expect(result[0]).toEqual({
        id: "agent-1",
        name: "Test Agent",
        organizationId: "org-1",
        isPublic: true,
      });
    });
  });

  describe("sampleAgentResponses", () => {
    it("returns clean result when agent not found", async () => {
      mockDb.query.userCharacters.findFirst.mockResolvedValueOnce(null);

      const result =
        await domainContentModerationService.sampleAgentResponses(
          "nonexistent-id",
        );

      expect(result.status).toBe("clean");
      expect(result.reasoning).toBe("Agent not found");
    });

    it("scans agent bio and system prompt", async () => {
      mockDb.query.userCharacters.findFirst.mockResolvedValueOnce({
        id: "agent-1",
        name: "Cooking Bot",
        username: "cookingbot",
        bio: "I help with cooking recipes",
        system: "You are a helpful cooking assistant",
        post_examples: ["Here is a great recipe"],
        topics: ["cooking", "food"],
      });

      const result =
        await domainContentModerationService.sampleAgentResponses("agent-1");

      expect(result.status).toBe("clean");
      expect(result.contentHash).toBeTruthy();
    });

    it("flags agent with CSAM content in bio", async () => {
      mockDb.query.userCharacters.findFirst.mockResolvedValueOnce({
        id: "agent-1",
        name: "Bad Agent",
        bio: "child porn content here",
        system: null,
        post_examples: [],
        topics: [],
      });

      const result =
        await domainContentModerationService.sampleAgentResponses("agent-1");

      expect(result.status).toBe("suspended");
      expect(result.flags.some((f) => f.type === "csam")).toBe(true);
    });
  });

  describe("runOpenAIModeration", () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.OPENAI_API_KEY;

    beforeEach(() => {
      process.env.OPENAI_API_KEY = "test-key";
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      process.env.OPENAI_API_KEY = originalEnv;
    });

    it("detects CSAM content from OpenAI moderation", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  flagged: true,
                  categories: { "sexual/minors": true },
                  category_scores: {
                    "sexual/minors": 0.95,
                    hate: 0.01,
                    violence: 0.01,
                    "self-harm": 0.01,
                  },
                },
              ],
            }),
        }),
      ) as typeof fetch;

      const result =
        await domainContentModerationService.runOpenAIModeration(
          "some content",
        );

      expect(result.aiUnavailable).toBe(false);
      expect(
        result.flags.some(
          (f) => f.type === "csam" && f.severity === "critical",
        ),
      ).toBe(true);
      expect(result.toxicityScore).toBeGreaterThan(0.9);
    });

    it("detects self-harm instructions", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  flagged: true,
                  categories: { "self-harm/instructions": true },
                  category_scores: {
                    "sexual/minors": 0.01,
                    hate: 0.01,
                    violence: 0.01,
                    "self-harm": 0.3,
                    "self-harm/instructions": 0.8,
                  },
                },
              ],
            }),
        }),
      ) as typeof fetch;

      const result =
        await domainContentModerationService.runOpenAIModeration(
          "harmful content",
        );

      expect(
        result.flags.some((f) => f.type === "illegal" && f.severity === "high"),
      ).toBe(true);
    });

    it("returns clean for normal content", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  flagged: false,
                  categories: {},
                  category_scores: {
                    "sexual/minors": 0.001,
                    hate: 0.002,
                    violence: 0.003,
                    "self-harm": 0.001,
                  },
                },
              ],
            }),
        }),
      ) as typeof fetch;

      const result = await domainContentModerationService.runOpenAIModeration(
        "normal cooking recipe",
      );

      expect(result.aiUnavailable).toBe(false);
      expect(result.flags.length).toBe(0);
      expect(result.toxicityScore).toBeLessThan(0.1);
    });

    it("marks aiUnavailable when API fails", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "Internal error" }),
        }),
      ) as typeof fetch;

      const result =
        await domainContentModerationService.runOpenAIModeration(
          "some content",
        );

      expect(result.aiUnavailable).toBe(true);
      expect(result.flags.some((f) => f.reason.includes("api_failed"))).toBe(
        true,
      );
    });

    // Note: API key is captured at module load time, so we can't test "no key"
    // scenario by setting process.env after import. The behavior is:
    // - If key missing at load time: aiUnavailable=true, flags=[]
    // - This is tested implicitly when OPENAI_API_KEY is not set in CI

    it("handles invalid response structure", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: [{ invalid: "structure" }] }),
        }),
      ) as typeof fetch;

      const result =
        await domainContentModerationService.runOpenAIModeration(
          "some content",
        );

      expect(result.aiUnavailable).toBe(true);
      expect(result.flags.some((f) => f.reason.includes("bad_response"))).toBe(
        true,
      );
    });
  });

  describe("runDeepClassification", () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = process.env.OPENAI_API_KEY;

    beforeEach(() => {
      process.env.OPENAI_API_KEY = "test-key";
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      process.env.OPENAI_API_KEY = originalEnv;
    });

    it("flags violations from GPT classification", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      classification: "violation",
                      confidence: 0.9,
                      reasoning: "Contains illegal drug sales",
                      categories: ["drug_trafficking"],
                    }),
                  },
                },
              ],
            }),
        }),
      ) as typeof fetch;

      const result = await domainContentModerationService.runDeepClassification(
        "buy drugs here",
        "website",
      );

      expect(result.aiUnavailable).toBe(false);
      expect(result.flags.some((f) => f.severity === "high")).toBe(true);
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toBe("Contains illegal drug sales");
    });

    it("flags CSAM-related categories as critical", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      classification: "violation",
                      confidence: 0.95,
                      reasoning: "CSAM detected",
                      categories: ["child_exploitation", "csam"],
                    }),
                  },
                },
              ],
            }),
        }),
      ) as typeof fetch;

      const result = await domainContentModerationService.runDeepClassification(
        "illegal content",
        "website",
      );

      expect(
        result.flags.some(
          (f) => f.type === "csam" && f.severity === "critical",
        ),
      ).toBe(true);
    });

    it("handles suspicious classification", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      classification: "suspicious",
                      confidence: 0.6,
                      reasoning: "May contain scam elements",
                      categories: ["potential_scam"],
                    }),
                  },
                },
              ],
            }),
        }),
      ) as typeof fetch;

      const result = await domainContentModerationService.runDeepClassification(
        "make money fast",
        "website",
      );

      expect(result.flags.some((f) => f.severity === "medium")).toBe(true);
    });

    it("returns clean for clean classification", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      classification: "clean",
                      confidence: 0.95,
                      reasoning: "Normal cooking content",
                      categories: [],
                    }),
                  },
                },
              ],
            }),
        }),
      ) as typeof fetch;

      const result = await domainContentModerationService.runDeepClassification(
        "cooking recipes",
        "website",
      );

      expect(result.flags.length).toBe(0);
      expect(result.reasoning).toBe("Normal cooking content");
    });

    it("handles malformed JSON response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: { content: "not valid json {{{" },
                },
              ],
            }),
        }),
      ) as typeof fetch;

      const result = await domainContentModerationService.runDeepClassification(
        "some content",
        "website",
      );

      expect(result.aiUnavailable).toBe(true);
      expect(result.reasoning).toContain("bad_json");
    });

    it("handles invalid classification value", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      classification: "maybe_bad",
                      confidence: 0.5,
                      reasoning: "test",
                      categories: [],
                    }),
                  },
                },
              ],
            }),
        }),
      ) as typeof fetch;

      const result = await domainContentModerationService.runDeepClassification(
        "some content",
        "website",
      );

      expect(result.aiUnavailable).toBe(true);
      expect(result.reasoning).toContain("bad_classification");
    });

    it("handles API failure gracefully", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ error: "Rate limited" }),
        }),
      ) as typeof fetch;

      const result = await domainContentModerationService.runDeepClassification(
        "some content",
        "website",
      );

      expect(result.aiUnavailable).toBe(true);
      expect(result.flags.some((f) => f.reason.includes("api_failed"))).toBe(
        true,
      );
    });
  });
});
