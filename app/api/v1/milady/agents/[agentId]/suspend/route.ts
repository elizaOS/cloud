import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/milady/agents/[agentId]/suspend
 *
 * Gracefully suspend a running agent:
 * 1. Takes a pre-shutdown snapshot (backup) of the agent's state
 * 2. Stops and removes the Docker container
 * 3. Updates status to "stopped" in DB
 *
 * The agent can be resumed later via POST /api/v1/milady/agents/[agentId]/resume
 * or POST /api/v1/milady/agents/[agentId]/provision, which will restore from
 * the latest backup automatically. The agent may resume on a different node.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  logger.info("[milady-api] Suspend requested", {
    agentId,
    orgId: user.organization_id,
  });

  const agent = await miladySandboxService.getAgentForWrite(agentId, user.organization_id);
  if (!agent) {
    return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
  }

  if (agent.status === "stopped") {
    return NextResponse.json({
      success: true,
      data: {
        agentId,
        action: "suspend",
        message: "Agent is already suspended",
        previousStatus: agent.status,
      },
    });
  }

  const result = await miladySandboxService.shutdown(agentId, user.organization_id);

  if (!result.success) {
    const status =
      result.error === "Agent not found"
        ? 404
        : result.error === "Agent provisioning is in progress"
          ? 409
          : 500;
    if (status === 500) {
      logger.error("[milady-api] Suspend failed", { agentId, error: result.error });
    }
    return NextResponse.json(
      { success: false, error: status === 500 ? "Suspend failed" : (result.error ?? "Suspend failed") },
      { status },
    );
  }

  logger.info("[milady-api] Agent suspended", {
    agentId,
    orgId: user.organization_id,
  });

  return NextResponse.json({
    success: true,
    data: {
      agentId,
      action: "suspend",
      message: "Agent suspended with snapshot. Use resume or provision to restart.",
      previousStatus: agent.status,
    },
  });
}
