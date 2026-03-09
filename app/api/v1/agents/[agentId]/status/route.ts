import { NextRequest, NextResponse } from "next/server";
import { requireServiceKey, ServiceKeyAuthError } from "@/lib/auth/service-key";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/agents/[agentId]/status
 *
 * Service-to-service: return agent status for waifu.fun control-plane sync.
 * Auth: X-Service-Key header.
 */
export async function GET(
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
  const agent = await miladySandboxService.getAgent(agentId, identity.organizationId);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: agent.status,
    lastHeartbeat: agent.last_heartbeat_at?.toISOString?.() ?? agent.last_heartbeat_at ?? null,
    bridgeUrl: agent.bridge_url ?? null,
    webUiUrl: null, // Not yet exposed via sandbox record
    currentNode: agent.node_id ?? null,
    creditsSnapshot: null, // Billing not yet tracked per-agent
    suspendedReason: agent.error_message ?? null,
  });
}
