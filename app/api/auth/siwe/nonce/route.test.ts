
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
const mockCacheSet = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheIsAvailable = vi.fn();

vi.mock("@/lib/cache/client", () => ({
  cache: {
    set: (...args: unknown[]) => mockCacheSet(...args),
    get: (...args: unknown[]) => mockCacheGet(...args),
    isAvailable: () => mockCacheIsAvailable(),
  },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheTTL: { siwe: { nonce: 300 } },
  CacheKeys: {
    siwe: { nonce: (n: string) => `siwe:nonce:${n}` },
  },
}));

vi.mock("viem/siwe", () => ({
  generateSiweNonce: () => "mock-nonce-abc123",
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/siwe/nonce");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url);
}

describe("SIWE nonce endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheGet.mockResolvedValue(true);
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  });

  it("returns a nonce with expected fields", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      nonce: "mock-nonce-abc123",
      domain: "app.example.com",
      uri: "https://app.example.com",
      chainId: 1,
      version: "1",
    });
  });

  it("stores nonce in cache with TTL", async () => {
    await GET(makeRequest());
    expect(mockCacheSet).toHaveBeenCalledWith(
      "siwe:nonce:mock-nonce-abc123",
      true,
      300,
    );
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce fails to persist", async () => {
    mockCacheGet.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when cache.set throws", async () => {
    mockCacheSet.mockRejectedValue(new Error("Redis down"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
  });

  it("accepts custom chainId", async () => {
    const res = await GET(makeRequest({ chainId: "137" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chainId).toBe(137);
  });

  it("rejects invalid chainId", async () => {
    const res = await GET(makeRequest({ chainId: "-1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_BODY");
  });

  it("rejects non-numeric chainId", async () => {
    const res = await GET(makeRequest({ chainId: "abc" }));
    expect(res.status).toBe(400);
  });

  it("falls back to VERCEL_URL when NEXT_PUBLIC_APP_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = "my-app.vercel.app";
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.domain).toBe("my-app.vercel.app");
    expect(body.uri).toBe("https://my-app.vercel.app");
    delete process.env.VERCEL_URL;
  });

  it("falls back to localhost when no env vars set", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.domain).toBe("localhost");
  });
});
