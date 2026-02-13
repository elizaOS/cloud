
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
const mockCache = {
  isAvailable: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
};

vi.mock("@/lib/cache/client", () => ({
  cache: mockCache,
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheTTL: { siwe: { nonce: 300 } },
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
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

import { NextRequest } from "next/server";

// Dynamic import so mocks are applied
async function getHandler() {
  const mod = await import("../../nonce/route");
  return mod.GET;
}

function makeRequest(chainId?: string): NextRequest {
  const url = new URL("http://localhost/api/auth/siwe/nonce");
  if (chainId) url.searchParams.set("chainId", chainId);
  return new NextRequest(url);
}

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.isAvailable.mockReturnValue(true);
    mockCache.set.mockResolvedValue(undefined);
    mockCache.get.mockResolvedValue(true);
  });

  it("returns a nonce with default chainId 1", async () => {
    const handler = await getHandler();
    const response = await handler(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.nonce).toBe("mock-nonce-abc123");
    expect(json.chainId).toBe(1);
    expect(json.domain).toBe("app.example.com");
    expect(json.uri).toBe("https://app.example.com");
    expect(json.version).toBe("1");
  });

  it("accepts a valid chainId parameter", async () => {
    const handler = await getHandler();
    const response = await handler(makeRequest("137"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.chainId).toBe(137);
  });

  it("rejects invalid chainId (non-numeric)", async () => {
    const handler = await getHandler();
    const response = await handler(makeRequest("abc"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("INVALID_BODY");
  });

  it("rejects invalid chainId (negative)", async () => {
    const handler = await getHandler();
    const response = await handler(makeRequest("-1"));

    expect(response.status).toBe(400);
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCache.isAvailable.mockReturnValue(false);

    const handler = await getHandler();
    const response = await handler(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce fails to persist", async () => {
    mockCache.get.mockResolvedValue(null);

    const handler = await getHandler();
    const response = await handler(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when cache.set throws", async () => {
    mockCache.set.mockRejectedValue(new Error("Redis connection lost"));

    const handler = await getHandler();
    const response = await handler(makeRequest());

    expect(response.status).toBe(503);
  });

  it("stores nonce with correct TTL", async () => {
    const handler = await getHandler();
    await handler(makeRequest());

    expect(mockCache.set).toHaveBeenCalledWith(
      "siwe:nonce:mock-nonce-abc123",
      true,
      300,
    );
  });

  it("verifies nonce persistence after set", async () => {
    const handler = await getHandler();
    await handler(makeRequest());

    expect(mockCache.get).toHaveBeenCalledWith("siwe:nonce:mock-nonce-abc123");
  });
});
