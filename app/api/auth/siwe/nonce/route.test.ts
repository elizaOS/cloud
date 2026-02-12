
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { cache } from "@/lib/cache/client";
import { CacheKeys } from "@/lib/cache/keys";

vi.mock("@/lib/cache/client");
vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: any) => handler,
  RateLimitPresets: { STRICT: {} },
}));

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns nonce with valid parameters when cache is available", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("nonce");
    expect(data).toHaveProperty("domain");
    expect(data).toHaveProperty("uri");
    expect(data).toHaveProperty("chainId", 1);
    expect(data).toHaveProperty("version", "1");
    expect(data).toHaveProperty("statement", "Sign in to ElizaCloud");
    expect(cache.set).toHaveBeenCalledWith(
      CacheKeys.siwe.nonce(data.nonce),
      true,
      expect.any(Number),
    );
  });

  it("respects chainId query parameter", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);

    const req = new NextRequest(
      "http://localhost:3000/api/auth/siwe/nonce?chainId=137",
    );
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.chainId).toBe(137);
  });

  it("rejects invalid chainId parameter", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/auth/siwe/nonce?chainId=invalid",
    );
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("INVALID_BODY");
  });

  it("returns 503 when cache is unavailable", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(false);

    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("SERVICE_UNAVAILABLE");
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("returns 503 when cache.set fails", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockRejectedValue(new Error("Redis connection failed"));

    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe("SERVICE_UNAVAILABLE");
    expect(data.message).toBe("Unable to generate nonce. Please try again later.");
  });

  it("enforces TTL on nonce storage", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);

    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    await GET(req);

    expect(cache.set).toHaveBeenCalledWith(
      expect.any(String),
      true,
      300, // 5 minutes in seconds
    );
  });
});
