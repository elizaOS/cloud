
/**
 * Tests for SIWE nonce endpoint.
 *
 * Covers nonce generation, Redis availability, chainId validation,
 * and persistence verification.
 */

import { NextRequest } from "next/server";

// --- Mocks ---

const mockCacheIsAvailable = jest.fn().mockReturnValue(true);
const mockCacheSet = jest.fn();
const mockCacheGet = jest.fn().mockResolvedValue(true);

jest.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: mockCacheIsAvailable,
    set: mockCacheSet,
    get: mockCacheGet,
  },
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheTTL: { siwe: { nonce: 300 } },
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
}));

jest.mock("viem/siwe", () => ({
  generateSiweNonce: () => "testnonce123456",
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// --- Helpers ---

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("https://app.example.com/api/auth/siwe/nonce");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

// --- Tests ---

describe("SIWE nonce endpoint", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("../nonce/route");
    GET = mod.GET as unknown as (req: NextRequest) => Promise<Response>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheGet.mockResolvedValue(true);
  });

  test("returns nonce and SIWE parameters", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      nonce: "testnonce123456",
      domain: "app.example.com",
      uri: "https://app.example.com",
      chainId: 1,
      version: "1",
      statement: "Sign in to ElizaCloud",
    });
  });

  test("persists nonce to cache", async () => {
    await GET(makeRequest());
    expect(mockCacheSet).toHaveBeenCalledWith(
      "siwe:nonce:testnonce123456",
      true,
      300,
    );
  });

  test("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  test("returns 503 when nonce persistence verification fails", async () => {
    mockCacheGet.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  test("accepts valid chainId parameter", async () => {
    const res = await GET(makeRequest({ chainId: "137" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.chainId).toBe(137);
  });

  test("defaults to chainId 1 when not specified", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.chainId).toBe(1);
  });

  test("rejects non-integer chainId", async () => {
    const res = await GET(makeRequest({ chainId: "1.5" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  test("rejects negative chainId", async () => {
    const res = await GET(makeRequest({ chainId: "-1" }));
    expect(res.status).toBe(400);
  });

  test("rejects non-numeric chainId", async () => {
    const res = await GET(makeRequest({ chainId: "abc" }));
    expect(res.status).toBe(400);
  });
});
