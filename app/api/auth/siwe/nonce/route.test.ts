
/**
 * SIWE Nonce Endpoint Tests
 *
 * Tests for nonce generation, TTL enforcement, and cache availability.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before imports
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
    process.env.NEXT_PUBLIC_APP_URL = "https://elizacloud.ai";
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("Cache availability", () => {
    it("returns SERVICE_UNAVAILABLE when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);

      const { GET } = await import("./route");
      const request = new Request("https://elizacloud.ai/api/auth/siwe/nonce");

      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns nonce when cache is available", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);

      const { GET } = await import("./route");
      const request = new Request("https://elizacloud.ai/api/auth/siwe/nonce");

      const response = await GET(request as any);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.nonce).toBeDefined();
      expect(typeof data.nonce).toBe("string");
    });
  });

  describe("Nonce properties", () => {
    it("stores nonce with correct TTL", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);

      const { GET } = await import("./route");
      const request = new Request("https://elizacloud.ai/api/auth/siwe/nonce");

      await GET(request as any);

      expect(cache.set).toHaveBeenCalledWith(
        expect.stringContaining("siwe:nonce:"),
        expect.any(String),
        expect.objectContaining({ ttl: expect.any(Number) })
      );
    });

    it("returns all required SIWE parameters", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);

      const { GET } = await import("./route");
      const request = new Request("https://elizacloud.ai/api/auth/siwe/nonce");

      const response = await GET(request as any);
      const data = await response.json();

      expect(data).toHaveProperty("nonce");
      expect(data).toHaveProperty("domain");
      expect(data).toHaveProperty("uri");
      expect(data).toHaveProperty("chainId");
      expect(data).toHaveProperty("version");
      expect(data).toHaveProperty("statement");
    });
  });
});
