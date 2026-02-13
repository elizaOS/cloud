
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module under test
const mockCache = {
  isAvailable: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
};
vi.mock("@/lib/cache/client", () => ({ cache: mockCache }));
vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
  CacheTTL: { siwe: { nonce: 300 } },
}));
vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));
vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));
vi.mock("viem/siwe", () => ({
  generateSiweNonce: () => "mock-nonce-abc123",
}));

import { GET } from "../../nonce/route";
import { NextRequest } from "next/server";

function makeRequest(url = "http://localhost/api/auth/siwe/nonce") {
  return new NextRequest(new URL(url));
}

describe("SIWE nonce endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCache.isAvailable.mockReturnValue(false);
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns nonce with domain info when cache is available", async () => {
    mockCache.isAvailable.mockReturnValue(true);
    mockCache.set.mockResolvedValue(undefined);
    mockCache.get.mockResolvedValue(true);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nonce).toBe("mock-nonce-abc123");
    expect(body.domain).toBe("app.example.com");
    expect(body.uri).toBe("https://app.example.com");
    expect(body.version).toBe("1");
  });

  it("returns 503 when nonce fails to persist", async () => {
    mockCache.isAvailable.mockReturnValue(true);
    mockCache.set.mockResolvedValue(undefined);
    mockCache.get.mockResolvedValue(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when cache.set throws", async () => {
    mockCache.isAvailable.mockReturnValue(true);
    mockCache.set.mockRejectedValue(new Error("Redis connection refused"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
  });

  it("validates chainId parameter", async () => {
    const res = await GET(
      makeRequest("http://localhost/api/auth/siwe/nonce?chainId=-1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_BODY");
  });

  it("accepts valid chainId", async () => {
    mockCache.isAvailable.mockReturnValue(true);
    mockCache.set.mockResolvedValue(undefined);
    mockCache.get.mockResolvedValue(true);

    const res = await GET(
      makeRequest("http://localhost/api/auth/siwe/nonce?chainId=137"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chainId).toBe(137);
  });

  it("defaults chainId to 1 (Ethereum mainnet)", async () => {
    mockCache.isAvailable.mockReturnValue(true);
    mockCache.set.mockResolvedValue(undefined);
    mockCache.get.mockResolvedValue(true);

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.chainId).toBe(1);
  });
});
