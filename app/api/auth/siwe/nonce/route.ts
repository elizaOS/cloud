/**
 * SIWE Nonce Endpoint
 *
 * Returns a one-time nonce and all parameters an agent needs to construct a valid
 * EIP-4361 SIWE message. By returning domain, uri, chainId, version, and statement
 * from the server, agents don't need to guess or hardcode these values -- they just
 * sign what we give them.
 *
 * Nonces are stored in Redis with a 5-minute TTL and consumed on verify. This
 * prevents replay attacks: each nonce can only be used once, and stale nonces
 * expire automatically.
 *
 * Rate limited with STRICT preset because this is an unauthenticated endpoint
 * that creates server-side state (Redis entries).
 */

import { type NextRequest, NextResponse } from "next/server";
import { generateSiweNonce } from "viem/siwe";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

async function handleGetNonce(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chainIdParam = searchParams.get("chainId");

  // Default to Ethereum mainnet (1). Agents pass their chain so the SIWE
  // message reflects the correct network context for wallet UIs.
  let chainId = 1;
  if (chainIdParam) {
    const parsed = parseInt(chainIdParam, 10);
    if (isNaN(parsed) || parsed <= 0) {
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          message: "chainId must be a positive integer.",
        },
        { status: 400 },
      );
    }
    chainId = parsed;
  }

  // viem's generateSiweNonce produces an EIP-4361-compliant alphanumeric nonce,
  // which is required by the SIWE spec. Don't use crypto.randomBytes here.
  const nonce = generateSiweNonce();

  try {
    await cache.set(CacheKeys.siwe.nonce(nonce), true, CacheTTL.siwe.nonce);
  } catch {
    return NextResponse.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Unable to generate nonce. Please try again later.",
      },
      { status: 503 },
    );
  }

  // Derive domain and uri from the canonical app URL so the verify endpoint
  // can enforce domain binding against phishing.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const url = new URL(appUrl);

  return NextResponse.json({
    nonce,
    domain: url.hostname,
    uri: appUrl,
    chainId,
    version: "1",
    statement: "Sign in to ElizaCloud",
  });
}

export const GET = withRateLimit(handleGetNonce, RateLimitPresets.STRICT);
