/**
 * POST /api/v1/oauth/connect
 *
 * Initiate OAuth flow for a platform.
 * Returns an authorization URL for the user to visit.
 */

import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  internalErrorResponse,
  OAuthError,
  oauthService,
  validationErrorResponse,
} from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ConnectRequestBody {
  platform: string;
  redirectUrl?: string;
  scopes?: string[];
}

function isValidString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export async function POST(request: NextRequest) {
  let organizationId: string | undefined;
  let platform: string | undefined;

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    organizationId = user.organization_id;

    let body: ConnectRequestBody;
    try {
      body = (await request.json()) as ConnectRequestBody;
    } catch {
      return NextResponse.json(validationErrorResponse("Invalid JSON body"), { status: 400 });
    }

    if (!isValidString(body.platform)) {
      return NextResponse.json(
        validationErrorResponse("platform is required and must be a non-empty string"),
        { status: 400 },
      );
    }

    // Sanitize platform - lowercase and max 50 chars
    body.platform = body.platform.toLowerCase().slice(0, 50);
    platform = body.platform;

    logger.info("[API] POST /api/v1/oauth/connect", {
      organizationId,
      platform,
      hasScopes: !!body.scopes,
    });

    const result = await oauthService.initiateAuth({
      organizationId,
      userId: user.id,
      platform,
      redirectUrl: body.redirectUrl,
      scopes: body.scopes,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("[API] POST /api/v1/oauth/connect error", {
      organizationId,
      platform,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ApiError) {
      return NextResponse.json(error.toJSON(), { status: error.status });
    }

    if (error instanceof OAuthError) {
      return NextResponse.json(error.toResponse(), { status: error.httpStatus });
    }

    return NextResponse.json(internalErrorResponse(), { status: 500 });
  }
}
