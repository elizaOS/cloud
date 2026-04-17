import { NextRequest, NextResponse } from "next/server";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";

const CORS_METHODS = "GET, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

/**
 * GET /api/v1/milady/agents/[agentId]/backups
 * List state backups for a Milady cloud agent.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;

    const backups = await miladySandboxService.listBackups(
      agentId,
      user.organization_id,
    );

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: backups.map((b) => ({
          id: b.id,
          snapshotType: b.snapshot_type,
          sizeBytes: b.size_bytes,
          vercelSnapshotId: b.vercel_snapshot_id,
          createdAt: b.created_at,
        })),
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
