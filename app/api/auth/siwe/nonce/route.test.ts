
/**
 * SIWE Nonce Endpoint Tests
 *
 * Tests covering:
 * - Nonce generation with TTL
 * - Cache availability checks
 * - Error handling for cache failures
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies before importing route
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    set: vi.fn(),
  },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("viem/siwe", () => ({
  generateSiweNonce: vi.fn(() => "test-nonce-123"),
}));

import { cache } from "@/lib/cache/client";

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  const createRequest = (chainId?: string) => {
    const url = chainId
      ? `http://localhost/api/auth/siwe/nonce?chainId=${chainId}`
      : "http://localhost/api/auth/siwe/nonce";
    return new NextRequest(url, { method: "GET" });
  };

  describe("Nonce generation", () => {
    it("should return nonce with domain and uri", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);

      const { GET } = await import("./route");
      const req = createRequest();
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.nonce).toBe("test-nonce-123");
      expect(data.domain).toBe("app.example.com");
      expect(data.uri).toBe("https://app.example.com");
      expect(data.version).toBe("1");
    });

    it("should store nonce in cache with TTL", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);

      const { GET } = await import("./route");
      const req = createRequest();
      await GET(req);

      expect(cache.set).toHaveBeenCalledWith(
        expect.stringContaining("test-nonce-123"),
        true,
        expect.any(Number)
      );
    });

    it("should default to chainId 1", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);

      const { GET } = await import("./route");
      const req = createRequest();
      const res = await GET(req);
      const data = await res.json();

      expect(data.chainId).toBe(1);
    });

    it("should accept custom chainId", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);

      const { GET } = await import("./route");
      const req = createRequest("137");
      const res = await GET(req);
      const data = await res.json();

      expect(data.chainId).toBe(137);
    });
  });

  describe("Cache availability", () => {
    it("should return 503 when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);

      const { GET } = await import("./route");
      const req = createRequest();
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should return 503 when cache.set fails", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockRejectedValue(new Error("Redis connection failed"));

      const { GET } = await import("./route");
      const req = createRequest();
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("Input validation", () => {
    it("should reject invalid chainId", async () => {
      const { GET } = await import("./route");
      const req = createRequest("invalid");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });

    it("should reject negative chainId", async () => {
      const { GET } = await import("./route");
      const req = createRequest("-1");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });
  });
});
