import { NextRequest, NextResponse } from "next/server";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const CORS_METHODS = "POST, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

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
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;

    logger.info("[milady-api] Suspend requested", {
      agentId,
      orgId: user.organization_id,
    });

    const agent = await miladySandboxService.getAgentForWrite(
      agentId,
      user.organization_id,
    );
    if (!agent) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Agent not found" },
          { status: 404 },
        ),
        CORS_METHODS,
      );
    }

    if (agent.status === "stopped") {
      return applyCorsHeaders(
        NextResponse.json({
          success: true,
          data: {
            agentId,
            action: "suspend",
            message: "Agent is already suspended",
            previousStatus: agent.status,
          },
        }),
        CORS_METHODS,
      );
    }

    const result = await miladySandboxService.shutdown(
      agentId,
      user.organization_id,
    );

    if (!result.success) {
      const status =
        result.error === "Agent not found"
          ? 404
          : result.error === "Agent provisioning is in progress"
            ? 409
            : 500;
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: result.error ?? "Suspend failed" },
          { status },
        ),
        CORS_METHODS,
      );
    }

    logger.info("[milady-api] Agent suspended", {
      agentId,
      orgId: user.organization_id,
    });

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          agentId,
          action: "suspend",
          message:
            "Agent suspended with snapshot. Use resume or provision to restart.",
          previousStatus: agent.status,
        },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
