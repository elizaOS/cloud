/**
 * Proxy Middleware - Auth caching
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";
import { Redis } from "@upstash/redis";

const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
);

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) redis = new Redis({ url, token });
  return redis;
}

const AUTH_CACHE_TTL = 300;

interface CachedAuth {
  valid: boolean;
  userId?: string;
  /** Token expiration (unix timestamp, seconds) */
  expiration?: number;
  cachedAt: number;
}

function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(token.length, 100); i++) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function getCachedAuth(token: string): Promise<CachedAuth | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const cached = await client.get<string>(`proxy:auth:${hashToken(token)}`);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

async function setCachedAuth(token: string, auth: CachedAuth): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.setex(
      `proxy:auth:${hashToken(token)}`,
      AUTH_CACHE_TTL,
      JSON.stringify(auth),
    );
  } catch {
    /* ignore */
  }
}

function isJwtExpiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; claim?: unknown; reason?: unknown };
  return (
    e.code === "ERR_JWT_EXPIRED" ||
    (e.claim === "exp" && e.reason === "check_failed")
  );
}

const publicPaths = [
  "/",
  "/marketplace",
  "/payment/success",
  "/dashboard/chat",
  "/chat",
  "/api/eliza",
  "/api/models",
  "/api/fal/proxy",
  "/api/og",
  "/api/public",
  "/auth/error",
  "/auth/cli-login",
  "/api/auth/cli-session",
  "/api/set-anonymous-session",
  "/api/anonymous-session",
  "/api/affiliate",
  "/api/v1/generate-image",
  "/api/v1/generate-video",
  "/api/v1/chat",
  "/api/v1/chat/completions",
  "/api/v1/responses",
  "/api/v1/embeddings",
  "/api/v1/models",
  "/api/v1/credits/topup",
  "/api/stripe/webhook",
  "/api/crypto/webhook",
  "/api/privy/webhook",
  "/api/cron",
  "/api/v1/cron",
  "/api/mcps",
  "/api/mcp/list",
  "/api/mcp",
  "/api/a2a",
  "/api/agents",
  "/api/v1/track",
  "/api/v1/discord/callback", // Discord OAuth callback (redirects from Discord)
  "/api/v1/app-auth",
  "/app-auth",
  "/.well-known",
];

// Public endpoint patterns that need special matching (e.g., /api/v1/apps/[id]/public)
const publicPathPatterns = [
  /^\/api\/v1\/apps\/[^/]+\/public$/,
  /^\/api\/characters\/[^/]+\/public$/,
];

const protectedPaths = [
  "/dashboard",
  "/api/v1/user",
  "/api/v1/organization",
  "/api/v1/api-keys",
  "/api/v1/usage",
  "/api/v1/generations",
  "/api/v1/containers",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const startTime = Date.now();

  // Handle CORS preflight (OPTIONS) requests for API routes
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID, Cookie, X-Miniapp-Token, X-Anonymous-Session",
        "Access-Control-Max-Age": "86400",
        "X-Proxy-Time": `${Date.now() - startTime}ms`,
      },
    });
  }

  const isPublicPath =
    publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    publicPathPatterns.some((pattern) => pattern.test(pathname));
  if (isPublicPath) {
    const response = NextResponse.next();
    response.headers.set("X-Proxy-Time", `${Date.now() - startTime}ms`);
    return response;
  }

  const isProtectedPath = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtectedPath && !pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  try {
    const authToken = request.cookies.get("privy-token");
    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    const apiKey = request.headers.get("X-API-Key");

    if (apiKey || (bearerToken && bearerToken.startsWith("eliza_"))) {
      const response = NextResponse.next();
      response.headers.set("X-Proxy-Time", `${Date.now() - startTime}ms`);
      return response;
    }

    const token = bearerToken || authToken?.value;

    if (!token) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    const cachedAuth = await getCachedAuth(token);
    if (cachedAuth?.valid && cachedAuth.userId) {
      // Ensure we never accept a cached auth result past token expiration.
      if (cachedAuth.expiration) {
        const now = Math.floor(Date.now() / 1000);
        if (cachedAuth.expiration <= now) {
          await setCachedAuth(token, { valid: false, cachedAt: Date.now() });
        } else {
          const requestHeaders = new Headers(request.headers);
          requestHeaders.set("x-privy-user-id", cachedAuth.userId);
          requestHeaders.set("x-auth-cached", "true");
          const response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          response.headers.set("X-Proxy-Time", `${Date.now() - startTime}ms`);
          response.headers.set("X-Auth-Cached", "true");
          return response;
        }
      } else {
        // Backwards-compatible cache entry (no expiration stored)
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-privy-user-id", cachedAuth.userId);
        requestHeaders.set("x-auth-cached", "true");
        const response = NextResponse.next({
          request: { headers: requestHeaders },
        });
        response.headers.set("X-Proxy-Time", `${Date.now() - startTime}ms`);
        response.headers.set("X-Auth-Cached", "true");
        return response;
      }
    }

    let user: Awaited<ReturnType<typeof privyClient.verifyAuthToken>> | null =
      null;
    try {
      user = await privyClient.verifyAuthToken(token);
    } catch (error) {
      // Token expiry is an expected state; don't treat it as middleware failure.
      if (isJwtExpiredError(error)) {
        await setCachedAuth(token, { valid: false, cachedAt: Date.now() });
        if (pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Token expired" }, { status: 401 });
        }
        const url = request.nextUrl.clone();
        url.pathname = "/";
        // Best-effort cleanup so clients stop sending expired tokens.
        const response = NextResponse.redirect(url);
        response.cookies.delete("privy-token");
        response.cookies.delete("privy-id-token");
        return response;
      }
      throw error;
    }

    if (!user) {
      await setCachedAuth(token, { valid: false, cachedAt: Date.now() });
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Invalid authentication token" },
          { status: 401 },
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    await setCachedAuth(token, {
      valid: true,
      userId: user.userId,
      expiration:
        typeof (user as unknown as { expiration?: unknown }).expiration ===
        "number"
          ? ((user as unknown as { expiration: number }).expiration as number)
          : undefined,
      cachedAt: Date.now(),
    });

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-privy-user-id", user.userId);
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set("X-Proxy-Time", `${Date.now() - startTime}ms`);
    return response;
  } catch (error) {
    // Unexpected middleware failures only.
    console.error("Middleware auth error:", error);
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/error";
    url.searchParams.set("reason", "auth_failed");
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
