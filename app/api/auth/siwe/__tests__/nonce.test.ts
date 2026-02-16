
/**
 * Tests for SIWE nonce endpoint
 */

import { NextRequest } from "next/server";

const mockCacheIsAvailable = jest.fn().mockReturnValue(true);
const mockCacheSet = jest.fn();
const mockCacheGet = jest.fn();

jest.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: mockCacheIsAvailable,
    set: mockCacheSet,
    get: mockCacheGet,
  },
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
  CacheTTL: { siwe: { nonce: 300 } },
}));

jest.mock("viem/siwe", () => ({
  generateSiweNonce: () => "test-nonce-abc123",
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("https://app.example.com/api/auth/siwe/nonce");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url);
}

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheGet.mockResolvedValue(true);
  });

  it("returns nonce and SIWE parameters", async () => {
    const { GET } = await import("../nonce/route");
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.nonce).toBe("test-nonce-abc123");
    expect(json.domain).toBe("app.example.com");
    expect(json.uri).toBe("https://app.example.com");
    expect(json.version).toBe("1");
    expect(json.chainId).toBe(1);
  });

  it("accepts custom chainId", async () => {
    const { GET } = await import("../nonce/route");
    const res = await GET(makeRequest({ chainId: "137" }));
    const json = await res.json();
    expect(json.chainId).toBe(137);
  });

  it("rejects non-integer chainId", async () => {
    const { GET } = await import("../nonce/route");
    const res = await GET(makeRequest({ chainId: "abc" }));
    expect(res.status).toBe(400);
  });

  it("rejects negative chainId", async () => {
    const { GET } = await import("../nonce/route");
    const res = await GET(makeRequest({ chainId: "-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const { GET } = await import("../nonce/route");
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce fails to persist", async () => {
    mockCacheGet.mockResolvedValue(null);
    const { GET } = await import("../nonce/route");
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("stores nonce in cache with TTL", async () => {
    const { GET } = await import("../nonce/route");
    await GET(makeRequest());
    expect(mockCacheSet).toHaveBeenCalledWith(
      "siwe:nonce:test-nonce-abc123",
      true,
      300,
    );
  });
});
