import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { milaidySandboxService } from "@/lib/services/milaidy-sandbox";

export const dynamic = "force-dynamic";
// Sandbox provisioning can take up to 60s (Neon DB + Vercel Sandbox + health check)
export const maxDuration = 120;

/**
 * POST /api/v1/milaidy/agents/[agentId]/provision
 * Provision (or re-provision) the sandbox for a Milaidy cloud agent.
 *
 * Idempotent: if the sandbox is already running, returns the existing connection info.
 * If the sandbox was stopped or disconnected, re-provisions from the latest backup.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  logger.info("[milaidy-api] Provision requested", {
    agentId,
    orgId: user.organization_id,
  });

  const result = await milaidySandboxService.provision(agentId, user.organization_id);

  if (!result.success) {
    const status = result.error === "Agent not found" ? 404
      : result.error === "Agent is already being provisioned" ? 409
      : 500;

    return NextResponse.json(
      { success: false, error: result.error },
      { status },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: result.sandboxRecord.id,
      agentName: result.sandboxRecord.agent_name,
      status: result.sandboxRecord.status,
      bridgeUrl: result.bridgeUrl,
      healthUrl: result.healthUrl,
    },
  });
}
