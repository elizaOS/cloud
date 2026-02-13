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
import { CacheTTL, CacheKeys } from "@/lib/cache/keys";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { getAppUrl } from "@/lib/utils/app-url";

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

  // Check cache availability first. If Redis is down, fail fast rather than
  // returning a nonce that can't be validated in the verify endpoint.
  if (!cache.isAvailable()) {
    return NextResponse.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Authentication service temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }

  // viem's generateSiweNonce produces an EIP-4361-compliant alphanumeric nonce,
  // which is required by the SIWE spec. Don't use crypto.randomBytes here.
  const nonce = generateSiweNonce();
  try {
    await cache.set(CacheKeys.siwe.nonce(nonce), true, CacheTTL.siwe.nonce);
    // Verify the nonce was actually persisted. cache.set() returns Promise<void>
    // and becomes a silent no-op when cache is disabled/misconfigured, so we must
    // read it back to confirm the write actually succeeded.
    const stored = await cache.get(CacheKeys.siwe.nonce(nonce));
    if (!stored) {
      throw new Error("Nonce not persisted after cache.set");
    }
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
  const appUrl = getAppUrl();
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
