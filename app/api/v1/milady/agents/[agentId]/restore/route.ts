import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Restore may trigger re-provision

const CORS_METHODS = "POST, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

const restoreSchema = z.object({
  backupId: z.string().uuid().optional(),
});

/**
 * POST /api/v1/milady/agents/[agentId]/restore
 * Restore a sandbox from a specific backup (or the latest backup).
 *
 * If the sandbox is running, pushes state directly.
 * If the sandbox is stopped, re-provisions and restores.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;
    const body = await request.json();

    const parsed = restoreSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        NextResponse.json(
          {
            success: false,
            error: "Invalid request",
            details: parsed.error.issues,
          },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }

    const result = await miladySandboxService.restore(
      agentId,
      user.organization_id,
      parsed.data.backupId,
    );

    if (!result.success) {
      const status =
        result.error === "Agent not found"
          ? 404
          : result.error === "No backup found"
            ? 404
            : result.error === "Stopped agents can only restore the latest backup"
              ? 409
              : 500;

      return applyCorsHeaders(
        NextResponse.json({ success: false, error: result.error }, { status }),
        CORS_METHODS,
      );
    }

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          restoredFromBackupId: result.backup!.id,
          snapshotType: result.backup!.snapshot_type,
          createdAt: result.backup!.created_at,
        },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
