/**
 * GET /api/compat/agents/[id]/logs — container logs for thin clients
 *
 * Fetches logs from the bridge URL if the agent is running,
 * or returns a descriptive status message otherwise.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { requireCompatAuth } from "../../../_lib/auth";
import { envelope, errorEnvelope } from "@/lib/api/compat-envelope";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireCompatAuth(request);
    const { id: agentId } = await params;

    const agent = await miladySandboxService.getAgent(agentId, user.organization_id);
    if (!agent) {
      return NextResponse.json(errorEnvelope("Agent not found"), { status: 404 });
    }

    const url = new URL(request.url);
    const tail = parseInt(url.searchParams.get("tail") ?? "100", 10);

    // Try bridge logs if agent is running
    if (agent.bridge_url && agent.status === "running") {
      try {
        const logsUrl = `${agent.bridge_url}/logs?tail=${tail}`;
        const res = await fetch(logsUrl, {
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const logs = await res.text();
          return NextResponse.json(envelope(logs));
        }
      } catch (fetchErr) {
        logger.warn("[compat] Failed to fetch logs from bridge", {
          agentId,
          error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        });
      }
    }

    // Fallback: status-based message
    const statusMsg: Record<string, string> = {
      pending: "Agent is pending — not yet provisioned.",
      provisioning: "Agent is being provisioned...",
      running: "Agent is running but logs are unavailable.",
      stopped: "Agent is stopped. No logs available.",
      disconnected: "Agent is disconnected. Last known status: disconnected.",
      error: `Agent is in error state: ${agent.error_message ?? "unknown error"}`,
    };

    return NextResponse.json(
      envelope(statusMsg[agent.status] ?? `Agent status: ${agent.status}`),
    );
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json(errorEnvelope(err.message), { status: 500 });
    }
    return NextResponse.json(errorEnvelope("Internal server error"), { status: 500 });
  }
}
