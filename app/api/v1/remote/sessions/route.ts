/**
 * GET /api/v1/remote/sessions?agentId=...
 *
 * T9a — Lists active (pending/active) remote sessions for the given agent
 * scoped to the caller's organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { remoteSessionsRepository } from "@/db/repositories/remote-sessions";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "GET, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const agentId = request.nextUrl.searchParams.get("agentId")?.trim() ?? "";
    if (!agentId) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "agentId query parameter is required" },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }

    const sandbox = await miladySandboxesRepository.findByIdAndOrg(
      agentId,
      user.organization_id,
    );
    if (!sandbox) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Agent not found" },
          { status: 404 },
        ),
        CORS_METHODS,
      );
    }

    const sessions = await remoteSessionsRepository.listActiveByAgent(
      agentId,
      user.organization_id,
    );

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          sessions: sessions.map((s) => ({
            id: s.id,
            status: s.status,
            requesterIdentity: s.requester_identity,
            ingressUrl: s.ingress_url,
            ingressReason: s.ingress_reason,
            createdAt: s.created_at,
            updatedAt: s.updated_at,
          })),
        },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
