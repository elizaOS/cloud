/**
 * GET /api/v1/oauth/connections/:id - Get a specific OAuth connection
 * DELETE /api/v1/oauth/connections/:id - Revoke a connection
 */

import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  Errors,
  internalErrorResponse,
  OAuthError,
  oauthService,
} from "@/lib/services/oauth";
import { invalidateOAuthState } from "@/lib/services/oauth/invalidation";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function getAccessibleConnection(
  organizationId: string,
  userId: string,
  connectionId: string,
) {
  const connections = await oauthService.listConnections({
    organizationId,
    userId,
  });
  return (
    connections.find((connection) => connection.id === connectionId) || null
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: connectionId } = await params;
  let organizationId: string | undefined;

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    organizationId = user.organization_id;

    logger.debug("[API] GET /api/v1/oauth/connections/:id", {
      organizationId,
      connectionId,
    });

    const connection = await getAccessibleConnection(
      organizationId,
      user.id,
      connectionId,
    );

    if (!connection) {
      const error = Errors.connectionNotFound(connectionId);
      return NextResponse.json(error.toResponse(), { status: 404 });
    }

    return NextResponse.json({
      connection: {
        ...connection,
        linkedAt: connection.linkedAt.toISOString(),
        lastUsedAt: connection.lastUsedAt?.toISOString(),
      },
    });
  } catch (error) {
    logger.error("[API] GET /api/v1/oauth/connections/:id error", {
      organizationId,
      connectionId,
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

    return NextResponse.json(
      internalErrorResponse("Failed to get connection"),
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: connectionId } = await params;
  let organizationId: string | undefined;
  let userId: string | undefined;

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    organizationId = user.organization_id;
    userId = user.id;

    logger.info("[API] DELETE /api/v1/oauth/connections/:id", {
      organizationId,
      connectionId,
    });

    const connection = await getAccessibleConnection(
      organizationId,
      userId,
      connectionId,
    );
    if (!connection) {
      const error = Errors.connectionNotFound(connectionId);
      return NextResponse.json(error.toResponse(), { status: 404 });
    }

    await oauthService.revokeConnection({
      organizationId,
      connectionId: connection.id,
    });

    await invalidateOAuthState(organizationId, "oauth", userId, {
      skipVersionBump: true,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[API] DELETE /api/v1/oauth/connections/:id error", {
      organizationId,
      connectionId,
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

    return NextResponse.json(
      internalErrorResponse("Failed to revoke connection"),
      { status: 500 },
    );
  }
}
