import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/milady/agents/[agentId]/snapshot
 * Trigger a manual state backup of the running sandbox.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  const result = await miladySandboxService.snapshot(
    agentId,
    user.organization_id,
    "manual",
  );

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error === "Sandbox is not running" ? 409 : 500 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      backupId: result.backup!.id,
      snapshotType: result.backup!.snapshot_type,
      sizeBytes: result.backup!.size_bytes,
      createdAt: result.backup!.created_at,
    },
  });
}
