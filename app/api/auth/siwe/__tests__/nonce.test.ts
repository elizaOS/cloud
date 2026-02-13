
/**
 * Tests for SIWE nonce endpoint
 *
 * Covers: nonce issuance, TTL behavior, cache availability checks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the handler
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
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
}));

vi.mock("viem/siwe", () => ({
  generateSiweNonce: () => "testnonce123",
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://elizacloud.ai",
}));

// Dynamic import after mocks are set up
const { GET } = await import("../../nonce/route");

function makeRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/auth/siwe/nonce");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url.toString()) as unknown as import("next/server").NextRequest & { nextUrl: URL };
}

// Patch nextUrl onto Request for NextRequest compatibility
function createNextRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/auth/siwe/nonce");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const req = new Request(url.toString());
  (req as any).nextUrl = url;
  return req as any;
}

describe("SIWE nonce endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheGet.mockResolvedValue(true);
  });

  it("returns a nonce with domain and uri", async () => {
    const req = createNextRequest();
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.nonce).toBe("testnonce123");
    expect(data.domain).toBe("elizacloud.ai");
    expect(data.uri).toBe("https://elizacloud.ai");
    expect(data.version).toBe("1");
    expect(data.chainId).toBe(1);
  });

  it("accepts a custom chainId", async () => {
    const req = createNextRequest({ chainId: "137" });
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.chainId).toBe(137);
  });

  it("rejects invalid chainId", async () => {
    const req = createNextRequest({ chainId: "abc" });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("INVALID_BODY");
  });

  it("rejects negative chainId", async () => {
    const req = createNextRequest({ chainId: "-1" });
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const req = createNextRequest();
    const res = await GET(req);

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce write fails (cache.set throws)", async () => {
    mockCacheSet.mockRejectedValue(new Error("Redis connection lost"));
    const req = createNextRequest();
    const res = await GET(req);

    expect(res.status).toBe(503);
  });

  it("returns 503 when nonce is not persisted after set (silent failure)", async () => {
    mockCacheGet.mockResolvedValue(null);
    const req = createNextRequest();
    const res = await GET(req);

    expect(res.status).toBe(503);
  });

  it("stores nonce with correct TTL", async () => {
    const req = createNextRequest();
    await GET(req);

    expect(mockCacheSet).toHaveBeenCalledWith(
      "siwe:nonce:testnonce123",
      true,
      300,
    );
  });

  it("verifies nonce persistence via read-back", async () => {
    const req = createNextRequest();
    await GET(req);

    expect(mockCacheGet).toHaveBeenCalledWith("siwe:nonce:testnonce123");
  });
});
