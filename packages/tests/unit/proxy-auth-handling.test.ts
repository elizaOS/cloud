import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= "test-privy-app";
process.env.PRIVY_APP_SECRET ??= "test-privy-secret";

const mockVerifyAuthToken = mock();
const mockRedisGet = mock();
const mockRedisSetex = mock();

class MockPrivyClient {
  verifyAuthToken = mockVerifyAuthToken;

  constructor(_appId?: string, _appSecret?: string) {}
}

class MockRedis {
  constructor(_config?: { url?: string; token?: string }) {}

  get = mockRedisGet;
  setex = mockRedisSetex;
}

mock.module("@privy-io/server-auth", () => ({
  PrivyClient: MockPrivyClient,
}));

mock.module("@upstash/redis", () => ({
  Redis: MockRedis,
}));

import { proxy } from "@/proxy";

describe("proxy auth handling", () => {
  const originalEnv = {
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
  };

  beforeEach(() => {
    process.env.KV_REST_API_URL = "https://redis.example.com";
    process.env.KV_REST_API_TOKEN = "redis-token";

    mockVerifyAuthToken.mockReset();
    mockRedisGet.mockReset();
    mockRedisSetex.mockReset();

    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue("OK");
  });

  afterEach(() => {
    process.env.KV_REST_API_URL = originalEnv.KV_REST_API_URL;
    process.env.KV_REST_API_TOKEN = originalEnv.KV_REST_API_TOKEN;
    mock.restore();
  });

  test("rejects obviously malformed protected API tokens before calling Privy", async () => {
    const response = await proxy(
      new NextRequest("https://example.com/api/v1/user", {
        headers: {
          cookie: "privy-token=not-a-jwt",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid authentication token",
      code: "authentication_required",
    });
    expect(mockVerifyAuthToken).not.toHaveBeenCalled();
    expect(mockRedisSetex).toHaveBeenCalledTimes(1);
  });

  test("uses cached invalid auth results to short-circuit repeated bad-token requests", async () => {
    mockRedisGet.mockResolvedValue({
      valid: false,
      reason: "invalid",
      cachedAt: Date.now(),
    });

    const response = await proxy(
      new NextRequest("https://example.com/api/v1/user", {
        headers: {
          cookie: "privy-token=eyJ.bad.token",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid authentication token",
      code: "authentication_required",
    });
    expect(mockVerifyAuthToken).not.toHaveBeenCalled();
  });

  test("treats invalid dashboard cookies as normal auth failure instead of redirecting to auth error", async () => {
    mockRedisGet.mockResolvedValue({
      valid: false,
      reason: "invalid",
      cachedAt: Date.now(),
    });

    const response = await proxy(
      new NextRequest("https://example.com/dashboard", {
        headers: {
          cookie: "privy-token=eyJ.invalid.token; privy-id-token=eyJ.other.token",
        },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/login?returnTo=%2Fdashboard",
    );

    const setCookieHeaders = Array.from(response.headers.entries())
      .filter(([key]) => key.toLowerCase() === "set-cookie")
      .map(([, value]) => value);

    expect(setCookieHeaders.some((value) => value.includes("privy-token="))).toBe(true);
    expect(setCookieHeaders.some((value) => value.includes("privy-id-token="))).toBe(true);
    expect(mockVerifyAuthToken).not.toHaveBeenCalled();
  });
});
