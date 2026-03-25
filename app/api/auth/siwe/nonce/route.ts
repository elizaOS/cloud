import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { getAppHost, getAppUrl } from "@/lib/utils/app-url";

/**
 * GET /api/auth/siwe/nonce
 * Returns a one-time nonce and SIWE message parameters for EIP-4361.
 * WHY Redis: nonce must be consumed once on verify; 503 if unavailable so we don't issue keys without replay protection.
 * Rate limit STRICT to prevent nonce flooding.
 */
async function handler(request: NextRequest) {
  const chainId = Number.parseInt(request.nextUrl.searchParams.get("chainId") ?? "1", 10);

  if (!cache.isAvailable()) {
    return NextResponse.json({ error: "Nonce storage unavailable" }, { status: 503 });
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  await cache.set(CacheKeys.siwe.nonce(nonce), nonce, CacheTTL.siwe.nonce);

  return NextResponse.json(
    {
      nonce,
      domain: getAppHost(),
      uri: getAppUrl(),
      chainId: Number.isNaN(chainId) ? 1 : chainId,
      version: "1",
      statement: "Sign in to Eliza Cloud",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export const GET = withRateLimit(handler, RateLimitPresets.STRICT);
