
/**
 * SIWE Nonce Endpoint Tests
 *
 * Covers nonce generation, TTL, and Redis availability handling.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "./route";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Nonce generation", () => {
    it("should generate valid nonce with correct parameters", async () => {
      vi.spyOn(cache, "isAvailable").mockReturnValue(true);
      vi.spyOn(cache, "set").mockResolvedValue("OK");

      const request = new Request("http://localhost:3000/api/auth/siwe/nonce");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.nonce).toBeDefined();
      expect(data.domain).toBe("localhost");
      expect(data.uri).toBe("http://localhost:3000");
      expect(data.chainId).toBe(1);
      expect(data.version).toBe("1");
      expect(data.statement).toBe("Sign in to ElizaCloud");
    });

    it("should store nonce in cache with TTL", async () => {
      vi.spyOn(cache, "isAvailable").mockReturnValue(true);
      const setSpy = vi.spyOn(cache, "set").mockResolvedValue("OK");

      const request = new Request("http://localhost:3000/api/auth/siwe/nonce");
      const response = await GET(request);
      const data = await response.json();

      expect(setSpy).toHaveBeenCalledWith(
        CacheKeys.siwe.nonce(data.nonce),
        true,
        CacheTTL.siwe.nonce,
      );
    });

    it("should accept custom chainId parameter", async () => {
      vi.spyOn(cache, "isAvailable").mockReturnValue(true);
      vi.spyOn(cache, "set").mockResolvedValue("OK");

      const request = new Request("http://localhost:3000/api/auth/siwe/nonce?chainId=137");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.chainId).toBe(137);
    });

    it("should reject invalid chainId", async () => {
      const request = new Request("http://localhost:3000/api/auth/siwe/nonce?chainId=invalid");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });
  });

  describe("Cache availability", () => {
    it("should return 503 when cache is unavailable", async () => {
      vi.spyOn(cache, "isAvailable").mockReturnValue(false);

      const request = new Request("http://localhost:3000/api/auth/siwe/nonce");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
      expect(data.message).toContain("temporarily unavailable");
    });

    it("should return 503 when cache.set fails", async () => {
      vi.spyOn(cache, "isAvailable").mockReturnValue(true);
      vi.spyOn(cache, "set").mockRejectedValue(new Error("Redis connection failed"));

      const request = new Request("http://localhost:3000/api/auth/siwe/nonce");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });
});
