import { NextRequest, NextResponse } from "next/server";
import { requireServiceKey, ServiceKeyAuthError } from "@/lib/auth/service-key";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/v1/agents/[agentId]/resume
 *
 * Service-to-service: re-provision a stopped/suspended agent.
 * Auth: X-Service-Key header.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  let identity;
  try {
    identity = requireServiceKey(request);
  } catch (e) {
    if (e instanceof ServiceKeyAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Service authentication misconfigured" }, { status: 500 });
  }

  const { agentId } = await params;

  logger.info("[service-api] Resuming agent", { agentId });

  const result = await miladySandboxService.provision(agentId, identity.organizationId);
  if (!result.success) {
    const status =
      result.error === "Agent not found"
        ? 404
        : result.error === "Agent is already being provisioned"
          ? 409
          : 500;
    return NextResponse.json(
      { success: false, status: result.sandboxRecord?.status ?? "error", error: result.error },
      { status },
    );
  }

  return NextResponse.json({
    success: true,
    status: result.sandboxRecord.status,
  });
}
