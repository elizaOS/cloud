
import { NextRequest } from "next/server";

const mockCacheSet = jest.fn();
const mockCacheGet = jest.fn();
const mockCacheIsAvailable = jest.fn().mockReturnValue(true);

jest.mock("@/lib/cache/client", () => ({
  cache: {
    set: mockCacheSet,
    get: mockCacheGet,
    isAvailable: mockCacheIsAvailable,
  },
}));

jest.mock("@/lib/cache/keys", () => ({
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

jest.mock("viem/siwe", () => ({
  generateSiweNonce: jest.fn().mockReturnValue("test-nonce-abc123"),
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

import { GET } from "../../nonce/route";

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL("https://app.example.com/api/auth/siwe/nonce");
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url);
}

describe("SIWE nonce endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheGet.mockResolvedValue(true);
  });

  // --- Cache availability ---
  describe("cache availability", () => {
    it("returns 503 when cache is unavailable", async () => {
      mockCacheIsAvailable.mockReturnValue(false);
      const res = await GET(makeRequest());
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 503 when cache.set fails silently (nonce not persisted)", async () => {
      mockCacheGet.mockResolvedValue(null);
      const res = await GET(makeRequest());
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 503 when cache.set throws", async () => {
      mockCacheSet.mockRejectedValue(new Error("Redis connection failed"));
      const res = await GET(makeRequest());
      expect(res.status).toBe(503);
    });
  });

  // --- Nonce TTL ---
  describe("nonce storage", () => {
    it("stores nonce with correct TTL", async () => {
      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
      expect(mockCacheSet).toHaveBeenCalledWith(
        "siwe:nonce:test-nonce-abc123",
        true,
        300,
      );
    });

    it("verifies nonce was persisted after set", async () => {
      await GET(makeRequest());
      expect(mockCacheGet).toHaveBeenCalledWith("siwe:nonce:test-nonce-abc123");
    });
  });

  // --- Success response ---
  describe("successful nonce issuance", () => {
    it("returns nonce with domain, uri, chainId, version, and statement", async () => {
      const res = await GET(makeRequest());
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        nonce: "test-nonce-abc123",
        domain: "app.example.com",
        uri: "https://app.example.com",
        chainId: 1,
        version: "1",
        statement: "Sign in to ElizaCloud",
      });
    });

    it("uses custom chainId when provided", async () => {
      const res = await GET(makeRequest({ chainId: "137" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.chainId).toBe(137);
    });
  });

  // --- chainId validation ---
  describe("chainId validation", () => {
    it("returns 400 for non-numeric chainId", async () => {
      const res = await GET(makeRequest({ chainId: "abc" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 for negative chainId", async () => {
      const res = await GET(makeRequest({ chainId: "-1" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for zero chainId", async () => {
      const res = await GET(makeRequest({ chainId: "0" }));
      expect(res.status).toBe(400);
    });
  });
});
