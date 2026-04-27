/**
 * GET /api/compat/agents/[id]/logs — container logs for thin clients
 *
 * Fetches logs from the bridge URL if the agent is running,
 * or returns a descriptive status message otherwise.
 */

import { NextRequest, NextResponse } from "next/server";
import { envelope, errorEnvelope } from "@/lib/api/compat-envelope";
import { logger } from "@/lib/utils/logger";
import { elizaSandboxService } from "@/lib/services/eliza-sandbox";
import { assertSafeOutboundUrl } from "@/lib/security/outbound-url";
import { handleCompatCorsOptions, withCompatCors } from "../../../_lib/cors";
import { requireCompatAuth } from "../../../_lib/auth";
import { handleCompatError } from "../../../_lib/error-handler";

export const dynamic = "force-dynamic";
const CORS_METHODS = "GET, OPTIONS";

type RouteParams = { params: Promise<{ id: string }> };

export function OPTIONS() {
  return handleCompatCorsOptions(CORS_METHODS);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireCompatAuth(request);
    const { id: agentId } = await params;

    const agent = await elizaSandboxService.getAgent(agentId, user.organization_id);
    if (!agent) {
      return withCompatCors(
        NextResponse.json(errorEnvelope("Agent not found"), { status: 404 }),
        CORS_METHODS,
      );
    }

    const url = new URL(request.url);
    const rawTail = parseInt(url.searchParams.get("tail") ?? "100", 10);
    const tail = Math.max(1, Math.min(Number.isFinite(rawTail) ? rawTail : 100, 5000));

    // Try bridge logs if agent is running
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
          return withCompatCors(
            NextResponse.json(envelope(logs)),
            CORS_METHODS,
          );
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

    return withCompatCors(
      NextResponse.json(
        envelope(statusMsg[agent.status] ?? `Agent status: ${agent.status}`),
      ),
      CORS_METHODS,
    );
  } catch (err) {
    return handleCompatError(err, CORS_METHODS);
  }
}
