
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/cache/client", () => ({
  cache: {
    set: vi.fn(),
    isAvailable: vi.fn(() => true),
  },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: {
      nonce: (n: string) => `siwe:nonce:${n}`,
    },
  },
}));

import { cache } from "@/lib/cache/client";

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  it("returns 503 when cache is unavailable", async () => {
    (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

    // Dynamic import to get the handler after mocks are set up
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    const res = await GET(req);
    expect(res.status).toBe(503);
  });

  it("returns a nonce and domain when cache is available", async () => {
    (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (cache.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty("nonce");
    expect(typeof json.nonce).toBe("string");
    expect(json.nonce.length).toBeGreaterThan(0);
    expect(json).toHaveProperty("domain");
  });

  it("stores nonce in cache with TTL", async () => {
    (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (cache.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    await GET(req);

    expect(cache.set).toHaveBeenCalledTimes(1);
    // Verify TTL is set (third argument should be an options object or number)
    const setCall = (cache.set as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(setCall.length).toBeGreaterThanOrEqual(3);
  });
});
