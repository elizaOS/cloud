/**
 * Generic OAuth Callback Route
 *
 * GET /api/v1/oauth/[platform]/callback
 *
 * Handles OAuth callback from providers that use the generic OAuth system.
 * Exchanges authorization code for tokens and stores the connection.
 *
 * Security:
 * - Rate limited to prevent brute-force attacks
 * - State parameter provides CSRF protection
 * - Redirect URL whitelist prevents open redirect attacks
 */

import type { NextRequest } from "next/server";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { handleGenericOAuthCallback } from "../../generic-callback";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Get IP address from request for rate limiting
 */
function getIpKey(request: NextRequest): string {
  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return `oauth:generic:callback:ip:${ip}`;
}

// Export with rate limiting: 10 requests per minute per IP
export const GET = withRateLimit(handleGenericOAuthCallback, {
  windowMs: 60000, // 1 minute
  maxRequests: 10,
  keyGenerator: getIpKey,
});
