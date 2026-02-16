
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: vi.fn(() => "https://app.example.com"),
}));

vi.mock("viem/siwe", () => ({
  generateSiweNonce: vi.fn(() => "mock-nonce-abc123"),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

import { cache } from "@/lib/cache/client";
import { GET } from "../nonce/route";
import { NextRequest } from "next/server";

function makeRequest(url = "http://localhost:3000/api/auth/siwe/nonce") {
  return new NextRequest(new URL(url));
}

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when cache is unavailable", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(false);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns nonce and SIWE params when cache is available", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);
    vi.mocked(cache.get).mockResolvedValue(true);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nonce).toBe("mock-nonce-abc123");
    expect(body.domain).toBe("app.example.com");
    expect(body.uri).toBe("https://app.example.com");
    expect(body.chainId).toBe(1);
    expect(body.version).toBe("1");
  });

  it("returns 400 for invalid chainId", async () => {
    const res = await GET(
      makeRequest("http://localhost:3000/api/auth/siwe/nonce?chainId=-1"),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("accepts valid chainId parameter", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);
    vi.mocked(cache.get).mockResolvedValue(true);

    const res = await GET(
      makeRequest("http://localhost:3000/api/auth/siwe/nonce?chainId=137"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.chainId).toBe(137);
  });

  it("returns 503 when cache.set throws", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockRejectedValue(new Error("Redis connection failed"));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce persistence verification fails", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);
    vi.mocked(cache.get).mockResolvedValue(null);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });
});
