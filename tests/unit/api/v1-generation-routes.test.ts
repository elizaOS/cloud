import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { jsonRequest } from "./route-test-helpers";

class MockInsufficientCreditsError extends Error {
  required: number;

  constructor(required: number) {
    super("Insufficient balance");
    this.required = required;
  }
}

const mockRequireAuth = mock();
const mockRequireAuthOrApiKey = mock();
const mockRequireAuthOrApiKeyWithOrg = mock();
const mockGetAnonymousUser = mock();
const mockGetOrCreateAnonymousUser = mock();
const mockCheckAnonymousLimit = mock();
const mockStreamText = mock();
const mockConvertToModelMessages = mock();
const mockGenerationsCreate = mock();
const mockGenerationsUpdate = mock();
const mockUsageCreate = mock();
const mockCreditsReserve = mock();
const mockCreateAnonymousReservation = mock();
const mockShouldBlockUser = mock();
const mockModerateInBackground = mock();
const mockIncrementMessageCount = mock();
const mockAddTokenUsage = mock();
const mockAddMessageWithSequence = mock();
const mockCalculateCost = mock();
const mockEstimateTokens = mock();
const mockResolveModel = mock();
const mockUploadBase64Image = mock();
const mockUploadFromUrl = mock();
const mockTrackDetailedRequest = mock();
const mockLogImageGenerated = mock();
const mockLogVideoGenerated = mock();
const mockFalSubscribe = mock();
let lastOnFinishPromise: Promise<unknown> | undefined;

const reservationFactory = () => ({
  reservedAmount: 1,
  reconcile: mock().mockResolvedValue(undefined),
});

