
/**
 * Tests for SIWE Nonce Endpoint
 *
 * Covers nonce generation, cache persistence verification, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn().mockReturnValue(true),
    set: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("viem/siwe", () => ({
  generateSiweNonce: vi.fn().mockReturnValue("test-nonce-abc123"),
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: vi.fn().mockReturnValue("https://app.example.com"),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: vi.fn((handler: Function) => handler),
  RateLimitPresets: { STRICT: {} },
}));

import { cache } from "@/lib/cache/client";

function createRequest(queryParams: Record<string, string> = {}): Request {
  const url = new URL("https://app.example.com/api/auth/siwe/nonce");
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString(), { method: "GET" });
}

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.get).mockResolvedValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);
  });

  it("returns a nonce with SIWE parameters", async () => {
    const { GET } = await import("./route");
    const req = createRequest();
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.nonce).toBe("test-nonce-abc123");
    expect(json.domain).toBe("app.example.com");
    expect(json.uri).toBe("https://app.example.com");
    expect(json.version).toBe("1");
    expect(json.chainId).toBe(1);
  });

  it("accepts custom chainId", async () => {
    const { GET } = await import("./route");
    const req = createRequest({ chainId: "137" });
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.chainId).toBe(137);
  });

  it("returns 400 for invalid chainId", async () => {
    const { GET } = await import("./route");
    const req = createRequest({ chainId: "-1" });
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 503 when cache is unavailable", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(false);
    const { GET } = await import("./route");
    const req = createRequest();
    const res = await GET(req as any);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce persistence fails", async () => {
    vi.mocked(cache.get).mockResolvedValue(null);
    const { GET } = await import("./route");
    const req = createRequest();
    const res = await GET(req as any);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });
});
