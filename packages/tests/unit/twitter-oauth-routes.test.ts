import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

async function importConnectRoute() {
  return import(
    new URL(
      `../../../app/api/v1/twitter/connect/route.ts?test=${Date.now()}-${Math.random()}`,
      import.meta.url,
    ).href
  );
}

async function importCallbackRoute() {
  return import(
    new URL(
      `../../../app/api/v1/twitter/callback/route.ts?test=${Date.now()}-${Math.random()}`,
      import.meta.url,
    ).href
  );
}

describe("twitter oauth routes", () => {
  beforeEach(() => {
    mock.restore();
    restoreEnv();
    process.env.NEXT_PUBLIC_APP_URL = "https://www.elizacloud.ai";
  });

  afterEach(() => {
    mock.restore();
    restoreEnv();
  });

  test("connect preserves allowlisted loopback redirect targets", async () => {
    const requireAuthOrApiKeyWithOrg = mock(async () => ({
      user: {
        id: "user-1",
        organization_id: "org-1",
      },
    }));
    const cacheSet = mock(async () => {});
    const generateAuthLink = mock(async () => ({
      flow: "oauth2" as const,
      url: "https://x.com/i/oauth2/authorize?state=state-123",
      state: "state-123",
      codeVerifier: "verifier-123",
      redirectUri: "https://www.elizacloud.ai/api/v1/twitter/callback",
      scopes: ["tweet.read", "users.read"],
    }));

    mock.module("@/lib/auth", () => ({
      requireAuthOrApiKeyWithOrg,
    }));
    mock.module("@/lib/cache/client", () => ({
      cache: {
        set: cacheSet,
      },
    }));
    mock.module("@/lib/services/twitter-automation", () => ({
      twitterAutomationService: {
        isConfigured: () => true,
        generateAuthLink,
      },
    }));
    mock.module("@/lib/utils/logger", () => ({
      logger: {
        debug() {},
        error() {},
        info() {},
        warn() {},
      },
    }));

    const { POST } = await importConnectRoute();
    const redirectUrl =
      "http://localhost:2138/api/lifeops/connectors/x/success?side=owner&mode=cloud_managed";
    const response = await POST(
      new NextRequest("https://www.elizacloud.ai/api/v1/twitter/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirectUrl }),
      }),
    );

    expect(response.status).toBe(200);
    expect(cacheSet).toHaveBeenCalledTimes(1);

    const [cacheKey, cacheValue, ttlSeconds] = cacheSet.mock.calls[0] as unknown as [
      string,
      string,
      number,
    ];
    expect(cacheKey).toBe("twitter_oauth2:state-123");
    expect(ttlSeconds).toBe(600);
    expect(JSON.parse(cacheValue)).toMatchObject({
      organizationId: "org-1",
      userId: "user-1",
      connectionRole: "owner",
      redirectUrl,
    });
  });

  test("callback redirects OAuth2 completions back to loopback success URL", async () => {
    const cacheGet = mock(async () =>
      JSON.stringify({
        codeVerifier: "verifier-123",
        redirectUri: "https://www.elizacloud.ai/api/v1/twitter/callback",
        organizationId: "org-1",
        userId: "user-1",
        connectionRole: "owner",
        redirectUrl:
          "http://localhost:2138/api/lifeops/connectors/x/success?side=owner&mode=cloud_managed",
      }),
    );
    const cacheDel = mock(async () => {});
    const exchangeOAuth2Token = mock(async () => ({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      scope: ["tweet.read", "users.read", "dm.read", "dm.write", "offline.access"],
      screenName: "milady",
      userId: "x-user-1",
    }));
    const storeCredentials = mock(async () => {});
    const invalidateOAuthState = mock(async () => {});

    mock.module("@/lib/cache/client", () => ({
      cache: {
        get: cacheGet,
        del: cacheDel,
      },
    }));
    mock.module("@/lib/services/twitter-automation", () => ({
      twitterAutomationService: {
        exchangeOAuth2Token,
        storeCredentials,
      },
    }));
    mock.module("@/lib/services/oauth/invalidation", () => ({
      invalidateOAuthState,
    }));
    mock.module("@/lib/utils/logger", () => ({
      logger: {
        debug() {},
        error() {},
        info() {},
        warn() {},
      },
    }));

    const { GET } = await importCallbackRoute();
    const response = await GET(
      new NextRequest(
        "https://www.elizacloud.ai/api/v1/twitter/callback?code=code-123&state=state-123",
      ),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();

    const redirectTarget = new URL(location!);
    expect(redirectTarget.origin).toBe("http://localhost:2138");
    expect(redirectTarget.pathname).toBe("/api/lifeops/connectors/x/success");
    expect(redirectTarget.searchParams.get("side")).toBe("owner");
    expect(redirectTarget.searchParams.get("mode")).toBe("cloud_managed");
    expect(redirectTarget.searchParams.get("twitter_connected")).toBe("true");
    expect(redirectTarget.searchParams.get("twitter_username")).toBe("milady");
    expect(redirectTarget.searchParams.get("twitter_role")).toBe("owner");

    expect(exchangeOAuth2Token).toHaveBeenCalledWith(
      "code-123",
      "verifier-123",
      "https://www.elizacloud.ai/api/v1/twitter/callback",
    );
    expect(storeCredentials).toHaveBeenCalledTimes(1);
    expect(invalidateOAuthState).toHaveBeenCalledWith("org-1", "twitter", "user-1");
  });
});
