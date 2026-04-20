import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function makeToken(exp: number): string {
  return [
    base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    base64UrlEncode(JSON.stringify({ exp, sub: "steward-user-1" })),
    "signature",
  ].join(".");
}

async function importProxy() {
  mock.module("@privy-io/server-auth", () => ({
    PrivyClient: class {
      verifyAuthToken() {
        throw new Error("verifyAuthToken should not be called in Steward refresh tests");
      }
    },
  }));

  mock.module("@upstash/redis", () => ({
    Redis: class {
      async get() {
        return null;
      }
      async setex() {}
    },
  }));

  return import(new URL(`../../../proxy.ts?test=${Date.now()}`, import.meta.url).href);
}

function makeRequest(pathname: string, cookie: string): NextRequest {
  return new NextRequest(`https://app.example.com${pathname}`, {
    headers: { cookie },
  });
}

describe("proxy steward refresh", () => {
  beforeEach(() => {
    mock.restore();
    restoreEnv();
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = "privy-app-id";
    process.env.PRIVY_APP_SECRET = "privy-app-secret";
    process.env.STEWARD_API_URL = "https://steward.example.com";
  });

  afterEach(() => {
    mock.restore();
    restoreEnv();
    globalThis.fetch = ORIGINAL_FETCH;
  });

  test("refreshes an expired steward token, forwards auth immediately, and sets both cookies", async () => {
    const expiredToken = makeToken(Math.floor(Date.now() / 1000) - 60);
    const refreshedToken = makeToken(Math.floor(Date.now() / 1000) + 900);
    const fetchMock = mock(async () =>
      Response.json({
        token: refreshedToken,
        refreshToken: "refresh-token-new",
        expiresIn: 900,
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const { proxy } = await importProxy();
    const response = await proxy(
      makeRequest(
        "/dashboard",
        `steward-token=${expiredToken}; steward-refresh-token=refresh-token-old`,
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://steward.example.com/auth/refresh");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-auth-source")).toBe("steward-refresh");
    expect(response.headers.get("x-middleware-request-authorization")).toBe(
      `Bearer ${refreshedToken}`,
    );
    expect(response.headers.get("x-middleware-override-headers")).toContain("authorization");

    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies.some((value) => value.includes("steward-token="))).toBe(true);
    expect(setCookies.some((value) => value.includes("steward-refresh-token="))).toBe(true);
    expect(setCookies.some((value) => value.includes("Max-Age=900"))).toBe(true);
    expect(setCookies.some((value) => value.includes("Max-Age=2592000"))).toBe(true);
  });

  test("clears steward cookies and redirects to login when refresh returns 401", async () => {
    const expiredToken = makeToken(Math.floor(Date.now() / 1000) - 60);
    globalThis.fetch = mock(async () => new Response(null, { status: 401 })) as typeof fetch;

    const { proxy } = await importProxy();
    const response = await proxy(
      makeRequest(
        "/dashboard",
        `steward-token=${expiredToken}; steward-refresh-token=refresh-token-old`,
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(2);
    expect(setCookies.every((value) => value.includes("Max-Age=0"))).toBe(true);
  });

  test("soft-fails on refresh 5xx without redirecting", async () => {
    const expiredToken = makeToken(Math.floor(Date.now() / 1000) - 60);
    globalThis.fetch = mock(async () => new Response(null, { status: 503 })) as typeof fetch;

    const { proxy } = await importProxy();
    const response = await proxy(
      makeRequest(
        "/dashboard",
        `steward-token=${expiredToken}; steward-refresh-token=refresh-token-old`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-authorization")).toBeNull();
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  test("soft-fails on refresh network errors without redirecting", async () => {
    const expiredToken = makeToken(Math.floor(Date.now() / 1000) - 60);
    globalThis.fetch = mock(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const { proxy } = await importProxy();
    const response = await proxy(
      makeRequest(
        "/dashboard",
        `steward-token=${expiredToken}; steward-refresh-token=refresh-token-old`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-authorization")).toBeNull();
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  test("forwards refreshed authorization on the same protected API request", async () => {
    const expiredToken = makeToken(Math.floor(Date.now() / 1000) - 60);
    const refreshedToken = makeToken(Math.floor(Date.now() / 1000) + 300);
    globalThis.fetch = mock(async () =>
      Response.json({
        token: refreshedToken,
        refreshToken: "refresh-token-new",
      }),
    ) as typeof fetch;

    const { proxy } = await importProxy();
    const response = await proxy(
      makeRequest(
        "/api/v1/user",
        `steward-token=${expiredToken}; steward-refresh-token=refresh-token-old`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-request-authorization")).toBe(
      `Bearer ${refreshedToken}`,
    );
  });
});
