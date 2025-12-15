import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";

// Initialize Privy client
const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
);

// ============================================================================
// Subdomain/Custom Domain Configuration (merged from middleware.ts)
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

// Paths that don't require authentication
const publicPaths = [
  "/",
  "/marketplace",
  "/dashboard/chat", // FREE MODE: Allow anonymous access to Chat
  "/chat", // Public chat routes for anonymous users
  "/api/eliza", // Allow anonymous access to Eliza API routes
  "/api/models",
  "/api/fal/proxy",
  "/api/og", // OG image generation (must be public for social media crawlers)
  "/api/public", // Public API endpoints (marketplace, etc.)
  "/auth/error",
  "/auth/cli-login", // CLI login page
  "/api/auth/cli-session", // CLI session endpoints (public for polling)
  "/api/auth/app-session", // App session endpoints (public for pass-through auth flow)
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
  "/api/v1/credits/topup", // x402 credit top-up (uses x402 or API key auth)
  "/api/stripe/webhook",
  "/api/privy/webhook", // Privy webhook endpoint
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

// Paths that should be checked for authentication
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
  const hostname = request.headers.get("host") || "";
  const url = request.nextUrl.clone();

  // ============================================================================
  // Subdomain/Custom Domain Routing (merged from middleware.ts)
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

  // Check if path is explicitly public
  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (isPublicPath) {
    return NextResponse.next();
  }

  // Check if path needs protection
  const isProtectedPath = protectedPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // If not a protected path and not public, allow through
  // This handles static files, etc.
  if (!isProtectedPath && !pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Try to verify authentication
  try {
    // Check for auth token in cookies
    const authToken = request.cookies.get("privy-token");

    // Check for Bearer token in Authorization header (for API routes)
    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    // Check for API key (support both X-API-Key header and Bearer token)
    const apiKey = request.headers.get("X-API-Key");

    // Check for app token
    const appToken = request.headers.get("X-App-Token");

    // If API key or app token is provided, allow through (will be validated in the route handler)
    if (
      apiKey ||
      appToken ||
      (bearerToken && bearerToken.startsWith("eliza_"))
    ) {
      return NextResponse.next();
    }

    const token = bearerToken || authToken?.value;

    if (!token) {
      // No token found - return 401 for all protected routes
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // For web pages, redirect to home page where they can use the login modal
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    // Verify the token with Privy
    const user = await privyClient.verifyAuthToken(token);

    if (!user) {
      // Invalid token
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Invalid authentication token" },
          { status: 401 },
        );
      }

      // For web pages, redirect to home page where they can use the login modal
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    // Token is valid - add user info to headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-privy-user-id", user.userId);
    // Note: Email is not available from token claims - it's synced via webhooks

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error("Middleware auth error:", error);

    // Return error response
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
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

// Export for use by other modules
export { RESERVED_SUBDOMAINS };
