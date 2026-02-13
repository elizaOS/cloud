
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
const mockCacheSet = vi.fn();
const mockCacheGet = vi.fn();
const mockCacheIsAvailable = vi.fn(() => true);
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
  generateSiweNonce: () => "mock-nonce-abc123",
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

describe("SIWE nonce endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheGet.mockResolvedValue(true);
  });

  it("returns nonce with domain and uri", async () => {
    const { GET } = await import("../../nonce/route");
    const req = new Request("http://localhost/api/auth/siwe/nonce");
    const res = await (GET as Function)(req);
    const json = await res.json();

    expect(json.nonce).toBe("mock-nonce-abc123");
    expect(json.domain).toBe("app.example.com");
    expect(json.uri).toBe("https://app.example.com");
    expect(json.chainId).toBe(1);
    expect(json.version).toBe("1");
  });

  it("stores nonce in cache with TTL", async () => {
    const { GET } = await import("../../nonce/route");
    const req = new Request("http://localhost/api/auth/siwe/nonce");
    await (GET as Function)(req);

    expect(mockCacheSet).toHaveBeenCalledWith(
      "siwe:nonce:mock-nonce-abc123",
      true,
      300,
    );
  });

  it("returns 503 when Redis is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const { GET } = await import("../../nonce/route");
    const req = new Request("http://localhost/api/auth/siwe/nonce");
    const res = await (GET as Function)(req);

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce fails to persist", async () => {
    mockCacheGet.mockResolvedValue(null);
    const { GET } = await import("../../nonce/route");
    const req = new Request("http://localhost/api/auth/siwe/nonce");
    const res = await (GET as Function)(req);

    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid chainId", async () => {
    const { GET } = await import("../../nonce/route");
    const req = new Request("http://localhost/api/auth/siwe/nonce?chainId=-1");
    const res = await (GET as Function)(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("accepts custom chainId", async () => {
    const { GET } = await import("../../nonce/route");
    const req = new Request("http://localhost/api/auth/siwe/nonce?chainId=137");
    const res = await (GET as Function)(req);
    const json = await res.json();

    expect(json.chainId).toBe(137);
  });
});
