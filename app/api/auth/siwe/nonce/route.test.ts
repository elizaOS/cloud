
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    set: vi.fn(),
  },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: vi.fn((handler: (req: NextRequest) => Promise<Response>) => handler),
  RateLimitPresets: { STRICT: {} },
}));

import { cache } from "@/lib/cache/client";

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);
  });

  it("returns a nonce and domain on success", async () => {
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.nonce).toBeDefined();
    expect(typeof data.nonce).toBe("string");
    expect(data.nonce.length).toBeGreaterThan(0);
    expect(data.domain).toBe("localhost");
  });

  it("stores nonce in cache with a TTL", async () => {
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    await GET(req);
    expect(cache.set).toHaveBeenCalledTimes(1);
    // Verify the TTL argument is present (third argument to cache.set)
    const setCall = vi.mocked(cache.set).mock.calls[0];
    expect(setCall).toBeDefined();
    // The TTL should be a positive number (in seconds)
    expect(setCall?.[2]).toBeGreaterThan(0);
  });

  it("returns 503 when cache is unavailable", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(false);
    const { GET } = await import("./route");
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/nonce");
    const res = await GET(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});
