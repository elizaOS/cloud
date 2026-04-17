import { NextRequest, NextResponse } from "next/server";
import { toCompatStatus } from "@/lib/api/compat-envelope";
import { requireServiceKey, ServiceKeyAuthError } from "@/lib/auth/service-key";
import { miladySandboxService } from "@/lib/services/milady-sandbox";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/agents/[agentId]/status
 *
 * S2S: return agent status. Uses canonical CompatStatusShape.
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
    return NextResponse.json(
      { error: "Service authentication misconfigured" },
      { status: 500 },
    );
  }

  const { agentId } = await params;
  const agent = await miladySandboxService.getAgent(
    agentId,
    identity.organizationId,
  );

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json(toCompatStatus(agent));
}
