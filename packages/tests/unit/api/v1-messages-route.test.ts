import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { creditsModuleRuntimeShim } from "@/tests/support/bun-partial-module-shims";

import { jsonRequest } from "./route-test-helpers";

const realAiModule = await import("ai");

class MockInsufficientCreditsError extends Error {
  required: number;

  constructor(required: number) {
    super("Insufficient credits");
    this.required = required;
  }
}

const mockRequireAuthOrApiKeyWithOrg = mock();
const mockShouldBlockUser = mock();
const mockModerateInBackground = mock();
const mockAppsGetById = mock();
const mockCalculateCostWithMarkup = mock();
const mockCheckBalance = mock();
const mockReconcileCredits = mock();
const mockReserveCredits = mock();
const mockBillUsage = mock();
const mockRecordUsageAnalytics = mock();
const mockEstimateInputTokens = mock();
const mockCreateAnonymousReservation = mock();
const mockCalculateCost = mock();
const mockGetProviderFromModel = mock();
const mockNormalizeModelName = mock();
const mockGetSafeModelParams = mock();
const mockGenerateText = mock();
const mockStreamText = mock();

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/services/content-moderation", () => ({
  contentModerationService: {
    shouldBlockUser: mockShouldBlockUser,
    moderateInBackground: mockModerateInBackground,
  },
}));

mock.module("@/lib/services/apps", () => ({
  appsService: {
    getById: mockAppsGetById,
  },
}));

mock.module("@/lib/services/app-credits", () => ({
  appCreditsService: {
    calculateCostWithMarkup: mockCalculateCostWithMarkup,
    checkBalance: mockCheckBalance,
    reconcileCredits: mockReconcileCredits,
  },
}));

mock.module("@/lib/services/ai-billing", () => ({
  reserveCredits: mockReserveCredits,
  billUsage: mockBillUsage,
  recordUsageAnalytics: mockRecordUsageAnalytics,
  estimateInputTokens: mockEstimateInputTokens,
  InsufficientCreditsError: MockInsufficientCreditsError,
}));

mock.module("@/lib/services/credits", () => ({
  ...creditsModuleRuntimeShim,
  creditsService: {
    createAnonymousReservation: mockCreateAnonymousReservation,
  },
  InsufficientCreditsError: MockInsufficientCreditsError,
}));

mock.module("@/lib/pricing", () => ({
  API_KEY_PREFIX_LENGTH: 12,
  IMAGE_GENERATION_COST: 1,
  VIDEO_GENERATION_COST: 5,
  VIDEO_GENERATION_FALLBACK_COST: 1,
  MONTHLY_CREDIT_CAP: 1000,
  PLATFORM_MARKUP_MULTIPLIER: 1.2,
  TTS_COST_PER_1K_CHARS: 0.03,
  STT_COST_PER_MINUTE: 0.006,
  TTS_MINIMUM_COST: 0,
  STT_MINIMUM_COST: 0,
  calculateCost: mockCalculateCost,
  estimateTokens: (text: string) => Math.ceil(text.length / 4),
  getProviderFromModel: mockGetProviderFromModel,
  isReasoningModel: () => false,
  normalizeModelName: mockNormalizeModelName,
  getSafeModelParams: mockGetSafeModelParams,
}));

mock.module("ai", () => ({
  ...realAiModule,
  generateText: mockGenerateText,
  jsonSchema: (schema: unknown) => schema,
  streamText: mockStreamText,
}));

