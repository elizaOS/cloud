import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/milady/agents/[agentId]/backups
 * List state backups for a Milady cloud agent.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  const backups = await miladySandboxService.listBackups(agentId, user.organization_id);

  return NextResponse.json({
    success: true,
    data: backups.map((b) => ({
      id: b.id,
      snapshotType: b.snapshot_type,
      sizeBytes: b.size_bytes,
      vercelSnapshotId: b.vercel_snapshot_id,
      createdAt: b.created_at,
    })),
  });
}
