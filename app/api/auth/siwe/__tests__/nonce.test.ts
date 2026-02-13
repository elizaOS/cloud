
/**
 * Tests for SIWE nonce endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the handler
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

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

vi.mock("viem/siwe", () => ({
  generateSiweNonce: () => "testnonce123",
}));

// Dynamic import after mocks
const { GET } = await import("../../nonce/route");

function makeRequest(params?: Record<string, string>) {
  const url = new URL("https://app.example.com/api/auth/siwe/nonce");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url.toString()) as any;
}

describe("SIWE nonce endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheGet.mockResolvedValue(true);
  });

  it("returns a nonce with domain and uri", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.nonce).toBe("testnonce123");
    expect(json.domain).toBe("app.example.com");
    expect(json.uri).toBe("https://app.example.com");
    expect(json.version).toBe("1");
  });

  it("stores nonce in cache with TTL", async () => {
    await GET(makeRequest());
    expect(mockCacheSet).toHaveBeenCalledWith(
      "siwe:nonce:testnonce123",
      true,
      300,
    );
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce fails to persist", async () => {
    mockCacheGet.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid chainId", async () => {
    const res = await GET(makeRequest({ chainId: "abc" }));
    expect(res.status).toBe(400);
  });

  it("defaults chainId to 1", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.chainId).toBe(1);
  });

  it("accepts a custom chainId", async () => {
    const res = await GET(makeRequest({ chainId: "137" }));
    const json = await res.json();
    expect(json.chainId).toBe(137);
  });
});
