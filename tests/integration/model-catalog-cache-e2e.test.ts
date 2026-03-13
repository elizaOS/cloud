import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { NextRequest } from "next/server";
import { cache } from "@/lib/cache/client";
import { logger } from "@/lib/utils/logger";
import { jsonRequest } from "../unit/api/route-test-helpers";

const mockRequireAuthOrApiKey = mock();
const mockRequireAuthOrApiKeyWithOrg = mock();
const mockGetAnonymousUser = mock();
const mockGetOrCreateAnonymousUser = mock();
const mockProviderListModels = mock();
const mockProviderGetModel = mock();
const mockCacheGetWithSWR = mock();
const mockCacheSet = mock();
const mockCacheIsAvailable = mock();
const originalCacheGetWithSWR = cache.getWithSWR.bind(cache);
const originalCacheSet = cache.set.bind(cache);
const originalCacheIsAvailable = cache.isAvailable.bind(cache);
const originalLoggerInfo = logger.info;
const originalLoggerWarn = logger.warn;
const originalLoggerError = logger.error;
const originalLoggerDebug = logger.debug;

type CachedEntry<T> = {
  data: T;
  cachedAt: number;
  staleAt: number;
};

const cacheStore = new Map<string, unknown>();

let gatewayCatalog = [
  {
    id: "openai/gpt-5",
    object: "model" as const,
    created: 0,
    owned_by: "openai",
    type: "language",
    name: "GPT-5",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    object: "model" as const,
    created: 0,
    owned_by: "anthropic",
    type: "language",
    name: "Claude Sonnet 4.6",
  },
];

function buildCachedEntry<T>(value: T, staleTTL: number): CachedEntry<T> {
  const cachedAt = Date.now();

  return {
    data: value,
    cachedAt,
    staleAt: cachedAt + staleTTL * 1000,
  };
}

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKey: mockRequireAuthOrApiKey,
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
  invalidatePrivyTokenCache: async () => { },
  invalidateAllPrivyTokenCaches: async () => { },
  verifyAuthTokenCached: async () => null,
  getPrivyClient: () => {
    throw new Error("Privy client not available in model catalog cache test");
  },
}));

mock.module("@/lib/auth-anonymous", () => ({
  getAnonymousUser: mockGetAnonymousUser,
  getOrCreateAnonymousUser: mockGetOrCreateAnonymousUser,
}));

mock.module("@/lib/providers", () => ({
  getProvider: () => ({
    listModels: mockProviderListModels,
    getModel: mockProviderGetModel,
  }),
  hasGroqProviderConfigured: () => false,
}));

import { GET as getModels } from "@/app/api/v1/models/route";
import { POST as getModelStatus } from "@/app/api/v1/models/status/route";
import { GET as getModelDetail } from "@/app/api/v1/models/[...model]/route";
import { GET as refreshModelCatalog } from "@/app/api/v1/cron/refresh-model-catalog/route";

