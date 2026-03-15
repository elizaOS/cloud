/**
 * POST /api/compat/agents/[id]/resume
 */

import { NextRequest, NextResponse } from "next/server";
import { envelope, errorEnvelope, toCompatOpResult } from "@/lib/api/compat-envelope";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { logger } from "@/lib/utils/logger";
import { requireCompatAuth } from "../../../_lib/auth";
import { handleCompatCorsOptions, withCompatCors } from "../../../_lib/cors";
import { handleCompatError } from "../../../_lib/error-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const CORS_METHODS = "POST, OPTIONS";

type RouteParams = { params: Promise<{ id: string }> };

export function OPTIONS() {
  return handleCompatCorsOptions(CORS_METHODS);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireCompatAuth(request);
    const { id: agentId } = await params;

    // Org-scoped pre-check: verify agent exists and belongs to this org
    // before attempting provision (matches restart route pattern).
    const agent = await miladySandboxService.getAgentForWrite(agentId, user.organization_id);
    if (!agent) {
      return withCompatCors(
        NextResponse.json(errorEnvelope("Agent not found"), { status: 404 }),
        CORS_METHODS,
      );
    }

    logger.info("[compat] Resume requested", { agentId });

    const result = await miladySandboxService.provision(agentId, user.organization_id);
    if (!result.success) {
      const status = result.error === "Agent is already being provisioned" ? 409 : 500;
      return withCompatCors(
        NextResponse.json(errorEnvelope(result.error ?? "Resume failed"), { status }),
        CORS_METHODS,
      );
    }

    return withCompatCors(
      NextResponse.json(envelope(toCompatOpResult(agentId, "resume", true))),
      CORS_METHODS,
    );
  } catch (err) {
    return handleCompatError(err, CORS_METHODS);
  }
}
