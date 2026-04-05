/**
 * GET /api/v1/oauth/connections/:id/token
 *
 * Get a valid access token for a connection.
 * Returns cached tokens when available and auto-refreshes OAuth2 tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { internalErrorResponse, OAuthError, oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: connectionId } = await params;
  let organizationId: string | undefined;

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    organizationId = user.organization_id;

    logger.debug("[API] GET /api/v1/oauth/connections/:id/token", {
      organizationId,
      connectionId,
    });

    const token = await oauthService.getValidToken({
      organizationId,
      connectionId,
    });

    return NextResponse.json({
      accessToken: token.accessToken,
      accessTokenSecret: token.accessTokenSecret,
      expiresAt: token.expiresAt?.toISOString(),
      scopes: token.scopes,
      refreshed: token.refreshed,
      fromCache: token.fromCache,
    });
  } catch (error) {
    logger.error("[API] GET /api/v1/oauth/connections/:id/token error", {
      organizationId,
      connectionId,
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