mock.module("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
  requireAuthOrApiKey: mockRequireAuthOrApiKey,
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

mock.module("@/lib/auth-anonymous", () => ({
  getAnonymousUser: mockGetAnonymousUser,
  getOrCreateAnonymousUser: mockGetOrCreateAnonymousUser,
  checkAnonymousLimit: mockCheckAnonymousLimit,
}));

mock.module("ai", () => ({
  streamText: mockStreamText,
  convertToModelMessages: mockConvertToModelMessages,
}));

mock.module("@ai-sdk/openai", () => ({
  openai: Object.assign((model: string) => `openai:${model}`, {
    tools: {
      imageGeneration: () => "image-generation-tool",
    },
  }),
}));

mock.module("@ai-sdk/gateway", () => ({
  gateway: {
    languageModel: (model: string) => `gateway:${model}`,
  },
}));

mock.module("@/lib/services/generations", () => ({
  generationsService: {
    create: mockGenerationsCreate,
    update: mockGenerationsUpdate,
  },
}));

mock.module("@/lib/services/usage", () => ({
  usageService: {
    create: mockUsageCreate,
  },
}));

mock.module("@/lib/services/credits", () => ({
  creditsService: {
    reserve: mockCreditsReserve,
    createAnonymousReservation: mockCreateAnonymousReservation,
  },
  InsufficientCreditsError: MockInsufficientCreditsError,
}));

mock.module("@/lib/services/content-moderation", () => ({
  contentModerationService: {
    shouldBlockUser: mockShouldBlockUser,
    moderateInBackground: mockModerateInBackground,
  },
}));

mock.module("@/lib/services/anonymous-sessions", () => ({
  anonymousSessionsService: {
    incrementMessageCount: mockIncrementMessageCount,
    addTokenUsage: mockAddTokenUsage,
  },
}));

mock.module("@/lib/services/conversations", () => ({
  conversationsService: {
    addMessageWithSequence: mockAddMessageWithSequence,
  },
}));

mock.module("@/lib/pricing", () => ({
  IMAGE_GENERATION_COST: 1,
  VIDEO_GENERATION_COST: 5,
  VIDEO_GENERATION_FALLBACK_COST: 1,
  calculateCost: mockCalculateCost,
  estimateTokens: mockEstimateTokens,
}));

mock.module("@/lib/models", () => ({
  resolveModel: mockResolveModel,
}));

mock.module("@/lib/blob", () => ({
  uploadBase64Image: mockUploadBase64Image,
  uploadFromUrl: mockUploadFromUrl,
  isFalAiUrl: (url: string) => url.includes("fal.ai"),
}));

mock.module("@/lib/services/apps", () => ({
  appsService: {
    trackDetailedRequest: mockTrackDetailedRequest,
  },
}));

mock.module("@/lib/services/discord", () => ({
  discordService: {
    logImageGenerated: mockLogImageGenerated,
    logVideoGenerated: mockLogVideoGenerated,
  },
}));

mock.module("@fal-ai/client", () => ({
  fal: {
    config: () => {},
    subscribe: mockFalSubscribe,
  },
}));

mock.module("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: (...args: unknown[]) => unknown) => handler,
  RateLimitPresets: {
    STANDARD: {},
    CRITICAL: {},
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

import { POST as characterAssistant } from "@/app/api/v1/character-assistant/route";
import { POST as chat } from "@/app/api/v1/chat/route";
import {
  POST as generateImage,
  OPTIONS as generateImageOptions,
} from "@/app/api/v1/generate-image/route";
import { POST as generatePrompts } from "@/app/api/v1/generate-prompts/route";
import { POST as generateVideo } from "@/app/api/v1/generate-video/route";

const authenticatedUser = {
  id: "user-1",
  email: "shaw@example.com",
  name: "Shaw",
  organization_id: "org-1",
  organization: {
    id: "org-1",
    name: "Org One",
  },
};

beforeEach(() => {
  process.env.FAL_KEY = "fal_test";

  mockRequireAuth.mockReset();
  mockRequireAuthOrApiKey.mockReset();
  mockRequireAuthOrApiKeyWithOrg.mockReset();
  mockGetAnonymousUser.mockReset();
  mockGetOrCreateAnonymousUser.mockReset();
  mockCheckAnonymousLimit.mockReset();
  mockStreamText.mockReset();
  mockConvertToModelMessages.mockReset();
  mockGenerationsCreate.mockReset();
  mockGenerationsUpdate.mockReset();
  mockUsageCreate.mockReset();
  mockCreditsReserve.mockReset();
  mockCreateAnonymousReservation.mockReset();
  mockShouldBlockUser.mockReset();
  mockModerateInBackground.mockReset();
  mockIncrementMessageCount.mockReset();
  mockAddTokenUsage.mockReset();
  mockAddMessageWithSequence.mockReset();
  mockCalculateCost.mockReset();
  mockEstimateTokens.mockReset();
  mockResolveModel.mockReset();
  mockUploadBase64Image.mockReset();
  mockUploadFromUrl.mockReset();
  mockTrackDetailedRequest.mockReset();
  mockLogImageGenerated.mockReset();
  mockLogVideoGenerated.mockReset();
  mockFalSubscribe.mockReset();
  lastOnFinishPromise = undefined;

  mockRequireAuth.mockResolvedValue(authenticatedUser);
  mockRequireAuthOrApiKey.mockResolvedValue({
    user: authenticatedUser,
    apiKey: { id: "api-key-1" },
  });
  mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
    user: authenticatedUser,
    apiKey: { id: "api-key-1" },
  });
  mockGetAnonymousUser.mockResolvedValue({
    user: {
      id: "anon-1",
      organization_id: null,
      organization: null,
    },
    session: {
      id: "session-1",
      session_token: "session-token",
      message_count: 0,
    },
  });
  mockGetOrCreateAnonymousUser.mockResolvedValue({
    user: {
      id: "anon-1",
      organization_id: null,
      organization: null,
    },
    session: { id: "session-1", session_token: "session-token" },
  });
  mockCheckAnonymousLimit.mockResolvedValue({
    allowed: true,
    limit: 5,
    remaining: 4,
  });
  mockConvertToModelMessages.mockImplementation(async (messages) => messages);
  mockGenerationsCreate.mockResolvedValue({ id: "gen-1" });
  mockGenerationsUpdate.mockResolvedValue({ id: "gen-1" });
  mockUsageCreate.mockResolvedValue({ id: "usage-1" });
  mockCreditsReserve.mockResolvedValue(reservationFactory());
  mockCreateAnonymousReservation.mockReturnValue(reservationFactory());
  mockShouldBlockUser.mockResolvedValue(false);
  mockEstimateTokens.mockReturnValue(12);
  mockCalculateCost.mockResolvedValue({
    inputCost: 0.1,
    outputCost: 0.2,
    totalCost: 0.3,
  });
  mockResolveModel.mockReturnValue({
    modelId: "gpt-4o-mini",
    provider: "gateway",
  });
  mockUploadBase64Image.mockResolvedValue({
    url: "https://blob.example/image.png",
    size: 1234,
  });
  mockUploadFromUrl.mockResolvedValue({
    url: "https://blob.example/video.mp4",
    size: 4567,
  });
  mockLogImageGenerated.mockResolvedValue(undefined);
  mockLogVideoGenerated.mockResolvedValue(undefined);
  mockStreamText.mockImplementation((config: { onFinish?: (payload: unknown) => unknown }) => {
    if (config.onFinish) {
      lastOnFinishPromise = Promise.resolve(
        config.onFinish({
          text: "assistant reply",
          usage: { inputTokens: 10, outputTokens: 20 },
        }),
      );
    }

    return {
      fullStream: (async function* () {})(),
      toUIMessageStreamResponse: () => new Response("ui-stream"),
      toTextStreamResponse: () => new Response('["prompt-one","prompt-two"]'),
    };
  });
  mockFalSubscribe.mockResolvedValue({
    requestId: "request-1",
    data: {
      video: {
        url: "https://storage.fal.ai/video.mp4",
        content_type: "video/mp4",
        width: 1280,
        height: 720,
        file_name: "video.mp4",
      },
      seed: 123,
      has_nsfw_concepts: [],
      timings: { inference: 10 },
    },
  });
});

afterEach(() => {
  mock.restore();
});

describe("Prompt generation APIs", () => {
  test("generate-prompts uses the provided seed in the system prompt", async () => {
    const response = await generatePrompts(
      jsonRequest("http://localhost:3000/api/v1/generate-prompts", "POST", {
        seed: 12345,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockStreamText).toHaveBeenCalled();
    expect(mockStreamText.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain(
      "Random seed: 12345",
    );
  });

  test("generate-prompts returns auth failures as 401", async () => {
    mockRequireAuth.mockRejectedValue(new Error("Unauthorized: Authentication required"));

    const response = await generatePrompts(
      jsonRequest("http://localhost:3000/api/v1/generate-prompts", "POST", {}),
    );

    expect(response.status).toBe(401);
  });

  test("character-assistant rejects empty message arrays", async () => {
    const response = await characterAssistant(
      jsonRequest("http://localhost:3000/api/v1/character-assistant", "POST", { messages: [] }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Messages array cannot be empty");
  });

  test("character-assistant includes the current character during edit mode", async () => {
    const response = await characterAssistant(
      jsonRequest("http://localhost:3000/api/v1/character-assistant", "POST", {
        messages: [{ role: "user", parts: [{ type: "text", text: "Refine it" }] }],
        isEditMode: true,
        character: { name: "Astra", bio: "Space guide" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockStreamText.mock.calls[0]?.[0]?.system).toContain("Astra");
    expect(mockStreamText.mock.calls[0]?.[0]?.system).toContain("Space guide");
  });
});

describe("Image and video generation APIs", () => {
  test("generate-image OPTIONS returns permissive CORS headers", async () => {
    const response = await generateImageOptions(
      jsonRequest("http://localhost:3000/api/v1/generate-image", "OPTIONS"),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  test("generate-image rejects empty prompts", async () => {
    const response = await generateImage(
      jsonRequest("http://localhost:3000/api/v1/generate-image", "POST", {
        prompt: "",
      }),
    );

    expect(response.status).toBe(400);
  });

  test("generate-image supports anonymous fallback and uploads generated files", async () => {
    mockRequireAuthOrApiKey.mockRejectedValue(new Error("Unauthorized: Authentication required"));
    mockStreamText.mockImplementation(() => ({
      fullStream: (async function* () {
        yield {
          type: "file",
          file: {
            mediaType: "image/png",
            uint8Array: new Uint8Array([1, 2, 3]),
          },
        };
      })(),
      toUIMessageStreamResponse: () => new Response("unused"),
      toTextStreamResponse: () => new Response("unused"),
    }));

    const response = await generateImage(
      jsonRequest("http://localhost:3000/api/v1/generate-image", "POST", {
        prompt: "A bright skyline",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.numImages).toBe(1);
    expect(body.images[0].url).toBe("https://blob.example/image.png");
    expect(body.images[0].image).toBeUndefined();
  });

  test("generate-image returns 402 when credits are insufficient", async () => {
    mockCreditsReserve.mockRejectedValue(new MockInsufficientCreditsError(2));

    const response = await generateImage(
      jsonRequest("http://localhost:3000/api/v1/generate-image", "POST", {
        prompt: "Need a hero image",
      }),
    );

    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toContain("Insufficient credits");
  });

  test("generate-video requires a configured Fal key", async () => {
    delete process.env.FAL_KEY;

    const response = await generateVideo(
      jsonRequest("http://localhost:3000/api/v1/generate-video", "POST", {
        prompt: "Orbiting satellite",
      }),
    );

    expect(response.status).toBe(503);
  });

  test("generate-video returns auth failures as 401", async () => {
    mockRequireAuthOrApiKeyWithOrg.mockRejectedValue(
      new Error("Unauthorized: Authentication required"),
    );

    const response = await generateVideo(
      jsonRequest("http://localhost:3000/api/v1/generate-video", "POST", {
        prompt: "Orbiting satellite",
      }),
    );

    expect(response.status).toBe(401);
  });

  test("generate-video uploads successful outputs and reconciles reserved credits", async () => {
    const reservation = reservationFactory();
    mockCreditsReserve.mockResolvedValue(reservation);

    const response = await generateVideo(
      jsonRequest("http://localhost:3000/api/v1/generate-video", "POST", {
        prompt: "Orbiting satellite",
        model: "fal-ai/veo3",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.video.url).toBe("https://blob.example/video.mp4");
    expect(reservation.reconcile).toHaveBeenCalledWith(5);
  });
});

describe("Chat API", () => {
  test("rejects invalid chat message roles", async () => {
    const response = await chat(
      jsonRequest("http://localhost:3000/api/v1/chat", "POST", {
        messages: [{ role: "hacker", content: "hi" }],
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid message role");
  });

  test("blocks users flagged by moderation", async () => {
    mockShouldBlockUser.mockResolvedValue(true);

    const response = await chat(
      jsonRequest("http://localhost:3000/api/v1/chat", "POST", {
        messages: [{ role: "user", content: "hello" }],
      }),
    );

    expect(response.status).toBe(403);
  });

  test("enforces anonymous limits", async () => {
    mockRequireAuthOrApiKey.mockRejectedValue(new Error("Unauthorized: Authentication required"));
    mockCheckAnonymousLimit.mockResolvedValue({
      allowed: false,
      reason: "message_limit",
      limit: 3,
      remaining: 0,
    });

    const response = await chat(
      jsonRequest("http://localhost:3000/api/v1/chat", "POST", {
        messages: [{ role: "user", content: "hello" }],
      }),
    );

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.requiresSignup).toBe(true);
  });

  test("returns 402 when reserved chat credits are unavailable", async () => {
    mockCreditsReserve.mockRejectedValue(new MockInsufficientCreditsError(1));

    const response = await chat(
      jsonRequest("http://localhost:3000/api/v1/chat", "POST", {
        messages: [{ role: "user", content: "hello" }],
      }),
    );

    expect(response.status).toBe(402);
  });

  test("streams responses and persists usage metadata after completion", async () => {
    const reservation = reservationFactory();
    mockCreditsReserve.mockResolvedValue(reservation);

    const response = await chat(
      jsonRequest("http://localhost:3000/api/v1/chat", "POST", {
        messages: [
          {
            role: "user",
            content: "hello",
            metadata: { conversationId: "conv-1" },
          },
        ],
        id: "gpt-4o-mini",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ui-stream");

    await lastOnFinishPromise;

    expect(reservation.reconcile).toHaveBeenCalledWith(0.3);
    expect(mockUsageCreate).toHaveBeenCalled();
    expect(mockGenerationsCreate).toHaveBeenCalled();
    expect(mockAddMessageWithSequence).toHaveBeenCalledTimes(2);
  });
});
