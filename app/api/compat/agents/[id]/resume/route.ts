/**
 * POST /api/compat/agents/[id]/resume
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { requireCompatAuth } from "../../../_lib/auth";
import { toCompatOpResult, envelope, errorEnvelope } from "@/lib/api/compat-envelope";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireCompatAuth(request);
    const { id: agentId } = await params;

    logger.info("[compat] Resume requested", { agentId });

    const result = await miladySandboxService.provision(agentId, user.organization_id);
    if (!result.success) {
      const status = result.error === "Agent not found" ? 404
        : result.error === "Agent is already being provisioned" ? 409
        : 500;
      return NextResponse.json(errorEnvelope(result.error ?? "Resume failed"), { status });
    }

    return NextResponse.json(envelope(toCompatOpResult(agentId, "resume", true)));
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json(errorEnvelope(err.message), { status: 500 });
    }
    return NextResponse.json(errorEnvelope("Internal server error"), { status: 500 });
  }
}
