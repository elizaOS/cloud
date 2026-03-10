import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireServiceKey, ServiceKeyAuthError } from "@/lib/auth/service-key";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/v1/agents/[agentId]/restart
 *
 * Service-to-service: shutdown then re-provision an agent.
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

  logger.info("[service-api] Restarting agent", { agentId });

  // Shutdown (snapshot + stop)
  const shutdownResult = await miladySandboxService.shutdown(agentId, identity.organizationId);
  if (!shutdownResult.success) {
    if (shutdownResult.error === "Agent not found") {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }
    // Non-fatal — agent may already be stopped; continue to provision
    logger.warn("[service-api] Shutdown during restart returned error, continuing", {
      agentId,
      error: shutdownResult.error,
    });
  }

  // Re-provision
  const result = await miladySandboxService.provision(agentId, identity.organizationId);
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
