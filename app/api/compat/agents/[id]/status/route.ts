/**
 * GET /api/compat/agents/[id]/status
 */

import { NextRequest, NextResponse } from "next/server";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { requireCompatAuth } from "../../../_lib/auth";
import { handleCompatError } from "../../../_lib/error-handler";
import { toCompatStatus, envelope, errorEnvelope } from "@/lib/api/compat-envelope";

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

    return NextResponse.json(envelope(toCompatStatus(agent)));
  } catch (err) {
    return handleCompatError(err);
  }
}
