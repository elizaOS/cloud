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
  "/api/auth/miniapp-session",
  "/auth/miniapp-login",
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
  "/api/mcp/demos",
  "/api/mcp/list",
  "/api/mcp",
  "/api/a2a",
  "/api/agents",
  "/api/v1/track",
  "/.well-known",
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
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-API-Key, X-Request-ID, Cookie, X-Miniapp-Token, X-Anonymous-Session",
        "Access-Control-Max-Age": "86400",
        "X-Proxy-Time": `${Date.now() - startTime}ms`,
      },
    });
  }

  const isPublicPath = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
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

    const user = await privyClient.verifyAuthToken(token);

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