describe("Model catalog cache E2E", () => {
  beforeEach(() => {
    cacheStore.clear();
    gatewayCatalog = [
      {
        id: "openai/gpt-5",
        object: "model",
        created: 0,
        owned_by: "openai",
        type: "language",
        name: "GPT-5",
      },
      {
        id: "anthropic/claude-sonnet-4.6",
        object: "model",
        created: 0,
        owned_by: "anthropic",
        type: "language",
        name: "Claude Sonnet 4.6",
      },
    ];

    mockRequireAuthOrApiKey.mockReset();
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockGetAnonymousUser.mockReset();
    mockGetOrCreateAnonymousUser.mockReset();
    mockProviderListModels.mockReset();
    mockProviderGetModel.mockReset();
    mockCacheGetWithSWR.mockReset();
    mockCacheSet.mockReset();
    mockCacheIsAvailable.mockReset();

    cache.getWithSWR = mockCacheGetWithSWR;
    cache.set = mockCacheSet;
    cache.isAvailable = mockCacheIsAvailable;
    logger.info = () => { };
    logger.warn = () => { };
    logger.error = () => { };
    logger.debug = () => { };

    mockRequireAuthOrApiKey.mockResolvedValue({
      user: { id: "user-1", organization_id: "org-1" },
      apiKey: { id: "ak-1" },
    });
    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: { id: "user-1", organization_id: "org-1" },
      apiKey: { id: "ak-1" },
    });
    mockGetAnonymousUser.mockResolvedValue({
      user: { id: "anon-1" },
      session: { id: "session-1" },
    });
    mockGetOrCreateAnonymousUser.mockResolvedValue({
      user: { id: "anon-1" },
      session: { id: "session-1" },
    });
    mockProviderListModels.mockImplementation(async () =>
      Response.json({
        object: "list",
        data: gatewayCatalog,
      }),
    );
    mockProviderGetModel.mockImplementation(async (modelId: string) =>
      Response.json(
        gatewayCatalog.find((model) => model.id === modelId) ?? {
          error: {
            message: `Model '${modelId}' not found`,
          },
        },
        gatewayCatalog.some((model) => model.id === modelId)
          ? undefined
          : { status: 404 },
      ),
    );
    mockCacheGetWithSWR.mockImplementation(
      async <T>(
        key: string,
        staleTTL: number,
        revalidate: () => Promise<T>,
        _ttl?: number,
      ) => {
        if (cacheStore.has(key)) {
          const cached = cacheStore.get(key) as CachedEntry<T> | T;
          if (cached && typeof cached === "object" && "data" in cached) {
            return (cached as CachedEntry<T>).data;
          }
          return cached as T;
        }

        const fresh = await revalidate();
        cacheStore.set(key, buildCachedEntry(fresh, staleTTL));
        return fresh;
      },
    );
    mockCacheSet.mockImplementation(
      async (key: string, value: unknown, _ttl: number) => {
        cacheStore.set(key, value);
      },
    );
    mockCacheIsAvailable.mockReturnValue(true);

    process.env.CRON_SECRET = "model-cache-secret";
  });

  afterAll(() => {
    cache.getWithSWR = originalCacheGetWithSWR;
    cache.set = originalCacheSet;
    cache.isAvailable = originalCacheIsAvailable;
    logger.info = originalLoggerInfo;
    logger.warn = originalLoggerWarn;
    logger.error = originalLoggerError;
    logger.debug = originalLoggerDebug;
    delete process.env.CRON_SECRET;
    mock.restore();
  });

  test("serves repeated /api/v1/models requests from the shared cached catalog", async () => {
    const firstResponse = await getModels(
      new NextRequest("http://localhost:3333/api/v1/models"),
    );
    const secondResponse = await getModels(
      new NextRequest("http://localhost:3333/api/v1/models"),
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(mockProviderListModels).toHaveBeenCalledTimes(1);

    const firstBody = await firstResponse.json();
    const secondBody = await secondResponse.json();

    expect(firstBody.data.map((model: { id: string }) => model.id)).toEqual([
      "openai/gpt-5",
      "anthropic/claude-sonnet-4.6",
    ]);
    expect(secondBody.data).toEqual(firstBody.data);
  });

  test("reuses the warmed catalog across /models, /models/status, and /models/[...model]", async () => {
    await getModels(new NextRequest("http://localhost:3333/api/v1/models"));

    const statusResponse = await getModelStatus(
      jsonRequest("http://localhost:3333/api/v1/models/status", "POST", {
        modelIds: ["openai/gpt-5", "anthropic/claude-sonnet-4.6"],
      }),
    );
    const detailResponse = await getModelDetail(
      new NextRequest("http://localhost:3333/api/v1/models/openai/gpt-5"),
      { params: Promise.resolve({ model: ["openai", "gpt-5"] }) },
    );

    expect(statusResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(mockProviderListModels).toHaveBeenCalledTimes(1);
    expect(mockProviderGetModel).not.toHaveBeenCalled();

    const statusBody = await statusResponse.json();
    const detailBody = await detailResponse.json();

    expect(statusBody.models).toEqual([
      { modelId: "openai/gpt-5", available: true },
      { modelId: "anthropic/claude-sonnet-4.6", available: true },
    ]);
    expect(detailBody.id).toBe("openai/gpt-5");
  });

  test("cron refresh repopulates the cache and updates later route responses", async () => {
    const initialResponse = await getModels(
      new NextRequest("http://localhost:3333/api/v1/models"),
    );
    const initialBody = await initialResponse.json();

    gatewayCatalog = [
      ...gatewayCatalog,
      {
        id: "google/gemini-3.1-pro-preview",
        object: "model",
        created: 0,
        owned_by: "google",
        type: "language",
        name: "Gemini 3.1 Pro Preview",
      },
    ];

    const cronResponse = await refreshModelCatalog(
      new NextRequest("http://localhost:3333/api/v1/cron/refresh-model-catalog", {
        method: "GET",
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      }),
    );
    const refreshedResponse = await getModels(
      new NextRequest("http://localhost:3333/api/v1/models"),
    );

    expect(initialBody.data).toHaveLength(2);
    expect(cronResponse.status).toBe(200);
    expect(mockProviderListModels).toHaveBeenCalledTimes(2);

    const cronBody = await cronResponse.json();
    const refreshedBody = await refreshedResponse.json();

    expect(cronBody.success).toBe(true);
    expect(cronBody.data.modelCount).toBe(3);
    expect(refreshedBody.data.map((model: { id: string }) => model.id)).toEqual(
      [
        "openai/gpt-5",
        "anthropic/claude-sonnet-4.6",
        "google/gemini-3.1-pro-preview",
      ],
    );
  });
});
