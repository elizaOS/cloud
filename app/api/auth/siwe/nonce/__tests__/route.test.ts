
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the route
vi.mock("@/lib/cache/client", () => ({
  cache: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    isAvailable: vi.fn(),
  },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheTTL: { siwe: { nonce: 300 } },
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "http://localhost:3000",
}));

vi.mock("viem/siwe", () => ({
  generateSiweNonce: () => "mock-nonce-abc123",
}));

import { cache } from "@/lib/cache/client";
import { NextRequest } from "next/server";

const mockedCache = vi.mocked(cache);

async function importHandler() {
  const mod = await import("../../nonce/route");
  return mod.GET;
}

function makeRequest(chainId?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/siwe/nonce");
  if (chainId) url.searchParams.set("chainId", chainId);
  return new NextRequest(url);
}

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCache.isAvailable.mockReturnValue(true);
    mockedCache.set.mockResolvedValue(undefined);
    mockedCache.get.mockResolvedValue(true);
  });

  it("returns a nonce with default chainId 1", async () => {
    const handler = await importHandler();
    const res = await handler(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nonce).toBe("mock-nonce-abc123");
    expect(body.chainId).toBe(1);
    expect(body.domain).toBe("localhost");
    expect(body.version).toBe("1");
    expect(body.statement).toBe("Sign in to ElizaCloud");
  });

  it("accepts a custom chainId", async () => {
    const handler = await importHandler();
    const res = await handler(makeRequest("137"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.chainId).toBe(137);
  });

  it("rejects invalid chainId", async () => {
    const handler = await importHandler();
    const res = await handler(makeRequest("abc"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("rejects negative chainId", async () => {
    const handler = await importHandler();
    const res = await handler(makeRequest("-5"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("returns 503 when cache is unavailable", async () => {
    mockedCache.isAvailable.mockReturnValue(false);
    const handler = await importHandler();
    const res = await handler(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce fails to persist", async () => {
    mockedCache.get.mockResolvedValue(null);
    const handler = await importHandler();
    const res = await handler(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("stores nonce with correct TTL key", async () => {
    const handler = await importHandler();
    await handler(makeRequest());

    expect(mockedCache.set).toHaveBeenCalledWith(
      "siwe:nonce:mock-nonce-abc123",
      true,
      300,
    );
  });
});
