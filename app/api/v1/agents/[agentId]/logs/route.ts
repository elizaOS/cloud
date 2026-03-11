import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireServiceKey, ServiceKeyAuthError } from "@/lib/auth/service-key";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { assertSafeOutboundUrl } from "@/lib/security/outbound-url";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/agents/[agentId]/logs
 *
 * Service-to-service: fetch container logs via the bridge URL.
 * Auth: X-Service-Key header.
 *
 * Query params:
 *   tail - number of log lines to return (default 100)
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

  const url = new URL(request.url);
  const rawTail = parseInt(url.searchParams.get("tail") ?? "100", 10);
  const tail = Math.max(1, Math.min(Number.isFinite(rawTail) ? rawTail : 100, 5000));

  if (agent.bridge_url && agent.status === "running") {
    try {
      const logsUrl = `${agent.bridge_url}/logs?tail=${tail}`;
      // SSRF guard: validate bridge_url resolves to a safe destination
      await assertSafeOutboundUrl(logsUrl);
      const res = await fetch(logsUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const logs = await res.text();
        return NextResponse.json({ logs, status: agent.status });
      }
    } catch (fetchErr) {
      logger.warn("[service-api] Failed to fetch logs from bridge", {
        agentId,
        error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      });
    }
  }

  return NextResponse.json({
    logs: null,
    status: agent.status,
    message: agent.status === "running"
      ? "Agent is running but logs are unavailable"
      : `Agent is ${agent.status}`,
    errorMessage: agent.error_message ?? null,
  });
}
