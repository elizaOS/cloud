
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { cache } from "@/lib/cache/client";
import { GET } from "./route";

// Mock the cache module
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(),
    set: vi.fn(),
  },
}));

// Mock rate limiter to pass through
vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: any) => handler,
  RateLimitPresets: { STRICT: {} },
}));

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when cache is unavailable", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(false);

    const request = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns nonce with valid parameters when cache is available", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);

    const request = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nonce).toBeDefined();
    expect(body.domain).toBeDefined();
    expect(body.uri).toBeDefined();
    expect(body.chainId).toBe(1);
    expect(body.version).toBe("1");
    expect(body.statement).toBeDefined();
  });

  it("accepts custom chainId parameter", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);

    const request = new NextRequest("http://localhost:3000/api/auth/siwe/nonce?chainId=137");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.chainId).toBe(137);
  });

  it("rejects invalid chainId", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);

    const request = new NextRequest("http://localhost:3000/api/auth/siwe/nonce?chainId=invalid");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });
});
