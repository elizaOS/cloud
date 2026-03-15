import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockGenerateText = mock();
const mockGetConnectedPlatforms = mock();
const mockInitiateAuth = mock();
const mockCacheGet = mock();
const mockCacheSet = mock();
const mockCacheDel = mock();

const cacheStore = new Map<string, unknown>();

mock.module("ai", () => ({
  generateText: mockGenerateText,
}));

mock.module("@ai-sdk/gateway", () => ({
  gateway: {
    languageModel: (model: string) => `gateway:${model}`,
  },
}));

mock.module("@/lib/services/oauth", () => ({
  oauthService: {
    getConnectedPlatforms: mockGetConnectedPlatforms,
    initiateAuth: mockInitiateAuth,
  },
}));

mock.module("@/lib/cache/client", () => ({
  cache: {
    get: mockCacheGet,
    set: mockCacheSet,
    del: mockCacheDel,
    delPattern: mock(),
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

import {
  connectionEnforcementService,
  detectProviderFromMessage,
} from "@/lib/services/eliza-app/connection-enforcement";

afterEach(() => {
  mock.restore();
});

beforeEach(() => {
  cacheStore.clear();
  process.env.NEXT_PUBLIC_APP_URL = "https://cloud.milady.ai";

  mockGenerateText.mockReset();
  mockGetConnectedPlatforms.mockReset();
  mockInitiateAuth.mockReset();
  mockCacheGet.mockReset();
  mockCacheSet.mockReset();
  mockCacheDel.mockReset();

  mockCacheGet.mockImplementation(async (key: string) =>
    cacheStore.has(key) ? cacheStore.get(key) : null,
  );
  mockCacheSet.mockImplementation(async (key: string, value: unknown) => {
    cacheStore.set(key, value);
  });
  mockCacheDel.mockImplementation(async (key: string) => {
    cacheStore.delete(key);
  });

  mockGenerateText.mockResolvedValue({ text: "connect google." });
});

describe("connection enforcement", () => {
  test("does not false-positive on the single-letter x alias", () => {
    expect(detectProviderFromMessage("can you explain this?")).toBeNull();
    expect(detectProviderFromMessage("i want to fix this")).toBeNull();
    expect(detectProviderFromMessage("connect x")).toBe("twitter");
  });

  test("caches required connection checks and invalidates them after OAuth", async () => {
    mockGetConnectedPlatforms.mockResolvedValueOnce(["google"]).mockResolvedValueOnce([]);

    await expect(connectionEnforcementService.hasRequiredConnection("org-1")).resolves.toBe(true);
    await expect(connectionEnforcementService.hasRequiredConnection("org-1")).resolves.toBe(true);

    expect(mockGetConnectedPlatforms).toHaveBeenCalledTimes(1);

    await connectionEnforcementService.invalidateRequiredConnectionCache("org-1");

    await expect(connectionEnforcementService.hasRequiredConnection("org-1")).resolves.toBe(false);
    expect(mockGetConnectedPlatforms).toHaveBeenCalledTimes(2);
  });

  test("appends a provider-specific OAuth link for telegram nudges", async () => {
    mockInitiateAuth.mockResolvedValue({
      authUrl: "https://cloud.milady.ai/oauth/google",
    });

    const response = await connectionEnforcementService.generateNudgeResponse({
      userMessage: "i use google",
      platform: "telegram",
      organizationId: "org-1",
      userId: "user-1",
    });

    expect(response).toContain("connect google.");
    expect(response).toContain("[Connect Google](https://cloud.milady.ai/oauth/google)");
    expect(mockInitiateAuth).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      platform: "google",
      redirectUrl:
        "https://cloud.milady.ai/api/eliza-app/auth/connection-success?platform=telegram",
    });
  });

  test("appends all required provider links on a generic nudge turn", async () => {
    mockInitiateAuth.mockImplementation(async ({ platform }: { platform: string }) => ({
      authUrl: `https://cloud.milady.ai/oauth/${platform}`,
    }));

    const response = await connectionEnforcementService.generateNudgeResponse({
      userMessage: "hey there",
      platform: "discord",
      organizationId: "org-2",
      userId: "user-2",
    });

    expect(response).toContain("connect google.");
    expect(response).toContain("Google: https://cloud.milady.ai/oauth/google");
    expect(response).toContain("Microsoft: https://cloud.milady.ai/oauth/microsoft");
    expect(response).toContain("X: https://cloud.milady.ai/oauth/twitter");
  });

  test("stores conversation history without persisting OAuth URLs", async () => {
    mockInitiateAuth.mockResolvedValue({
      authUrl: "https://cloud.milady.ai/oauth/google",
    });

    await connectionEnforcementService.generateNudgeResponse({
      userMessage: "google works",
      platform: "telegram",
      organizationId: "org-3",
      userId: "user-3",
    });

    const storedConversation = Array.from(cacheStore.entries()).find(([key]) =>
      key.includes("connection-enforcement:conversation:org-3"),
    )?.[1] as
      | {
          messages: Array<{ role: "user" | "assistant"; content: string }>;
        }
      | undefined;

    expect(storedConversation).toBeDefined();
    expect(storedConversation?.messages.at(-1)?.content).toBe("connect google.");
  });

  test("falls back to the Milady Cloud production URL when app URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    mockInitiateAuth.mockResolvedValue({
      authUrl: "https://cloud.milady.ai/oauth/google",
    });

    await connectionEnforcementService.generateNudgeResponse({
      userMessage: "i use google",
      platform: "telegram",
      organizationId: "org-4",
      userId: "user-4",
    });

    expect(mockInitiateAuth).toHaveBeenCalledWith({
      organizationId: "org-4",
      userId: "user-4",
      platform: "google",
      redirectUrl:
        "https://cloud.milady.ai/api/eliza-app/auth/connection-success?platform=telegram",
    });
  });
});
