
/**
 * Tests for SIWE Nonce Endpoint
 *
 * Covers:
 * - Nonce issuance with valid/invalid chainId
 * - TTL enforcement (nonce stored with correct TTL)
 * - Redis unavailability (503 when cache is down)
 * - Nonce persistence verification (write-then-read check)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route
const mockCacheSet = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheIsAvailable = vi.fn().mockReturnValue(true);

vi.mock("@/lib/cache/client", () => ({
  cache: {
    set: (...args: unknown[]) => mockCacheSet(...args),
    get: (...args: unknown[]) => mockCacheGet(...args),
    isAvailable: () => mockCacheIsAvailable(),
  },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: {
      nonce: (n: string) => `siwe:nonce:${n}`,
    },
  },
  CacheTTL: {
    siwe: {
      nonce: 300,
    },
  },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("viem/siwe", () => ({
  generateSiweNonce: () => "test-nonce-abc123",
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

// Dynamic import to apply mocks
const { GET } = await import("../../nonce/route");

function createRequest(queryParams: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:3000/api/auth/siwe/nonce");
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString(), { method: "GET" }) as unknown as Request;
}

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheGet.mockResolvedValue(true);
  });

  it("returns a nonce with default chainId 1", async () => {
    const req = createRequest();
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nonce).toBe("test-nonce-abc123");
    expect(body.chainId).toBe(1);
    expect(body.domain).toBe("app.example.com");
    expect(body.uri).toBe("https://app.example.com");
    expect(body.version).toBe("1");
  });

  it("accepts a custom chainId", async () => {
    const req = createRequest({ chainId: "137" });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.chainId).toBe(137);
  });

  it("rejects invalid chainId", async () => {
    const req = createRequest({ chainId: "abc" });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_BODY");
  });

  it("rejects negative chainId", async () => {
    const req = createRequest({ chainId: "-1" });
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it("stores nonce with correct TTL", async () => {
    const req = createRequest();
    await GET(req);

    expect(mockCacheSet).toHaveBeenCalledWith(
      "siwe:nonce:test-nonce-abc123",
      true,
      300,
    );
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);

    const req = createRequest();
    const res = await GET(req);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce persistence verification fails", async () => {
    mockCacheGet.mockResolvedValue(null);

    const req = createRequest();
    const res = await GET(req);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when cache.set throws", async () => {
    mockCacheSet.mockRejectedValue(new Error("Redis connection refused"));

    const req = createRequest();
    const res = await GET(req);

    expect(res.status).toBe(503);
  });
});
