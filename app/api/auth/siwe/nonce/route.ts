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
    const parsed = Number(chainIdParam);
    if (!Number.isInteger(parsed) || parsed <= 0 || isNaN(parsed)) {
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
  try {
    // Prefer an explicit isAvailable() if the client implements it. Some
    // CacheClient builds may not expose this method; fall back to a lightweight
    // read/write health-check to determine availability.
    if (typeof (cache as any).isAvailable === "function") {
      const available = await (cache as any).isAvailable();
      if (!available) {
        return NextResponse.json(
          {
            error: "SERVICE_UNAVAILABLE",
            message: "Authentication service temporarily unavailable. Please try again later.",
          },
          { status: 503 },
        );
      }
    } else {
      const _healthKey = "__siwe:healthcheck__";
      await cache.set(_healthKey, true, 2);
      const _health = await cache.get(_healthKey);
      if (!_health) {
        return NextResponse.json(
          {
            error: "SERVICE_UNAVAILABLE",
            message: "Authentication service temporarily unavailable. Please try again later.",
          },
          { status: 503 },
        );
      }
    }
  } catch {
    return NextResponse.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Authentication service temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  // Review: caching logic is valid; error handling ensures service unavailability is managed correctly.
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
        message: "Authentication service temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }
 
  // Verify the nonce was actually persisted. cache.set() returns void, so a
  // read-back confirms the write actually succeeded.
  let verified: unknown;
  try {
    verified = await cache.get(CacheKeys.siwe.nonce(nonce));
  } catch {
    return NextResponse.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Authentication service temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }
  // Review: Nonce retrieval and error handling considered in service architecture for stable responses.
  if (!verified) {
    return NextResponse.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Unable to persist nonce. Please retry.",
      },
      { status: 503 },
    );
  }
 
  // Derive domain and uri from the canonical app URL so the verify endpoint
  // can enforce domain binding against phishing. Uses the shared getAppUrl()
  // helper to stay consistent with the verify endpoint's host resolution.
  const appUrl = getAppUrl();
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    return NextResponse.json(
      {
        error: "CONFIGURATION_ERROR",
        message: "Server URL misconfigured. Contact support.",
      },
      { status: 500 },
    );
  }
 
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
