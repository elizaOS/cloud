import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { creditsModuleRuntimeShim } from "@/tests/support/bun-partial-module-shims";

import { jsonRequest } from "./route-test-helpers";

class MockInsufficientCreditsError extends Error {
  required: number;
  constructor(required: number) {
    super("Insufficient credits");
    this.required = required;
  }
}

const mockRequireAuthOrApiKey = mock();
const mockGetAnonymousUser = mock();
const mockGetOrCreateAnonymousUser = mock();
const mockEstimateRequestCost = mock();
const mockCalculateCost = mock();
const mockEstimateTokens = mock();
const mockGetProviderFromModel = mock();
const mockNormalizeModelName = mock();
const mockIsReasoningModel = mock();
const mockGetProviderForModel = mock();
const mockChatCompletions = mock();
const mockShouldBlockUser = mock();
const mockModerateInBackground = mock();
const mockReserveAndDeductCredits = mock();
const mockReconcileCredits = mock();
const mockCreateGeneration = mock();
const mockCreateUsage = mock();
const mockIsGroqNativeModel = mock();

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKey: mockRequireAuthOrApiKey,
}));

mock.module("@/lib/auth-anonymous", () => ({
  getAnonymousUser: mockGetAnonymousUser,
  getOrCreateAnonymousUser: mockGetOrCreateAnonymousUser,
}));

mock.module("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: (...args: unknown[]) => unknown) => handler,
  RateLimitPresets: {
    RELAXED: {},
  },
}));

mock.module("@/lib/models", () => ({
  isGroqNativeModel: mockIsGroqNativeModel,
}));

mock.module("@/lib/pricing", () => ({
  calculateCost: mockCalculateCost,
  estimateRequestCost: mockEstimateRequestCost,
  estimateTokens: mockEstimateTokens,
  getProviderFromModel: mockGetProviderFromModel,
  isReasoningModel: mockIsReasoningModel,
  normalizeModelName: mockNormalizeModelName,
}));

mock.module("@/lib/providers", () => ({
  getProviderForModel: mockGetProviderForModel,
}));

mock.module("@/lib/services/content-moderation", () => ({
  contentModerationService: {
    shouldBlockUser: mockShouldBlockUser,
    moderateInBackground: mockModerateInBackground,
  },
}));

mock.module("@/lib/services/credits", () => ({
  ...creditsModuleRuntimeShim,
  creditsService: {
    reserveAndDeductCredits: mockReserveAndDeductCredits,
    reconcile: mockReconcileCredits,
  },
  InsufficientCreditsError: MockInsufficientCreditsError,
}));

mock.module("@/lib/services/generations", () => ({
  generationsService: {
    create: mockCreateGeneration,
  },
}));

