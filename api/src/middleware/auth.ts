/**
 * Global auth middleware — Hono port of `cloud/proxy.ts`.
 *
 * Behavior:
 *   - Public paths pass through with no auth.
 *   - Programmatic auth (X-API-Key, Bearer eliza_*) — pass through; per-route
 *     handlers validate the key against the DB.
 *   - Cookie tokens (privy-token / steward-token) — verify via Privy SDK
 *     with Upstash REST cache, then set `c.set("user", ...)` and
 *     `x-privy-user-id` request header for downstream rate limiters.
 *   - Unknown / expired token on a protected /api/ path -> 401.
 *
 * This middleware is mounted globally before the router in src/index.ts.
 */

import type { MiddlewareHandler } from "hono";

import { getCurrentUser } from "../lib/auth";
import type { AppEnv } from "../lib/context";
import { jsonError } from "../lib/errors";

const publicPathPrefixes = [
  "/api/health",
  "/api/og",
  "/api/openapi.json",
  "/api/eliza",
  "/api/fal/proxy",
  "/api/public",
  "/api/auth/pair",
  "/api/auth/siwe",
  "/api/auth/steward-session",
  "/api/auth/steward-debug",
  "/api/set-anonymous-session",
  "/api/anonymous-session",
  "/api/auth/create-anonymous-session",
  "/api/affiliate",
  "/api/v1/generate-image",
  "/api/v1/generate-video",
  "/api/v1/chat",
  "/api/v1/messages",
  "/api/v1/responses",
  "/api/v1/embeddings",
  "/api/v1/models",
  "/api/v1/credits/topup",
  "/api/v1/topup",
  "/api/stripe/credit-packs",
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
  "/api/v1/discovery",
  "/api/v1/discord/callback",
  "/api/v1/twitter/callback",
  "/api/v1/oauth/providers",
  "/api/v1/oauth/callback",
  "/api/v1/app-auth",
  "/api/.well-known",
  "/api/internal",
  "/api/webhooks",
  "/api/v1/telegram/webhook",
  "/api/eliza-app/auth",
  "/api/eliza-app/webhook",
  "/api/eliza-app/user",
  "/api/eliza-app/cli-auth",
  "/api/eliza-app/provision-agent",
  "/api/eliza-app/gateway",
];

function isPublicPath(pathname: string): boolean {
  return publicPathPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const url = new URL(c.req.url);
  const pathname = url.pathname;

  if (!pathname.startsWith("/api/")) {
    await next();
    return;
  }

  if (isPublicPath(pathname)) {
    await next();
    return;
  }

  // Programmatic auth: per-route handlers validate the key. Skip cookie auth.
  const apiKey = c.req.header("X-API-Key") || c.req.header("x-api-key");
  const auth = c.req.header("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const elizaBearer = bearer?.startsWith("eliza_") ?? false;
  if (apiKey || elizaBearer) {
    await next();
    return;
  }

  // Cookie / Privy JWT path. Resolve the user; on failure return 401 for /api/.
  const user = await getCurrentUser(c);
  if (!user) {
    return jsonError(c, 401, "Unauthorized", "authentication_required");
  }
  await next();
};
