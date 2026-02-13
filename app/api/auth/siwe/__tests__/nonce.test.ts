
/**
 * Tests for SIWE nonce issuance endpoint
 */
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

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

// Dynamic import after mocks are set up
const importHandler = async () => {
  const mod = await import("../../nonce/route");
  return mod;
};

describe("SIWE nonce endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it("returns a nonce string and domain on success", async () => {
    const mod = await importHandler();
    const request = new Request("https://app.example.com/api/auth/siwe/nonce", {
      method: "GET",
    });

    const response = await mod.GET(request as any);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toHaveProperty("nonce");
    expect(typeof json.nonce).toBe("string");
    expect(json.nonce.length).toBeGreaterThan(0);
    expect(json).toHaveProperty("domain", "app.example.com");
  });

  it("stores nonce in cache with a TTL", async () => {
    const mod = await importHandler();
    const request = new Request("https://app.example.com/api/auth/siwe/nonce", {
      method: "GET",
    });

    await mod.GET(request as any);

    expect(mockCacheSet).toHaveBeenCalledTimes(1);
    const [key, value, options] = mockCacheSet.mock.calls[0];
    expect(key).toContain("siwe:");
    expect(value).toBe("1");
    // Verify TTL is set (ex or ttl option)
    expect(options).toBeDefined();
    expect(options.ex || options.ttl).toBeGreaterThan(0);
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const mod = await importHandler();
    const request = new Request("https://app.example.com/api/auth/siwe/nonce", {
      method: "GET",
    });

    const response = await mod.GET(request as any);

    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns unique nonces on successive calls", async () => {
    const mod = await importHandler();
    const nonces = new Set<string>();

    for (let i = 0; i < 5; i++) {
      const request = new Request("https://app.example.com/api/auth/siwe/nonce", {
        method: "GET",
      });
      const response = await mod.GET(request as any);
      const json = await response.json();
      nonces.add(json.nonce);
    }

    expect(nonces.size).toBe(5);
  });
});
