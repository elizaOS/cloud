import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { AuthenticationError } from "@/lib/api/errors";

const mockRequireAuth = mock();
const mockRequireAuthWithOrg = mock();
const mockRequireAuthOrApiKey = mock();
const mockRequireAuthOrApiKeyWithOrg = mock();
const mockReserve = mock();
const mockReconcile = mock();
const mockUsageCreate = mock();
const mockCacheGet = mock();
const mockCacheSet = mock();
const mockLoggerError = mock();
const mockLoggerWarn = mock();
const mockLoggerInfo = mock();
const mockLoggerDebug = mock();

mock.module("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
  requireAuthWithOrg: mockRequireAuthWithOrg,
  requireAuthOrApiKey: mockRequireAuthOrApiKey,
  requireAuthOrApiKeyWithOrg: mockRequireAuthOrApiKeyWithOrg,
}));

class MockInsufficientCreditsError extends Error {
  required: number;
  available: number;

  constructor(required = 0, available = 0) {
    super("Insufficient credits");
    this.name = "InsufficientCreditsError";
    this.required = required;
    this.available = available;
  }
}

mock.module("@/lib/services/credits", () => ({
  creditsService: {
    reserve: mockReserve,
  },
  InsufficientCreditsError: MockInsufficientCreditsError,
}));

mock.module("@/lib/services/usage", () => ({
  usageService: {
    create: mockUsageCreate,
  },
}));

mock.module("@/lib/cache/client", () => ({
  cache: {
    get: mockCacheGet,
    set: mockCacheSet,
  },
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    error: mockLoggerError,
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    debug: mockLoggerDebug,
  },
}));

mock.module("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: (request: NextRequest) => Promise<Response>) =>
    handler,
}));

import { createHandler } from "@/lib/services/proxy/engine";

describe("proxy engine", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
    mockRequireAuthWithOrg.mockReset();
    mockRequireAuthOrApiKey.mockReset();
    mockRequireAuthOrApiKeyWithOrg.mockReset();
    mockReserve.mockReset();
    mockReconcile.mockReset();
    mockUsageCreate.mockReset();
    mockCacheGet.mockReset();
    mockCacheSet.mockReset();
    mockLoggerError.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerDebug.mockReset();

    mockRequireAuth.mockResolvedValue({
      id: "user-1",
      organization_id: "org-1",
    });
    mockRequireAuthWithOrg.mockResolvedValue({
      id: "user-1",
      organization_id: "org-1",
    });
    mockRequireAuthOrApiKey.mockResolvedValue({
      user: { id: "user-1", organization_id: "org-1" },
      apiKey: { id: "api-key-1" },
    });
    mockRequireAuthOrApiKeyWithOrg.mockResolvedValue({
      user: { id: "user-1", organization_id: "org-1" },
      apiKey: { id: "api-key-1" },
    });
    mockReconcile.mockResolvedValue(undefined);
    mockReserve.mockResolvedValue({
      reservedAmount: 1,
      reconcile: mockReconcile,
    });
    mockUsageCreate.mockResolvedValue(undefined);
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  test("returns 400 for malformed JSON bodies", async () => {
    const work = mock(async () => ({
      response: new Response("ok"),
    }));

    const handler = createHandler(
      {
        id: "svc",
        name: "Service",
        auth: "apiKeyWithOrg",
        getCost: async () => 1,
      } as const,
      work,
    );

    const response = await handler(
      new NextRequest("https://example.com/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
    expect(work).not.toHaveBeenCalled();
    expect(mockReserve).not.toHaveBeenCalled();
  });

  test("returns cache metadata headers on cache hits", async () => {
    mockCacheGet.mockResolvedValue({
      body: JSON.stringify({ ok: true }),
      status: 200,
      headers: { "content-type": "application/json" },
      cachedAt: Date.now(),
      ttl: 30,
    });
    mockReserve.mockResolvedValue({
      reservedAmount: 2,
      reconcile: mockReconcile,
    });

    const work = mock(async () => ({
      response: new Response("unused"),
    }));

    const handler = createHandler(
      {
        id: "svc",
        name: "Service",
        auth: "apiKeyWithOrg",
        cache: {
          maxTTL: 60,
          hitCostMultiplier: 0.5,
        },
        getCost: async () => 2,
      } as const,
      work,
    );

    const response = await handler(
      new NextRequest("https://example.com/api/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "max-age=30",
        },
        body: JSON.stringify({ method: "getPrice" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Cache")).toBe("HIT");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30");
    expect(work).not.toHaveBeenCalled();
    expect(mockReconcile).toHaveBeenCalledWith(1);
    expect(mockUsageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "svc",
        provider: "svc",
        input_cost: "1",
        output_cost: "0",
        markup: "0",
        metadata: expect.objectContaining({
          cached: true,
          method: "getPrice",
        }),
      }),
    );
  });

  test("maps auth failures to 401 responses", async () => {
    mockRequireAuthOrApiKeyWithOrg.mockRejectedValue(
      new AuthenticationError(),
    );

    const handler = createHandler(
      {
        id: "svc",
        name: "Service",
        auth: "apiKeyWithOrg",
        getCost: async () => 1,
      } as const,
      mock(async () => ({
        response: new Response("ok"),
      })),
    );

    const response = await handler(
      new NextRequest("https://example.com/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "getPrice" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required" });
    expect(mockReserve).not.toHaveBeenCalled();
  });
});
