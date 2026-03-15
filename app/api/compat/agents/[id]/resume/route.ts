/**
 * POST /api/compat/agents/[id]/resume
 */

import { NextRequest, NextResponse } from "next/server";
import { envelope, errorEnvelope, toCompatOpResult } from "@/lib/api/compat-envelope";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
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

    // Org-scoped pre-check: verify agent exists and belongs to this org
    // before attempting provision (matches restart route pattern).
    const agent = await miladySandboxService.getAgentForWrite(agentId, user.organization_id);
    if (!agent) {
      return NextResponse.json(errorEnvelope("Agent not found"), { status: 404 });
    }

    logger.info("[compat] Resume requested", { agentId });

    const result = await miladySandboxService.provision(agentId, user.organization_id);
    if (!result.success) {
      const status = result.error === "Agent is already being provisioned" ? 409 : 500;
      return NextResponse.json(errorEnvelope(result.error ?? "Resume failed"), { status });
    }

    return NextResponse.json(envelope(toCompatOpResult(agentId, "resume", true)));
  } catch (err) {
    return handleCompatError(err);
  }
}
