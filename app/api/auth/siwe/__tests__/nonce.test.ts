
/**
 * Tests for SIWE nonce endpoint: GET /api/auth/siwe/nonce
 *
 * Covers:
 * - Nonce issuance (happy path)
 * - Nonce TTL / single-use semantics
 * - Cache availability (Redis down → 503)
 * - Invalid chainId parameter
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks must be hoisted before the module under test is imported ---

const mockCacheSet = vi.fn().mockResolvedValue(undefined);
const mockCacheGet = vi.fn().mockResolvedValue(true);
const mockCacheIsAvailable = vi.fn().mockReturnValue(true);

vi.mock("@/lib/cache/client", () => ({
  cache: {
    set: (...args: unknown[]) => mockCacheSet(...args),
    get: (...args: unknown[]) => mockCacheGet(...args),
    isAvailable: () => mockCacheIsAvailable(),
  },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheTTL: { siwe: { nonce: 300 } },
  CacheKeys: {
    siwe: {
      nonce: (n: string) => `siwe:nonce:${n}`,
    },
  },
}));

vi.mock("viem/siwe", () => ({
  generateSiweNonce: () => "test-nonce-abc123",
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://elizacloud.ai",
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// Import the handler after mocks are set up
import { GET } from "../../nonce/route";
import { NextRequest } from "next/server";

function makeRequest(queryString = ""): NextRequest {
  return new NextRequest(
    new URL(`http://localhost:3000/api/auth/siwe/nonce${queryString}`),
  );
}

describe("GET /api/auth/siwe/nonce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheSet.mockResolvedValue(undefined);
    mockCacheGet.mockResolvedValue(true);
  });

  it("returns a nonce with default chainId", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.nonce).toBe("test-nonce-abc123");
    expect(json.domain).toBe("elizacloud.ai");
    expect(json.uri).toBe("https://elizacloud.ai");
    expect(json.chainId).toBe(1);
    expect(json.version).toBe("1");
    expect(json.statement).toBe("Sign in to ElizaCloud");
  });

  it("accepts a custom chainId", async () => {
    const res = await GET(makeRequest("?chainId=137"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.chainId).toBe(137);
  });

  it("rejects invalid chainId (non-numeric)", async () => {
    const res = await GET(makeRequest("?chainId=abc"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_BODY");
  });

  it("rejects invalid chainId (zero)", async () => {
    const res = await GET(makeRequest("?chainId=0"));

    expect(res.status).toBe(400);
  });

  it("rejects invalid chainId (negative)", async () => {
    const res = await GET(makeRequest("?chainId=-1"));

    expect(res.status).toBe(400);
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when cache.set succeeds but nonce is not persisted", async () => {
    mockCacheGet.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when cache.set throws", async () => {
    mockCacheSet.mockRejectedValue(new Error("Redis connection refused"));

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("stores nonce in cache with correct key and TTL", async () => {
    await GET(makeRequest());

    expect(mockCacheSet).toHaveBeenCalledWith(
      "siwe:nonce:test-nonce-abc123",
      true,
      300,
    );
  });

  it("verifies nonce persistence after writing", async () => {
    await GET(makeRequest());

    expect(mockCacheGet).toHaveBeenCalledWith("siwe:nonce:test-nonce-abc123");
  });
});
