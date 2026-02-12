
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("viem/siwe", () => ({
  generateSiweNonce: vi.fn(() => "mock-nonce-abc123"),
}));

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    set: vi.fn(),
    get: vi.fn(() => true),
  },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: vi.fn(() => "https://example.com"),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

import { cache } from "@/lib/cache/client";

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (cache.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  function createRequest(chainId?: string) {
    const url = new URL("http://localhost:3000/api/auth/siwe/nonce");
    if (chainId) url.searchParams.set("chainId", chainId);
    return { nextUrl: url, headers: new Headers() } as any;
  }

  it("returns nonce with default chainId 1", async () => {
    const { GET } = await import("../../nonce/route");
    const res = await GET(createRequest());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.nonce).toBe("mock-nonce-abc123");
    expect(json.chainId).toBe(1);
    expect(json.domain).toBe("example.com");
    expect(json.uri).toBe("https://example.com");
    expect(json.version).toBe("1");
  });

  it("accepts custom chainId", async () => {
    const { GET } = await import("../../nonce/route");
    const res = await GET(createRequest("137"));
    const json = await res.json();
    expect(json.chainId).toBe(137);
  });

  it("rejects invalid chainId", async () => {
    const { GET } = await import("../../nonce/route");
    const res = await GET(createRequest("-1"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("rejects non-numeric chainId", async () => {
    const { GET } = await import("../../nonce/route");
    const res = await GET(createRequest("abc"));
    expect(res.status).toBe(400);
  });

  it("returns 503 when cache is unavailable", async () => {
    (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const { GET } = await import("../../nonce/route");
    const res = await GET(createRequest());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce fails to persist", async () => {
    (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { GET } = await import("../../nonce/route");
    const res = await GET(createRequest());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when cache.set throws", async () => {
    (cache.set as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Redis down"));
    const { GET } = await import("../../nonce/route");
    const res = await GET(createRequest());
    expect(res.status).toBe(503);
  });

  it("stores nonce with TTL via cache.set", async () => {
    const { GET } = await import("../../nonce/route");
    await GET(createRequest());
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining("mock-nonce-abc123"),
      true,
      expect.any(Number),
    );
  });
});