mock.module("@/lib/services/usage", () => ({
  usageService: {
    create: mockCreateUsage,
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

import { POST as responsesPost } from "@/app/api/v1/responses/route";

beforeEach(() => {
  mockRequireAuthOrApiKey.mockReset();
  mockGetAnonymousUser.mockReset();
  mockGetOrCreateAnonymousUser.mockReset();
  mockEstimateRequestCost.mockReset();
  mockCalculateCost.mockReset();
  mockEstimateTokens.mockReset();
  mockGetProviderFromModel.mockReset();
  mockNormalizeModelName.mockReset();
  mockIsReasoningModel.mockReset();
  mockGetProviderForModel.mockReset();
  mockChatCompletions.mockReset();
  mockShouldBlockUser.mockReset();
  mockModerateInBackground.mockReset();
  mockReserveAndDeductCredits.mockReset();
  mockReconcileCredits.mockReset();
  mockCreateGeneration.mockReset();
  mockCreateUsage.mockReset();
  mockIsGroqNativeModel.mockReset();

  mockRequireAuthOrApiKey.mockResolvedValue({
    user: { id: "user-1", organization_id: "org-1" },
    apiKey: { id: "api-key-1" },
  });
  mockGetAnonymousUser.mockResolvedValue(null);
  mockGetOrCreateAnonymousUser.mockResolvedValue(null);
  mockEstimateRequestCost.mockResolvedValue(1.23);
  mockCalculateCost.mockResolvedValue({
    inputCost: 0.01,
    outputCost: 0.02,
    totalCost: 0.03,
  });
  mockEstimateTokens.mockImplementation((text: string) => Math.ceil(text.length / 4));
  mockGetProviderFromModel.mockReturnValue("openai");
  mockNormalizeModelName.mockImplementation((model: string) => model);
  mockIsReasoningModel.mockReturnValue(false);
  mockGetProviderForModel.mockReturnValue({
    chatCompletions: mockChatCompletions,
  });
  mockShouldBlockUser.mockResolvedValue(false);
  mockReserveAndDeductCredits.mockResolvedValue({ success: true });
  mockReconcileCredits.mockResolvedValue(undefined);
  mockCreateGeneration.mockResolvedValue(undefined);
  mockCreateUsage.mockResolvedValue({ id: "usage-1" });
  mockIsGroqNativeModel.mockReturnValue(false);
  mockChatCompletions.mockResolvedValue(
    Response.json({
      id: "resp-1",
      object: "chat.completion",
      created: 1,
      model: "gpt-4o-mini",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "ok",
          },
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 34,
        total_tokens: 46,
      },
    }),
  );
});

afterEach(() => {
  mock.restore();
});

describe("/api/v1/responses", () => {
  test("passes max_output_tokens into request cost estimation", async () => {
    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-4o-mini",
        input: [{ role: "user", content: "hello there" }],
        max_output_tokens: 2048,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockEstimateRequestCost).toHaveBeenCalledWith(
      "gpt-4o-mini",
      [{ role: "user", content: "hello there" }],
      2048,
    );
  });

  test("normalizes input_image strings and input_file URLs before forwarding", async () => {
    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-4o-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "see attached" },
              { type: "input_image", image_url: "https://example.com/image.png" },
              {
                type: "input_file",
                filename: "brief.pdf",
                file_url: "https://example.com/brief.pdf",
              },
            ],
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(mockChatCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: [
              { type: "text", text: "see attached" },
              {
                type: "image_url",
                image_url: { url: "https://example.com/image.png" },
              },
              {
                type: "file",
                file: {
                  filename: "brief.pdf",
                  file_data: "https://example.com/brief.pdf",
                },
              },
            ],
          }),
        ],
      }),
      expect.objectContaining({
        timeoutMs: expect.any(Number),
      }),
    );
  });

  test("preserves input_file file ids when forwarding", async () => {
    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-4o-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: "spec.pdf",
                file_id: "file-123",
              },
            ],
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(mockChatCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: [
              {
                type: "file",
                file: {
                  filename: "spec.pdf",
                  file_id: "file-123",
                },
              },
            ],
          }),
        ],
      }),
      expect.objectContaining({
        timeoutMs: expect.any(Number),
      }),
    );
  });

  test("normalizes flat Responses-API tools before forwarding to chat completions", async () => {
    // End-to-end check that mirrors what Codex CLI sends: flat Responses-API
    // tools should be normalized to nested Chat Completions format by the
    // time the downstream chat completions adapter is invoked.
    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5",
        input: [{ role: "user", content: "run it" }],
        tools: [
          {
            type: "function",
            name: "shell",
            description: "Run a shell command",
            parameters: {
              type: "object",
              properties: { command: { type: "string" } },
              required: ["command"],
            },
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(mockChatCompletions).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          {
            type: "function",
            function: {
              name: "shell",
              description: "Run a shell command",
              parameters: {
                type: "object",
                properties: { command: { type: "string" } },
                required: ["command"],
              },
            },
          },
        ],
      }),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// transformAISdkToOpenAI tool normalization
// ---------------------------------------------------------------------------
//
// OpenAI's Responses API uses a flat tool format:
//   { type: "function", name, description, parameters }
//
// while Chat Completions uses a nested format:
//   { type: "function", function: { name, description, parameters } }
//
// Our /v1/responses endpoint forwards to a Chat Completions call downstream,
// so flat-format tools coming from gpt-5.x clients (Codex CLI, etc.) need to
// be normalized to the nested form. These tests verify that.

describe("transformAISdkToOpenAI tool normalization", () => {
  test("normalizes flat Responses-API tools to nested Chat-Completions tools", async () => {
    const { transformAISdkToOpenAI } = await import(
      "@/app/api/v1/responses/route"
    );

    const result = transformAISdkToOpenAI({
      model: "gpt-5",
      input: [{ role: "user", content: "ls" }],
      tools: [
        {
          type: "function",
          name: "shell",
          description: "Run a shell command",
          parameters: {
            type: "object",
            properties: { command: { type: "string" } },
            required: ["command"],
          },
        },
      ],
    });

    expect(result.tools).toEqual([
      {
        type: "function",
        function: {
          name: "shell",
          description: "Run a shell command",
          parameters: {
            type: "object",
            properties: { command: { type: "string" } },
            required: ["command"],
          },
        },
      },
    ]);
  });

  test("passes already-nested Chat-Completions tools through unchanged", async () => {
    const { transformAISdkToOpenAI } = await import(
      "@/app/api/v1/responses/route"
    );

    const nestedTool = {
      type: "function" as const,
      function: {
        name: "search",
        description: "Search the web",
        parameters: { type: "object", properties: {} },
      },
    };

    const result = transformAISdkToOpenAI({
      model: "gpt-4o",
      input: [{ role: "user", content: "find me a thing" }],
      tools: [nestedTool],
    });

    expect(result.tools).toEqual([nestedTool]);
  });

  test("handles missing description and parameters in flat format", async () => {
    const { transformAISdkToOpenAI } = await import(
      "@/app/api/v1/responses/route"
    );

    const result = transformAISdkToOpenAI({
      model: "gpt-5",
      input: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", name: "ping" }],
    });

    expect(result.tools).toEqual([
      {
        type: "function",
        function: { name: "ping" },
      },
    ]);
  });

  test("returns undefined tools when none provided", async () => {
    const { transformAISdkToOpenAI } = await import(
      "@/app/api/v1/responses/route"
    );

    const result = transformAISdkToOpenAI({
      model: "gpt-4o",
      input: [{ role: "user", content: "hi" }],
    });

    expect(result.tools).toBeUndefined();
  });
});
