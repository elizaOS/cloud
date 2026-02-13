
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the handler
const mockCacheSet = vi.fn();
const mockCacheIsAvailable = vi.fn().mockReturnValue(true);

vi.mock("@/lib/cache/client", () => ({
  cache: {
    set: mockCacheSet,
    isAvailable: mockCacheIsAvailable,
  },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: {
      nonce: (n: string) => `siwe:nonce:${n}`,
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

// Dynamically import after mocks are set up
const importHandler = async () => {
  const mod = await import("../../siwe/nonce/route");
  return mod.GET ?? mod.POST;
};

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns a nonce string and domain", async () => {
    const handler = await importHandler();
    const response = await handler(new Request("https://app.example.com/api/auth/siwe/nonce"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("nonce");
    expect(typeof data.nonce).toBe("string");
    expect(data.nonce.length).toBeGreaterThan(0);
    expect(data).toHaveProperty("domain", "app.example.com");
  });

  it("stores nonce in cache with a TTL", async () => {
    const handler = await importHandler();
    await handler(new Request("https://app.example.com/api/auth/siwe/nonce"));

    expect(mockCacheSet).toHaveBeenCalledTimes(1);
    const [key, value, options] = mockCacheSet.mock.calls[0];
    expect(key).toMatch(/^siwe:nonce:/);
    expect(value).toBe("1");
    // TTL should be set (ex or ttl property)
    expect(options).toBeDefined();
    if (options.ex) {
      expect(options.ex).toBeGreaterThan(0);
      expect(options.ex).toBeLessThanOrEqual(600); // max 10 minutes
    } else if (options.ttl) {
      expect(options.ttl).toBeGreaterThan(0);
    }
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const handler = await importHandler();
    const response = await handler(new Request("https://app.example.com/api/auth/siwe/nonce"));

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns unique nonces on successive calls", async () => {
    const handler = await importHandler();
    const res1 = await handler(new Request("https://app.example.com/api/auth/siwe/nonce"));
    const res2 = await handler(new Request("https://app.example.com/api/auth/siwe/nonce"));
    const data1 = await res1.json();
    const data2 = await res2.json();

    expect(data1.nonce).not.toBe(data2.nonce);
  });
});
