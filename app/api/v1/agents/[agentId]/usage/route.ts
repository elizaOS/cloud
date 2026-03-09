import { NextRequest, NextResponse } from "next/server";
import { requireServiceKey, ServiceKeyAuthError } from "@/lib/auth/service-key";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/agents/[agentId]/usage
 *
 * Service-to-service: return basic usage/billing data.
 * Auth: X-Service-Key header.
 *
 * Note: Per-agent billing is not yet fully implemented on the cloud side.
 * This returns best-effort data from the sandbox record.
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

  // Compute uptime from created_at to now (if running)
  const createdAt = new Date(agent.created_at);
  const now = new Date();
  const uptimeMs = agent.status === "running" ? now.getTime() - createdAt.getTime() : 0;
  const uptimeHours = Math.round((uptimeMs / (1000 * 60 * 60)) * 100) / 100;

  // Billing mode from agent_config if stored
  const config = (agent.agent_config ?? {}) as Record<string, unknown>;
  const billing = config.billing as Record<string, unknown> | undefined;
  const fundingSource = (billing?.mode as string) ?? "unknown";

  return NextResponse.json({
    uptimeHours,
    estimatedDailyBurnUsd: 0, // Not yet tracked
    currentPeriodCostUsd: 0,  // Not yet tracked
    fundingSource,
  });
}
