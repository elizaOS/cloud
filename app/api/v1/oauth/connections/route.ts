/**
 * GET /api/v1/oauth/connections
 *
 * List all OAuth connections for the authenticated organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { internalErrorResponse, OAuthError, oauthService } from "@/lib/services/oauth";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform") || undefined;
  const rawConnectionRole = searchParams.get("connectionRole");
  const connectionRole =
    rawConnectionRole === "owner" || rawConnectionRole === "agent" ? rawConnectionRole : undefined;
  let organizationId: string | undefined;

  if (rawConnectionRole && !connectionRole) {
    return NextResponse.json(
      {
        error: "INVALID_CONNECTION_ROLE",
        message: "connectionRole must be 'owner' or 'agent'",
      },
      { status: 400 },
    );
  }

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    organizationId = user.organization_id;

    logger.debug("[API] GET /api/v1/oauth/connections", {
      organizationId,
      platform,
      connectionRole,
    });

    const connections = await oauthService.listConnections({
      organizationId,
      userId: user.id,
      platform,
      connectionRole,
    });

    return NextResponse.json({
      connections: connections.map((conn) => ({
        ...conn,
        linkedAt: conn.linkedAt.toISOString(),
        lastUsedAt: conn.lastUsedAt?.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("[API] GET /api/v1/oauth/connections error", {
      organizationId,
      platform,
      connectionRole,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ApiError) {
      return NextResponse.json(error.toJSON(), { status: error.status });
    }

    if (error instanceof OAuthError) {
      return NextResponse.json(error.toResponse(), {
        status: error.httpStatus,
      });
    }

    return NextResponse.json(internalErrorResponse("Failed to list OAuth connections"), {
      status: 500,
    });
  }
}
