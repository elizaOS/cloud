/**
 * POST /api/compat/agents/[id]/suspend
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { envelope, errorEnvelope, toCompatOpResult } from "@/lib/api/compat-envelope";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { logger } from "@/lib/utils/logger";
import { requireCompatAuth } from "../../../_lib/auth";
import { handleCompatCorsOptions, withCompatCors } from "../../../_lib/cors";
import { handleCompatError } from "../../../_lib/error-handler";

export const dynamic = "force-dynamic";
const CORS_METHODS = "POST, OPTIONS";

const suspendSchema = z.object({
  reason: z.string().min(1).default("owner requested suspension"),
});

type RouteParams = { params: Promise<{ id: string }> };

export function OPTIONS() {
  return handleCompatCorsOptions(CORS_METHODS);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireCompatAuth(request);
    const { id: agentId } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = suspendSchema.safeParse(body);
    const reason = parsed.success ? parsed.data.reason : "owner requested suspension";

    logger.info("[compat] Suspend requested", { agentId, reason });

    const agent = await miladySandboxService.getAgentForWrite(agentId, user.organization_id);
    if (!agent) {
      return withCompatCors(
        NextResponse.json(errorEnvelope("Agent not found"), {
          status: 404,
        }),
        CORS_METHODS,
      );
    }

    const result = await miladySandboxService.shutdown(agentId, user.organization_id);
    if (!result.success) {
      const status =
        result.error === "Agent not found"
          ? 404
          : result.error === "Agent provisioning is in progress"
            ? 409
            : 500;
      return withCompatCors(
        NextResponse.json(errorEnvelope(result.error ?? "Suspend failed"), {
          status,
        }),
        CORS_METHODS,
      );
    }

    return withCompatCors(
      NextResponse.json(envelope(toCompatOpResult(agentId, "suspend", true))),
      CORS_METHODS,
    );
  } catch (err) {
    return handleCompatError(err, CORS_METHODS);
  }
}
