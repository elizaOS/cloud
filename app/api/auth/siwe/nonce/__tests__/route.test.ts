
import { GET } from "../route";
import { NextRequest } from "next/server";
import { cache } from "@/lib/cache/client";

// Mock the cache module
jest.mock("@/lib/cache/client", () => ({
  cache: {
    set: jest.fn(),
    isAvailable: jest.fn(),
  },
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: {
      nonce: (nonce: string) => `siwe:nonce:${nonce}`,
    },
  },
}));

describe("/api/auth/siwe/nonce", () => {
  let mockCacheSet: jest.Mock;
  let mockCacheIsAvailable: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheSet = cache.set as jest.Mock;
    mockCacheIsAvailable = cache.isAvailable as jest.Mock;
    mockCacheIsAvailable.mockReturnValue(true);
    mockCacheSet.mockResolvedValue(undefined);
  });

  describe("Nonce generation success path", () => {
    it("should return nonce and domain when cache is available", async () => {
      const request = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("nonce");
      expect(data).toHaveProperty("domain");
      expect(typeof data.nonce).toBe("string");
      expect(data.nonce).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.stringContaining("siwe:nonce:"),
        "1",
        300
      );
    });

    it("should set nonce TTL to 300 seconds (5 minutes)", async () => {
      const request = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
      await GET(request);

      expect(mockCacheSet).toHaveBeenCalledWith(
        expect.any(String),
        "1",
        300
      );
    });

    it("should return correct domain based on environment", async () => {
      process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
      const request = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
      const response = await GET(request);
      const data = await response.json();

      expect(data.domain).toBe("example.com");
      delete process.env.NEXT_PUBLIC_APP_URL;
    });
  });

  describe("Cache unavailability failure mode", () => {
    it("should return 503 when cache is unavailable", async () => {
      mockCacheIsAvailable.mockReturnValue(false);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
      expect(mockCacheSet).not.toHaveBeenCalled();
    });

    it("should provide helpful error message when Redis is down", async () => {
      mockCacheIsAvailable.mockReturnValue(false);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
      const response = await GET(request);
      const data = await response.json();

      expect(data.message).toContain("temporarily unavailable");
      expect(data.message).toContain("try again later");
    });
  });
});
