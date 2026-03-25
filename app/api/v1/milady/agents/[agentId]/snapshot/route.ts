import { NextRequest, NextResponse } from "next/server";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "POST, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

/**
 * POST /api/v1/milady/agents/[agentId]/snapshot
 * Trigger a manual state backup of the running sandbox.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;

    const result = await miladySandboxService.snapshot(agentId, user.organization_id, "manual");

    if (!result.success) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: result.error },
          { status: result.error === "Sandbox is not running" ? 409 : 500 },
        ),
        CORS_METHODS,
      );
    }

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          backupId: result.backup!.id,
          snapshotType: result.backup!.snapshot_type,
          sizeBytes: result.backup!.size_bytes,
          createdAt: result.backup!.created_at,
        },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