mock.module("@ai-sdk/gateway", () => ({
  gateway: {
    languageModel: (model: string) => `gateway:${model}`,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

mock.module("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: (...args: unknown[]) => unknown) => handler,
  RateLimitPresets: {
    RELAXED: {},
  },
}));

mock.module("@/lib/middleware/cors-apps", () => ({
  createPreflightResponse: () => new Response(null, { status: 204 }),
}));

import { OPTIONS as messagesOptions, POST as messagesPost } from "@/app/api/v1/messages/route";

const reservation = {
  reservedAmount: 1,
  reconcile: mock().mockResolvedValue(undefined),
};

beforeEach(() => {
  mockRequireAuthOrApiKeyWithOrg.mockReset();
  mockShouldBlockUser.mockReset();
  mockModerateInBackground.mockReset();
  mockAppsGetById.mockReset();
  mockCalculateCostWithMarkup.mockReset();
  mockCheckBalance.mockReset();
  mockReconcileCredits.mockReset();
  mockReserveCredits.mockReset();
  mockBillUsage.mockReset();
  mockRecordUsageAnalytics.mockReset();
  mockEstimateInputTokens.mockReset();
  mockCreateAnonymousReservation.mockReset();
  mockCalculateCost.mockReset();
  mockGetProviderFromModel.mockReset();
  mockNormalizeModelName.mockReset();
  mockGetSafeModelParams.mockReset();
  mockGenerateText.mockReset();
  mockStreamText.mockReset();

  mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
    user: { id: "user-1", organization_id: "org-1" },
    apiKey: { id: "api-key-1" },
  });
  mockShouldBlockUser.mockResolvedValue(false);
  mockAppsGetById.mockResolvedValue(null);
  mockReserveCredits.mockResolvedValue(reservation);
  mockBillUsage.mockResolvedValue({
    inputTokens: 42,
    outputTokens: 21,
    totalTokens: 63,
    totalCost: 0.1234,
  });
  mockRecordUsageAnalytics.mockResolvedValue(undefined);
  mockEstimateInputTokens.mockReturnValue(42);
  mockCreateAnonymousReservation.mockReturnValue(reservation);
  mockCalculateCost.mockResolvedValue({ totalCost: 0.25 });
  mockGetProviderFromModel.mockReturnValue("anthropic");
  mockNormalizeModelName.mockImplementation((model: string) => model.replace(/^anthropic\//, ""));
  mockGetSafeModelParams.mockImplementation(
    (_model: string, params: Record<string, unknown>) => params,
  );
});

afterEach(() => {
  mock.restore();
});

describe("/api/v1/messages", () => {
  test("maps auth failures to Anthropic authentication_error", async () => {
    mockRequireAuthOrApiKeyWithOrg.mockRejectedValueOnce(new Error("bad key"));

    const response = await messagesPost(
      jsonRequest("http://localhost:3000/api/v1/messages", "POST", {
        model: "claude-sonnet-4",
        max_tokens: 16,
        messages: [{ role: "user", content: "hi" }],
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      type: "error",
      error: {
        type: "authentication_error",
        message: "bad key",
      },
    });
  });

  test("OPTIONS includes Anthropic and app credit headers", async () => {
    const response = await messagesOptions(
      new NextRequest("http://localhost:3000/api/v1/messages", {
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("X-App-Id");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("anthropic-version");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("anthropic-beta");
  });

  test("returns Anthropic-shaped 400 for invalid JSON", async () => {
    const response = await messagesPost(
      new NextRequest("http://localhost:3000/api/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Invalid JSON body",
      },
    });
  });

  test("maps Anthropic tool messages to model messages and uses maxOutputTokens", async () => {
    mockGenerateText.mockResolvedValue({
      text: "ok",
      toolCalls: [],
      finishReason: "stop",
      rawFinishReason: "stop_sequence",
      usage: {
        inputTokens: 50,
        outputTokens: 10,
        totalTokens: 60,
      },
    });

    const response = await messagesPost(
      jsonRequest("http://localhost:3000/api/v1/messages", "POST", {
        model: "claude-sonnet-4",
        max_tokens: 64,
        stop_sequences: ["</stop>"],
        system: [{ type: "text", text: "system prompt" }],
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool-1",
                name: "search",
                input: { q: "release status" },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool-1",
                content: "all green",
              },
              { type: "text", text: "summarize it" },
            ],
          },
        ],
      }),
    );

    const generateCall = mockGenerateText.mock.calls[0]?.[0];
    expect(generateCall.maxOutputTokens).toBe(64);
    expect(generateCall.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "assistant",
          content: expect.arrayContaining([
            expect.objectContaining({
              type: "tool-call",
              toolCallId: "tool-1",
              toolName: "search",
              input: { q: "release status" },
            }),
          ]),
        }),
        expect.objectContaining({
          role: "tool",
          content: expect.arrayContaining([
            expect.objectContaining({
              type: "tool-result",
              toolCallId: "tool-1",
              toolName: "search",
            }),
          ]),
        }),
      ]),
    );
    expect(mockEstimateInputTokens.mock.calls[0]?.[0]).toContainEqual({
      content: "system prompt",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.stop_reason).toBe("stop_sequence");
    expect(body.stop_sequence).toBe("</stop>");
    expect(body.usage).toEqual({
      input_tokens: 42,
      output_tokens: 21,
    });
  });

  test("streams tool_use blocks from fullStream and reports tool_use stop reason", async () => {
    mockStreamText.mockImplementation(() => ({
      fullStream: (async function* () {
        yield {
          type: "tool-input-start",
          id: "tool-1",
          toolName: "search",
        };
        yield {
          type: "tool-input-delta",
          id: "tool-1",
          delta: '{"q":"ship it"}',
        };
        yield {
          type: "tool-input-end",
          id: "tool-1",
        };
        yield {
          type: "finish",
          finishReason: "length",
          rawFinishReason: "max_tokens",
          totalUsage: {
            inputTokens: 12,
            outputTokens: 34,
            totalTokens: 46,
          },
        };
      })(),
    }));

    const response = await messagesPost(
      jsonRequest("http://localhost:3000/api/v1/messages", "POST", {
        model: "claude-sonnet-4",
        max_tokens: 32,
        stream: true,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "search for shipping status" }],
          },
        ],
      }),
    );

    expect(mockStreamText.mock.calls[0]?.[0].maxOutputTokens).toBe(32);
    const body = await new Response(response.body).text();

    expect(body).toContain("event: content_block_start");
    expect(body).toContain('"type":"tool_use"');
    expect(body).toContain('"type":"input_json_delta"');
    expect(body).toContain("ship it");
    expect(body).toContain('"stop_reason":"tool_use"');
    expect(body).toContain('"output_tokens":34');
  });
});
