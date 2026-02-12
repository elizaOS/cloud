/**
 * Bluesky AT Protocol OAuth Initiate Route
 *
 * POST /api/v1/oauth/bluesky/initiate
 *
 * Custom initiate route for Bluesky OAuth. Unlike standard OAuth2 providers,
 * AT Protocol requires the user's handle for identity resolution
 * (handle → DID → PDS → authorization server).
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { initiateBlueskyAuth } from "@/lib/services/oauth/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface BlueskyInitiateBody {
  handle: string;
  redirectUrl?: string;
}

async function handleInitiate(request: NextRequest): Promise<NextResponse> {
  let user;
  try {
    const auth = await requireAuthOrApiKeyWithOrg(request);
    user = auth.user;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Authentication required";
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: msg },
      { status: 401 },
    );
  }

  let body: BlueskyInitiateBody;
  try {
    body = (await request.json()) as BlueskyInitiateBody;
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_REQUEST",
        message:
          "Request body must be JSON with a 'handle' field (e.g., 'alice.bsky.social')",
      },
      { status: 400 },
    );
  }

  if (!body.handle || typeof body.handle !== "string") {
    return NextResponse.json(
      {
        error: "HANDLE_REQUIRED",
        message:
          "Bluesky handle is required (e.g., 'alice.bsky.social')",
      },
      { status: 400 },
    );
  }

  const handle = body.handle.trim();

  logger.info("[Bluesky OAuth] Initiating auth", {
    organizationId: user.organization_id,
    userId: user.id,
    handle,
  });

  try {
    const result = await initiateBlueskyAuth({
      organizationId: user.organization_id,
      userId: user.id,
      handle,
      redirectUrl: body.redirectUrl,
    });

    return NextResponse.json({
      authUrl: result.authUrl,
      provider: {
        id: "bluesky",
        name: "Bluesky",
      },
    });
  } catch (error) {
    logger.error("[Bluesky OAuth] Initiate failed", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: "INITIATE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Failed to initiate Bluesky OAuth",
      },
      { status: 500 },
    );
  }
}

function getIpKey(request: NextRequest): string {
  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return `oauth:bluesky:initiate:ip:${ip}`;
}

export const POST = withRateLimit(handleInitiate, {
  windowMs: 60000,
  maxRequests: 10,
  keyGenerator: getIpKey,
});
