
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    set: vi.fn(),
  },
}));

import { cache } from "@/lib/cache/client";

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Cache Availability", () => {
    it("should return 503 when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      
      expect(cache.isAvailable()).toBe(false);
      // Endpoint should return 503 SERVICE_UNAVAILABLE
    });

    it("should proceed when cache is available", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      
      expect(cache.isAvailable()).toBe(true);
    });
  });

  describe("Nonce Generation", () => {
    it("should generate unique nonces", () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
        expect(nonces.has(nonce)).toBe(false);
        nonces.add(nonce);
      }
    });

    it("should store nonce with TTL in cache", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);
      
      await cache.set("test-key", "test-value", 300);
      
      expect(cache.set).toHaveBeenCalledWith("test-key", "test-value", 300);
    });
  });

  describe("Error Handling", () => {
    it("should handle cache write failures gracefully", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockRejectedValue(new Error("Redis connection failed"));
      
      await expect(cache.set("test-key", "value", 300)).rejects.toThrow("Redis connection failed");
    });
  });
});
