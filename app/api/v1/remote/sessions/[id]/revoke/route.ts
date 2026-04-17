/**
 * POST /api/v1/remote/sessions/:id/revoke
 *
 * T9a — Revokes an active or pending remote session. Only the owning
 * organization can revoke.
 */

import { NextRequest, NextResponse } from "next/server";
import { remoteSessionsRepository } from "@/db/repositories/remote-sessions";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "POST, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await params;

    const existing = await remoteSessionsRepository.findByIdAndOrg(id, user.organization_id);
    if (!existing) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: "Session not found" }, { status: 404 }),
        CORS_METHODS,
      );
    }

    if (existing.status === "revoked" || existing.status === "denied") {
      return applyCorsHeaders(
        NextResponse.json({
          success: true,
          data: { id: existing.id, status: existing.status, alreadyEnded: true },
        }),
        CORS_METHODS,
      );
    }

    const revoked = await remoteSessionsRepository.revoke(id, user.organization_id);
    if (!revoked) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: "Revoke failed" }, { status: 409 }),
        CORS_METHODS,
      );
    }

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: { id: revoked.id, status: revoked.status, endedAt: revoked.ended_at },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
