import { type NextRequest, NextResponse } from "next/server";
import { generateSiweNonce } from "viem/siwe";
import { cache } from "@/lib/cache/client";
import { CacheTTL, CacheKeys } from "@/lib/cache/keys";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { getAppUrl } from "@/lib/utils/app-url";

declare module '@/lib/cache/client' {
  interface CacheClient {
    isAvailable(): boolean | Promise<boolean>;
  }
}

async function handleGetNonce(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const chainIdParam = searchParams.get("chainId");
 
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

  try {
    if (typeof cache.isAvailable === "function") {
      const available = await cache.isAvailable();
      if (!available) {
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
  }

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

  // Verify the nonce was persisted
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
  
  if (!verified) {
    return NextResponse.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Unable to persist nonce. Please retry.", 
      },
      { status: 503 },
    );
  }

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
