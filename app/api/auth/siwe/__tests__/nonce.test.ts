
/**
 * Tests for SIWE nonce endpoint
 *
 * Covers nonce TTL storage, cache availability checks, and failure modes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheIsAvailable = vi.fn().mockReturnValue(true);
const mockGenerateSiweNonce = vi.fn().mockReturnValue("test-nonce-123");
const mockGetAppUrl = vi.fn().mockReturnValue("https://app.example.com");

vi.mock("@/lib/cache/client", () => ({
  cache: {
    get: mockCacheGet,
    set: mockCacheSet,
    isAvailable: mockCacheIsAvailable,
  },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheTTL: { siwe: { nonce: 300 } },
  CacheKeys: {
    siwe: { nonce: (n: string) => `siwe:nonce:${n}` },
  },
}));

vi.mock("viem/siwe", () => ({
  generateSiweNonce: mockGenerateSiweNonce,
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: mockGetAppUrl,
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

function buildRequest(searchParams: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/auth/siwe/nonce");
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), { method: "GET" });
}

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheGet.mockResolvedValue(true);
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);

    const { GET } = await import("../../nonce/route");
    const req = buildRequest();
    const res = await GET(req as any);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce fails to persist", async () => {
    mockCacheGet.mockResolvedValue(null); // simulate silent set failure

    const { GET } = await import("../../nonce/route");
    const req = buildRequest();
    const res = await GET(req as any);
    expect(res.status).toBe(503);
  });

  it("returns nonce with domain, uri, chainId on success", async () => {
    const { GET } = await import("../../nonce/route");
    const req = buildRequest();
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.nonce).toBe("test-nonce-123");
    expect(json.domain).toBe("app.example.com");
    expect(json.uri).toBe("https://app.example.com");
    expect(json.chainId).toBe(1);
    expect(json.version).toBe("1");
  });

  it("stores nonce in cache with TTL", async () => {
    const { GET } = await import("../../nonce/route");
    const req = buildRequest();
    await GET(req as any);

    expect(mockCacheSet).toHaveBeenCalledWith(
      "siwe:nonce:test-nonce-123",
      true,
      300,
    );
  });

  it("uses custom chainId when provided", async () => {
    const { GET } = await import("../../nonce/route");
    const req = buildRequest({ chainId: "137" });
    const res = await GET(req as any);
    const json = await res.json();
    expect(json.chainId).toBe(137);
  });

  it("returns 400 for invalid chainId", async () => {
    const { GET } = await import("../../nonce/route");
    const req = buildRequest({ chainId: "abc" });
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative chainId", async () => {
    const { GET } = await import("../../nonce/route");
    const req = buildRequest({ chainId: "-1" });
    const res = await GET(req as any);
    expect(res.status).toBe(400);
  });
});
