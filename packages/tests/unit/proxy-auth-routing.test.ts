import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_PRIVY_APP_ID ??= "test-privy-app";
process.env.PRIVY_APP_SECRET ??= "test-privy-secret";
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const mockVerifyAuthToken = mock(async () => ({ userId: "privy-user-1" }));
const mockRedisGet = mock();
const mockRedisSetex = mock();

mock.module("@privy-io/server-auth", () => ({
  PrivyClient: class MockPrivyClient {
    verifyAuthToken = mockVerifyAuthToken;
  },
}));

mock.module("@upstash/redis", () => ({
  Redis: class MockRedis {
    get = mockRedisGet;
    setex = mockRedisSetex;
  },
}));

import { proxy } from "@/proxy";

describe("proxy auth routing", () => {
  beforeEach(() => {
    mockVerifyAuthToken.mockReset();
    mockRedisGet.mockReset();
    mockRedisSetex.mockReset();
    mockVerifyAuthToken.mockResolvedValue({ userId: "privy-user-1" });
    mockRedisGet.mockResolvedValue(null);
    mockRedisSetex.mockResolvedValue("OK");
  });

  afterEach(() => {
    mock.restore();
  });

  test("redirects unauthenticated protected pages to login with returnTo", async () => {
    const request = new NextRequest("https://example.com/dashboard/settings?tab=billing");

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/login?returnTo=%2Fdashboard%2Fsettings%3Ftab%3Dbilling",
    );
    expect(mockVerifyAuthToken).not.toHaveBeenCalled();
  });

  test("invalid cookie tokens redirect back to login and clear auth cookies", async () => {
    const request = new NextRequest("https://example.com/dashboard/settings?tab=profile", {
      headers: {
        cookie: "privy-token=not-a-jwt; privy-id-token=also-not-a-jwt",
      },
    });

    const response = await proxy(request);
    const setCookieHeader = response.headers.get("set-cookie") || "";

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/login?returnTo=%2Fdashboard%2Fsettings%3Ftab%3Dprofile",
    );
    expect(setCookieHeader).toContain("privy-token=");
    expect(setCookieHeader).toContain("privy-id-token=");
    expect(mockVerifyAuthToken).not.toHaveBeenCalled();
  });

  test("allows anonymous build mode through as a public dashboard path", async () => {
    const request = new NextRequest("https://example.com/dashboard/build?characterId=abc123");

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mockVerifyAuthToken).not.toHaveBeenCalled();
  });

  test("allows anonymous session bootstrap route through as a public path", async () => {
    const request = new NextRequest(
      "https://example.com/api/auth/create-anonymous-session?returnUrl=%2Fchat%2Fagent-1",
    );

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(mockVerifyAuthToken).not.toHaveBeenCalled();
  });

  test("rejects API key auth on session-only paths with session_auth_required", async () => {
    const request = new NextRequest("https://example.com/api/v1/api-keys", {
      headers: {
        "X-API-Key": "test-api-key-12345",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("session_auth_required");
  });

  test("rejects API key auth on organization invite session-only path", async () => {
    const request = new NextRequest("https://example.com/api/organizations/invites", {
      method: "POST",
      headers: {
        "X-API-Key": "test-api-key-12345",
        "Content-Type": "application/json",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("session_auth_required");
  });

  test("rejects API key auth on api-keys regenerate session-only path", async () => {
    const request = new NextRequest("https://example.com/api/v1/api-keys/key-123/regenerate", {
      method: "POST",
      headers: {
        "X-API-Key": "test-api-key-12345",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("session_auth_required");
  });

  test("rejects X-API-Key on organization members session-only path", async () => {
    const request = new NextRequest("https://example.com/api/organizations/members", {
      method: "GET",
      headers: {
        "X-API-Key": "test-api-key-12345",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("session_auth_required");
  });
});
