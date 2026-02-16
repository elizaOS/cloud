
/**
 * Tests for SIWE nonce endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route
vi.mock("@/lib/cache/client", () => {
  const mockCache = {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    isAvailable: vi.fn().mockReturnValue(true),
    getRedisClient: vi.fn(),
  };
  return { cache: mockCache };
});

vi.mock("viem/siwe", () => ({
  generateSiweNonce: vi.fn().mockReturnValue("mock-nonce-abc123"),
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: vi.fn().mockReturnValue("https://app.example.com"),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

import { cache } from "@/lib/cache/client";
import { GET } from "../../nonce/route";

function makeRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/auth/siwe/nonce");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new Request(url.toString(), { method: "GET" }) as any;
}

describe("SIWE nonce endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cache.get as any).mockResolvedValue(true);
    (cache.set as any).mockResolvedValue(undefined);
  });

  it("returns a nonce with domain and uri from getAppUrl", async () => {
    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nonce).toBe("mock-nonce-abc123");
    expect(body.domain).toBe("app.example.com");
    expect(body.uri).toBe("https://app.example.com");
    expect(body.version).toBe("1");
    expect(body.chainId).toBe(1);
  });

  it("accepts a custom chainId", async () => {
    const res = await GET(makeRequest({ chainId: "137" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.chainId).toBe(137);
  });

  it("rejects invalid chainId", async () => {
    const res = await GET(makeRequest({ chainId: "-1" }));
    expect(res.status).toBe(400);
  });

  it("rejects non-integer chainId", async () => {
    const res = await GET(makeRequest({ chainId: "abc" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when cache.set throws", async () => {
    (cache.set as any).mockRejectedValue(new Error("Redis down"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce readback fails", async () => {
    (cache.get as any).mockResolvedValue(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });
});
