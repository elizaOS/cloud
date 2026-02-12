
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);
  });

  describe("Nonce issuance", () => {
    it("should return nonce with expected TTL", async () => {
      const { GET } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/nonce");

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.nonce).toBeDefined();
      expect(typeof data.nonce).toBe("string");
      expect(data.nonce.length).toBeGreaterThan(0);
    });

    it("should return domain matching app URL", async () => {
      const { GET } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/nonce");

      const response = await GET(req);
      const data = await response.json();

      expect(data.domain).toBe("example.com");
    });

    it("should fail when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);

      const { GET } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/nonce");

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should store nonce in cache with TTL", async () => {
      const { GET } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/nonce");

      await GET(req);

      expect(cache.set).toHaveBeenCalledWith(
        expect.stringContaining("siwe:nonce:"),
        "1",
        expect.objectContaining({ ttl: expect.any(Number) })
      );
    });
  });

  describe("Nonce uniqueness", () => {
    it("should generate unique nonces on each request", async () => {
      const { GET } = await import("./route");
      const req1 = new NextRequest("http://localhost/api/auth/siwe/nonce");
      const req2 = new NextRequest("http://localhost/api/auth/siwe/nonce");

      const response1 = await GET(req1);
      const response2 = await GET(req2);

      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1.nonce).not.toBe(data2.nonce);
    });
  });
});
