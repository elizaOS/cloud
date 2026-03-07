import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/milady/agents/[agentId]
 * Get details for a specific Milady cloud agent.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  const agent = await miladySandboxService.getAgent(agentId, user.organization_id);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: agent.id,
      agentName: agent.agent_name,
      status: agent.status,
      databaseStatus: agent.database_status,
      bridgeUrl: agent.bridge_url,
      lastBackupAt: agent.last_backup_at,
      lastHeartbeatAt: agent.last_heartbeat_at,
      errorMessage: agent.error_message,
      errorCount: agent.error_count,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    },
  });
}

/**
 * DELETE /api/v1/milady/agents/[agentId]
 * Delete a Milady cloud agent and all associated infrastructure.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  const deleted = await miladySandboxService.deleteAgent(agentId, user.organization_id);
  if (!deleted) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 },
    );
  }

  logger.info("[milady-api] Agent deleted", {
    agentId,
    orgId: user.organization_id,
  });

  return NextResponse.json({ success: true });
}
