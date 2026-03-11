/**
 * GET/DELETE /api/compat/agents/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { requireCompatAuth } from "../../_lib/auth";
import { handleCompatError } from "../../_lib/error-handler";
import {
  toCompatAgent,
  toCompatOpResult,
  envelope,
} from "@/lib/api/compat-envelope";

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

    return NextResponse.json(envelope(toCompatAgent(agent)));
  } catch (err) {
    return handleCompatError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireCompatAuth(request);
    const { id: agentId } = await params;

    const deleted = await miladySandboxService.deleteAgent(agentId, user.organization_id);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
    }

    logger.info("[compat] Agent deleted", { agentId, orgId: user.organization_id });
    return NextResponse.json(envelope(toCompatOpResult(agentId, "delete", true)));
  } catch (err) {
    return handleCompatError(err);
  }
}
