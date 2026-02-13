
/**
 * Tests for SIWE nonce endpoint
 *
 * Covers: nonce issuance, TTL behavior, cache unavailability, and input validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockIsAvailable = vi.fn().mockReturnValue(true);
const mockSet = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: () => mockIsAvailable(),
    set: (...args: unknown[]) => mockSet(...args),
    get: (...args: unknown[]) => mockGet(...args),
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

// Import after mocks
import { GET } from "../../nonce/route";
import { NextRequest } from "next/server";

function makeRequest(query = ""): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000/api/auth/siwe/nonce${query}`));
}

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAvailable.mockReturnValue(true);
    mockSet.mockResolvedValue(undefined);
    mockGet.mockResolvedValue(true);
  });

  it("returns a nonce with SIWE parameters", async () => {
    const res = await GET(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.nonce).toBe("mock-nonce-abc123");
    expect(data.domain).toBe("app.example.com");
    expect(data.uri).toBe("https://app.example.com");
    expect(data.chainId).toBe(1);
    expect(data.version).toBe("1");
    expect(data.statement).toBe("Sign in to ElizaCloud");
  });

  it("stores nonce in cache with TTL", async () => {
    await GET(makeRequest());

    expect(mockSet).toHaveBeenCalledWith(
      "siwe:nonce:mock-nonce-abc123",
      true,
      300,
    );
  });

  it("verifies nonce was persisted by reading it back", async () => {
    await GET(makeRequest());

    expect(mockGet).toHaveBeenCalledWith("siwe:nonce:mock-nonce-abc123");
  });

  it("returns 503 when cache is unavailable", async () => {
    mockIsAvailable.mockReturnValue(false);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce fails to persist", async () => {
    mockGet.mockResolvedValue(null);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when cache.set throws", async () => {
    mockSet.mockRejectedValue(new Error("Redis connection refused"));

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("accepts a custom chainId", async () => {
    const res = await GET(makeRequest("?chainId=137"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.chainId).toBe(137);
  });

  it("rejects invalid chainId", async () => {
    const res = await GET(makeRequest("?chainId=-1"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("INVALID_BODY");
  });

  it("rejects non-numeric chainId", async () => {
    const res = await GET(makeRequest("?chainId=abc"));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("INVALID_BODY");
  });
});
