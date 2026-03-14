/**
 * POST /api/compat/agents/[id]/restart
 */

import { NextRequest, NextResponse } from "next/server";
import { envelope, errorEnvelope, toCompatOpResult } from "@/lib/api/compat-envelope";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { logger } from "@/lib/utils/logger";
import { requireCompatAuth } from "../../../_lib/auth";
import { handleCompatError } from "../../../_lib/error-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireCompatAuth(request);
    const { id: agentId } = await params;

    const agent = await miladySandboxService.getAgent(agentId, user.organization_id);
    if (!agent) {
      return NextResponse.json(errorEnvelope("Agent not found"), { status: 404 });
    }

    logger.info("[compat] Restart requested", { agentId });

    try {
      await miladySandboxService.snapshot(agentId, user.organization_id);
    } catch (snapErr) {
      logger.warn("[compat] Pre-restart snapshot failed", {
        agentId,
        error: snapErr instanceof Error ? snapErr.message : String(snapErr),
      });
    }

    const result = await miladySandboxService.provision(agentId, user.organization_id);
    const response = envelope(toCompatOpResult(agentId, "restart", result.success));

    if (!result.success) {
      logger.warn("[compat] Restart failed", {
        agentId,
        error: result.error,
      });
      return NextResponse.json(response, { status: 502 });
    }

    return NextResponse.json(response);
  } catch (err) {
    return handleCompatError(err);
  }
}
