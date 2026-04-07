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
const mockResponsesPassthrough = mock();
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
    responses: mockResponsesPassthrough,
  });
  mockResponsesPassthrough.mockReset();
  mockResponsesPassthrough.mockResolvedValue(
    new Response('data: {"type":"response.completed"}\n\n', {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  );
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

  test("routes gpt-5.x native Responses-API payload to passthrough", async () => {
    // Codex CLI sends `instructions` + a `custom` tool. This shape is
    // not representable in Chat Completions format, so the route must
    // detect it and call the provider's native responses() passthrough.
    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5.4",
        instructions: "You are Codex.",
        input: [{ role: "user", content: "hello" }],
        tools: [
          {
            type: "function",
            name: "exec_command",
            parameters: { type: "object", properties: {} },
          },
          {
            type: "custom",
            name: "apply_patch",
            format: { type: "grammar", syntax: "lark", definition: "" },
          },
          { type: "web_search", external_web_access: false },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-eliza-responses-passthrough")).toBe("1");
    expect(mockResponsesPassthrough).toHaveBeenCalledTimes(1);
    // Chat completions must NOT be called when passthrough runs.
    expect(mockChatCompletions).not.toHaveBeenCalled();

    // The raw body (including flat tools, custom tools, web_search, and
    // `instructions`) must be forwarded verbatim to the provider.
    const [passthroughBody] = mockResponsesPassthrough.mock.calls[0];
    expect(passthroughBody.instructions).toBe("You are Codex.");
    expect(passthroughBody.tools).toHaveLength(3);
    expect(passthroughBody.tools[0]).toEqual({
      type: "function",
      name: "exec_command",
      parameters: { type: "object", properties: {} },
    });
    expect(passthroughBody.tools[1].type).toBe("custom");
    expect(passthroughBody.tools[2].type).toBe("web_search");
  });

  test("routes requests with custom tools to passthrough even without instructions", async () => {
    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-4o",
        input: [{ role: "user", content: "go" }],
        tools: [{ type: "web_search" }],
      }),
    );

    expect(response.status).toBe(200);
    expect(mockResponsesPassthrough).toHaveBeenCalledTimes(1);
    expect(mockChatCompletions).not.toHaveBeenCalled();
  });

  test("rewrites bare model ids to provider/model format for the gateway", async () => {
    // Codex sends `model: "gpt-5.4"` (bare). Vercel AI Gateway's
    // /responses endpoint requires `provider/model` format, so the
    // passthrough must rewrite this to `openai/gpt-5.4`. The ORIGINAL
    // caller body must not be mutated.
    const callerBody = {
      model: "gpt-5.4",
      instructions: "hi",
      input: [{ role: "user", content: "test" }],
    };

    await responsesPost(jsonRequest("http://localhost:3000/api/v1/responses", "POST", callerBody));

    expect(mockResponsesPassthrough).toHaveBeenCalledTimes(1);
    const [forwarded] = mockResponsesPassthrough.mock.calls[0];
    expect(forwarded.model).toBe("openai/gpt-5.4");
    // Caller's original object should be untouched.
    expect(callerBody.model).toBe("gpt-5.4");
  });

  test("preserves already-prefixed model ids", async () => {
    await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "anthropic/claude-sonnet-4.6",
        instructions: "hi",
        input: [{ role: "user", content: "test" }],
      }),
    );

    const [forwarded] = mockResponsesPassthrough.mock.calls[0];
    expect(forwarded.model).toBe("anthropic/claude-sonnet-4.6");
  });

  test("infers provider prefix for claude/gemini bare ids", async () => {
    // claude-* → anthropic/, gemini-* → google/
    await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "claude-sonnet-4.6",
        instructions: "hi",
        input: [{ role: "user", content: "x" }],
      }),
    );
    expect(mockResponsesPassthrough.mock.calls[0][0].model).toBe("anthropic/claude-sonnet-4.6");

    mockResponsesPassthrough.mockClear();
    await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gemini-2.5-pro",
        instructions: "hi",
        input: [{ role: "user", content: "x" }],
      }),
    );
    expect(mockResponsesPassthrough.mock.calls[0][0].model).toBe("google/gemini-2.5-pro");
  });

  test("detects bare gpt-5 (no suffix) as native Responses", async () => {
    // The regex must match `gpt-5` and `gpt-5-mini`, not only `gpt-5.x`.
    await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5-mini",
        input: [{ role: "user", content: "hi" }],
      }),
    );
    expect(mockResponsesPassthrough).toHaveBeenCalledTimes(1);
    expect(mockChatCompletions).not.toHaveBeenCalled();
  });

  test("forwards upstream 4xx errors verbatim and refunds credits", async () => {
    mockResponsesPassthrough.mockResolvedValueOnce(
      Response.json(
        { error: { message: "model not found", type: "invalid_request_error" } },
        { status: 404 },
      ),
    );

    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5.4",
        instructions: "x",
        input: [{ role: "user", content: "hi" }],
      }),
    );

    expect(response.status).toBe(404);
    // Refund on error: reconcile should be called with actualCost = 0.
    expect(mockReconcileCredits).toHaveBeenCalledWith(expect.objectContaining({ actualCost: 0 }));
  });

  test("returns 402 when passthrough credit reservation fails", async () => {
    mockReserveAndDeductCredits.mockResolvedValueOnce({
      success: false,
      required: 5,
    });

    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5.4",
        instructions: "x",
        input: [{ role: "user", content: "hi" }],
      }),
    );

    expect(response.status).toBe(402);
    // Upstream must not be touched when reservation fails.
    expect(mockResponsesPassthrough).not.toHaveBeenCalled();
  });

  test("returns 400 when provider has no responses() method", async () => {
    mockGetProviderForModel.mockReturnValueOnce({
      chatCompletions: mockChatCompletions,
      // no responses method
    });

    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5.4",
        instructions: "x",
        input: [{ role: "user", content: "hi" }],
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("unsupported_provider");
  });

  test("anonymous users skip credit reservation in passthrough", async () => {
    mockRequireAuthOrApiKey.mockRejectedValueOnce(new Error("unauth"));
    mockGetAnonymousUser.mockResolvedValueOnce({
      user: { id: "anon-1", organization_id: null },
    });

    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5.4",
        instructions: "x",
        input: [{ role: "user", content: "hi" }],
      }),
    );

    expect(response.status).toBe(200);
    expect(mockReserveAndDeductCredits).not.toHaveBeenCalled();
    expect(mockReconcileCredits).not.toHaveBeenCalled();
    expect(mockResponsesPassthrough).toHaveBeenCalledTimes(1);
  });

  test("reconciles passthrough reservation to reserved amount on success", async () => {
    await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5.4",
        instructions: "x",
        input: [{ role: "user", content: "hi" }],
      }),
    );

    // Background settle runs in the next microtask; flush.
    await new Promise((r) => setTimeout(r, 0));

    expect(mockReconcileCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        reservedAmount: expect.any(Number),
        actualCost: expect.any(Number),
      }),
    );
  });

  test("threads api_key_id into credit reservation + reconcile metadata", async () => {
    // Regression guard for the PR #427 review finding: the `apiKey`
    // parameter was accepted but never used, creating an audit-trail
    // gap. Both reserveAndDeductCredits and reconcile must receive
    // the api_key_id so credits can be traced back to the key that
    // paid for them.
    await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5.4",
        instructions: "x",
        input: [{ role: "user", content: "hi" }],
      }),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(mockReserveAndDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ api_key_id: "api-key-1" }),
      }),
    );
    expect(mockReconcileCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ api_key_id: "api-key-1" }),
      }),
    );
  });

  test("strips gateway-internal headers from passthrough response", async () => {
    // x-vercel-*, cf-ray, server, via, etc. must NOT leak to clients.
    // x-ratelimit-* DOES forward (transparency for client budgets).
    mockResponsesPassthrough.mockResolvedValueOnce(
      new Response('data: {"type":"response.completed"}\n\n', {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-vercel-cache": "MISS",
          "x-vercel-id": "pdx1::iad1::abc",
          "x-vercel-execution-region": "iad1",
          "cf-ray": "abc123-ORD",
          "cf-cache-status": "DYNAMIC",
          via: "1.1 vercel",
          server: "Vercel",
          "x-ratelimit-remaining-requests": "99",
          "x-ratelimit-remaining-tokens": "9999",
        },
      }),
    );

    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5.4",
        instructions: "x",
        input: [{ role: "user", content: "hi" }],
      }),
    );

    expect(response.status).toBe(200);

    // Stripped
    for (const header of [
      "x-vercel-cache",
      "x-vercel-id",
      "x-vercel-execution-region",
      "cf-ray",
      "cf-cache-status",
      "via",
      "server",
    ]) {
      expect(response.headers.get(header)).toBeNull();
    }

    // Forwarded (client transparency)
    expect(response.headers.get("x-ratelimit-remaining-requests")).toBe("99");
    expect(response.headers.get("x-ratelimit-remaining-tokens")).toBe("9999");

    // Always set
    expect(response.headers.get("x-eliza-responses-passthrough")).toBe("1");
  });

  test("uses a safe fallback reservation floor when estimateRequestCost throws", async () => {
    // PR #427 review finding: the original $0.01 floor was too small.
    // When estimation fails we should reserve a non-trivial amount so
    // an uncharged runaway session can't drain credits. Real cost is
    // reconciled on stream close.
    mockEstimateRequestCost.mockRejectedValueOnce(new Error("estimate boom"));

    await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5.4",
        instructions: "x",
        input: [{ role: "user", content: "hi" }],
      }),
    );

    // Reserved amount should be the documented floor (0.10), not the
    // previous 0.01 and not zero.
    expect(mockReserveAndDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 0.1 }),
    );
  });

  test("forwards custom and web_search tools verbatim in passthrough body", async () => {
    // Regression guard: the passthrough must not strip Responses-API-only
    // tool types. Codex relies on apply_patch (type:"custom") and
    // web_search to work end-to-end.
    await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-5.4",
        instructions: "x",
        input: [{ role: "user", content: "hi" }],
        tools: [
          {
            type: "custom",
            name: "apply_patch",
            format: { type: "grammar", syntax: "lark", definition: "start: ..." },
          },
          { type: "web_search", external_web_access: false },
          { type: "local_shell" },
        ],
      }),
    );

    const [forwarded] = mockResponsesPassthrough.mock.calls[0];
    expect(forwarded.tools).toEqual([
      {
        type: "custom",
        name: "apply_patch",
        format: { type: "grammar", syntax: "lark", definition: "start: ..." },
      },
      { type: "web_search", external_web_access: false },
      { type: "local_shell" },
    ]);
  });

  test("routes Chat Completions-compatible requests to the normal transform path", async () => {
    // No instructions, no custom tools, gpt-4o → normal path.
    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-4o-mini",
        input: [{ role: "user", content: "hi" }],
        tools: [
          {
            type: "function",
            function: { name: "search", parameters: { type: "object", properties: {} } },
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(mockResponsesPassthrough).not.toHaveBeenCalled();
    expect(mockChatCompletions).toHaveBeenCalledTimes(1);
  });

  test("normalizes flat Responses-API tools before forwarding to chat completions", async () => {
    // End-to-end check: for non-passthrough models (e.g. gpt-4o), flat
    // Responses-API tools should be normalized to nested Chat Completions
    // format by the time the downstream chat completions adapter is
    // invoked. gpt-5.x would trigger the native passthrough and skip
    // this path entirely.
    const response = await responsesPost(
      jsonRequest("http://localhost:3000/api/v1/responses", "POST", {
        model: "gpt-4o",
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
    const { transformAISdkToOpenAI } = await import("@/app/api/v1/responses/route");

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
    const { transformAISdkToOpenAI } = await import("@/app/api/v1/responses/route");

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
    const { transformAISdkToOpenAI } = await import("@/app/api/v1/responses/route");

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
    const { transformAISdkToOpenAI } = await import("@/app/api/v1/responses/route");

    const result = transformAISdkToOpenAI({
      model: "gpt-4o",
      input: [{ role: "user", content: "hi" }],
    });

    expect(result.tools).toBeUndefined();
  });

  test("normalizes a mixed array of flat and nested tools", async () => {
    const { transformAISdkToOpenAI } = await import("@/app/api/v1/responses/route");

    const result = transformAISdkToOpenAI({
      model: "gpt-5",
      input: [{ role: "user", content: "go" }],
      tools: [
        {
          type: "function",
          name: "shell",
          parameters: { type: "object", properties: {} },
        },
        {
          type: "function",
          function: {
            name: "search",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
    });

    expect(result.tools).toEqual([
      {
        type: "function",
        function: {
          name: "shell",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "search",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
  });

  test("forwards unknown-shape tools unchanged (best-effort fallback)", async () => {
    const { transformAISdkToOpenAI } = await import("@/app/api/v1/responses/route");

    // type: "function" but neither nested `function` nor a string `name`.
    // This exercises the logger.warn fallback branch — invalid shapes are
    // forwarded best-effort rather than dropped, so the downstream provider
    // surfaces the original validation error.
    const weirdTool = { type: "function", description: "no name here" } as unknown as {
      type: "function";
      name: string;
    };

    const result = transformAISdkToOpenAI({
      model: "gpt-5",
      input: [{ role: "user", content: "hi" }],
      tools: [weirdTool],
    });

    expect(result.tools).toEqual([weirdTool as never]);
  });

  test("normalizes flat tool_choice to nested form", async () => {
    const { transformAISdkToOpenAI } = await import("@/app/api/v1/responses/route");

    const result = transformAISdkToOpenAI({
      model: "gpt-5",
      input: [{ role: "user", content: "go" }],
      tool_choice: { type: "function", name: "shell" } as never,
    });

    expect(result.tool_choice).toEqual({
      type: "function",
      function: { name: "shell" },
    });
  });

  test("passes already-nested tool_choice through unchanged", async () => {
    const { transformAISdkToOpenAI } = await import("@/app/api/v1/responses/route");

    const result = transformAISdkToOpenAI({
      model: "gpt-4o",
      input: [{ role: "user", content: "go" }],
      tool_choice: { type: "function", function: { name: "search" } },
    });

    expect(result.tool_choice).toEqual({
      type: "function",
      function: { name: "search" },
    });
  });

  test("passes string tool_choice literals through unchanged", async () => {
    const { transformAISdkToOpenAI } = await import("@/app/api/v1/responses/route");

    for (const choice of ["auto", "none", "required"] as const) {
      const result = transformAISdkToOpenAI({
        model: "gpt-4o",
        input: [{ role: "user", content: "go" }],
        tool_choice: choice as never,
      });
      expect(result.tool_choice).toBe(choice);
    }
  });

  test("logs a warning when an unknown-shape tool is forwarded", async () => {
    const { transformAISdkToOpenAI } = await import("@/app/api/v1/responses/route");
    const { logger } = await import("@/lib/utils/logger");
    const warnSpy = mock();
    const originalWarn = logger.warn;
    (logger as { warn: typeof logger.warn }).warn = warnSpy as never;

    try {
      transformAISdkToOpenAI({
        model: "gpt-5",
        input: [{ role: "user", content: "hi" }],
        tools: [{ type: "function", description: "no name" } as never],
      });

      expect(warnSpy).toHaveBeenCalledWith(
        "[Responses API] Unrecognized tool shape, passing through unchanged",
        expect.objectContaining({ toolType: "function" }),
      );
    } finally {
      (logger as { warn: typeof logger.warn }).warn = originalWarn;
    }
  });

  test("preserves an empty tools array", async () => {
    const { transformAISdkToOpenAI } = await import("@/app/api/v1/responses/route");

    // Empty arrays are preserved (not stripped). The downstream provider
    // decides how to handle `tools: []` — most treat it as "no tools".
    const result = transformAISdkToOpenAI({
      model: "gpt-4o",
      input: [{ role: "user", content: "hi" }],
      tools: [],
    });

    expect(result.tools).toEqual([]);
  });
});
