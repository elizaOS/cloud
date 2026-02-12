
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SIWE Nonce Endpoint Tests
 * 
 * Coverage for:
 * - Nonce generation and TTL
 * - Cache availability handling
 * - Parameter validation
 */

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    set: vi.fn(),
  },
}));

vi.mock("viem/siwe", () => ({
  generateSiweNonce: vi.fn(() => "test-nonce-123"),
}));

import { cache } from "@/lib/cache/client";

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Cache availability", () => {
    it("should return 503 when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      
      const { GET } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/nonce");
      
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should return 503 when cache.set fails", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockRejectedValue(new Error("Redis connection failed"));
      
      const { GET } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/nonce");
      
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("Nonce generation", () => {
    it("should return nonce with required SIWE parameters", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);
      
      const { GET } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/nonce");
      
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.nonce).toBeDefined();
      expect(data.domain).toBeDefined();
      expect(data.uri).toBeDefined();
      expect(data.chainId).toBe(1);
      expect(data.version).toBe("1");
      expect(data.statement).toBe("Sign in to ElizaCloud");
    });

    it("should store nonce in cache with TTL", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);
      
      const { GET } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/nonce");
      
      await GET(request as any);
      
      expect(cache.set).toHaveBeenCalledWith(
        expect.stringContaining("siwe:nonce:"),
        true,
        expect.any(Number)
      );
    });
  });

  describe("Chain ID validation", () => {
    it("should accept valid chainId parameter", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);
      
      const { GET } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/nonce?chainId=137");
      
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.chainId).toBe(137);
    });

    it("should reject invalid chainId parameter", async () => {
      const { GET } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/nonce?chainId=invalid");
      
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });

    it("should reject negative chainId", async () => {
      const { GET } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/nonce?chainId=-1");
      
      const response = await GET(request as any);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });
  });
});
