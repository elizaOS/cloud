/**
 * GET /api/compat/agents/[id]/status
 */

import { NextRequest, NextResponse } from "next/server";
import { envelope, errorEnvelope, toCompatStatus } from "@/lib/api/compat-envelope";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { requireCompatAuth } from "../../../_lib/auth";
import { handleCompatCorsOptions, withCompatCors } from "../../../_lib/cors";
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

    const agent = await miladySandboxService.getAgent(agentId, user.organization_id);
    if (!agent) {
      return withCompatCors(
        NextResponse.json(errorEnvelope("Agent not found"), { status: 404 }),
        CORS_METHODS,
      );
    }

    return withCompatCors(NextResponse.json(envelope(toCompatStatus(agent))), CORS_METHODS);
  } catch (err) {
    return handleCompatError(err, CORS_METHODS);
  }
}
