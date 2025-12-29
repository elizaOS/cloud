/**
 * Proxy Middleware - Auth caching and subdomain routing
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyOAuth3Token } from "./lib/auth/oauth3-client";
import { Redis } from "@upstash/redis";

// ============================================================================
// Redis Auth Caching
// ============================================================================

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

// ============================================================================
// Subdomain/Custom Domain Configuration
// ============================================================================

const APP_DOMAIN = process.env.APP_DOMAIN || "apps.elizacloud.ai";
const MAIN_DOMAINS = [
  "localhost",
  "elizacloud.ai",
  "www.elizacloud.ai",
  "cloud.eliza.ai",
  "eliza.ai",
];

// Reserved subdomains that cannot be used for apps
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "admin",
  "dashboard",
  "app",
  "apps",
  "auth",
  "login",
  "signup",
  "register",
  "account",
  "settings",
  "billing",
  "docs",
  "help",
  "support",
  "status",
  "cdn",
  "static",
  "assets",
  "media",
  "images",
  "files",
  "mail",
  "email",
  "smtp",
  "ftp",
  "ssh",
  "git",
  "svn",
  "blog",
  "news",
  "forum",
  "community",
  "store",
  "shop",
  "cart",
  "checkout",
  "pay",
  "payments",
  "webhook",
  "webhooks",
  "ws",
  "wss",
  "socket",
  "graphql",
  "rest",
  "v1",
  "v2",
  "v3",
  "staging",
  "dev",
  "test",
  "demo",
  "preview",
  "beta",
  "alpha",
  "internal",
  "private",
  "public",
  "sandbox",
  "debug",
]);

// ============================================================================
// Public and Protected Paths
// ============================================================================

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
  "/auth/cli-login", // CLI login page
  "/api/auth/cli-session", // CLI session endpoints (public for polling)
  "/api/auth/miniapp-session", // Miniapp session endpoints
  "/api/auth/app-session", // App session endpoints (public for pass-through auth flow)
  "/api/auth/oauth3", // OAuth3 session endpoints
  "/auth/miniapp-login", // Miniapp login page
  "/auth/app-login", // App login page
  "/api/set-anonymous-session", // Anonymous session cookie setting
  "/api/anonymous-session", // Anonymous session data API (for polling message count)
  "/api/affiliate", // Affiliate API endpoints (public for anonymous users)
  "/api/v1/generate-image",
  "/api/v1/generate-video",
  "/api/v1/chat",
  "/api/v1/chat/completions",
  "/api/v1/responses",
  "/api/v1/embeddings",
  "/api/v1/models",
  "/api/v1/credits/topup",
  "/api/stripe/webhook",
  "/api/crypto/webhook", // OxaPay crypto payment webhook
  "/api/privy/webhook", // Privy webhook endpoint (legacy)
  "/api/cron", // Cron endpoints (protected by CRON_SECRET)
  "/api/v1/cron", // V1 Cron endpoints (protected by CRON_SECRET)
  "/api/mcp/demos", // Public demo MCP servers (GET returns server info)
  "/api/mcp/list", // Public MCP server list
  "/api/mcp", // MCP protocol endpoint (uses API key or x402 auth)
  "/api/a2a", // A2A protocol endpoint (uses API key or x402 auth)
  "/api/agents", // Agent-specific A2A/MCP endpoints (handle their own auth)
  "/.well-known", // ERC-8004 and A2A discovery files
  "/api/v1/discovery", // Public discovery endpoints for ERC-8004 marketplace
  "/api/v1/erc8004", // ERC-8004 status endpoints
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

// ============================================================================
// Proxy Function
// ============================================================================

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "";
  const startTime = Date.now();

  // ============================================================================
  // Subdomain/Custom Domain Routing
  // ============================================================================

  // Skip subdomain routing for API routes and static files
  const skipSubdomainRouting =
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/static/") ||
    pathname.includes(".");

  if (!skipSubdomainRouting) {
    // Check if this is an app subdomain request (e.g., myapp.apps.elizacloud.ai)
    if (hostname.endsWith(`.${APP_DOMAIN}`)) {
      const subdomain = hostname.replace(`.${APP_DOMAIN}`, "");

      // Check for reserved subdomains
      if (!RESERVED_SUBDOMAINS.has(subdomain.toLowerCase())) {
        // Rewrite to app serving route
        const url = request.nextUrl.clone();
        url.pathname = `/app/${subdomain}${pathname}`;
        return NextResponse.rewrite(url);
      }
    }

    // Check if this is a custom domain (not main domain or app domain)
    const isMainDomain = MAIN_DOMAINS.some(
      (d) =>
        hostname === d ||
        hostname.endsWith(`.${d}`) ||
        hostname.includes("localhost"),
    );

    if (!isMainDomain && !hostname.includes(APP_DOMAIN)) {
      // This could be a custom domain - rewrite to custom domain handler
      const url = request.nextUrl.clone();
      url.pathname = `/app/_custom/${encodeURIComponent(hostname)}${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // ============================================================================
  // Authentication Logic
  // ============================================================================

  // Allow OPTIONS requests through for CORS preflight
  if (request.method === "OPTIONS") {
    return NextResponse.next();
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
    // Check for OAuth3 token in cookies first, then legacy Privy token
    let authToken = request.cookies.get("oauth3-token");
    if (!authToken) {
      authToken = request.cookies.get("privy-token");
    }

    // Check for Bearer token in Authorization header (for API routes)
    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    const apiKey = request.headers.get("X-API-Key");
    const appToken = request.headers.get("X-App-Token");

    // If API key or app token is provided, allow through (will be validated in the route handler)
    if (
      apiKey ||
      appToken ||
      (bearerToken && bearerToken.startsWith("eliza_"))
    ) {
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

    // Check cache first
    const cachedAuth = await getCachedAuth(token);
    if (cachedAuth?.valid && cachedAuth.userId) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-oauth3-identity-id", cachedAuth.userId);
      requestHeaders.set("x-privy-user-id", `oauth3:${cachedAuth.userId}`);
      requestHeaders.set("x-auth-cached", "true");
      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });
      response.headers.set("X-Proxy-Time", `${Date.now() - startTime}ms`);
      response.headers.set("X-Auth-Cached", "true");
      return response;
    }

    // Verify the token with OAuth3
    const claims = await verifyOAuth3Token(token);

    if (!claims) {
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
      userId: claims.identityId,
      cachedAt: Date.now(),
    });

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-oauth3-identity-id", claims.identityId);
    requestHeaders.set("x-oauth3-session-id", claims.sessionId);
    // Legacy header for backwards compatibility
    requestHeaders.set("x-privy-user-id", `oauth3:${claims.identityId}`);

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

// Export for use by other modules
export { RESERVED_SUBDOMAINS };
