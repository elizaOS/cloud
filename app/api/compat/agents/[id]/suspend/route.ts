/**
 * POST /api/compat/agents/[id]/suspend
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { requireCompatAuth } from "../../../_lib/auth";
import { handleCompatError } from "../../../_lib/error-handler";
import {
  toCompatOpResult,
  envelope,
  errorEnvelope,
} from "@/lib/api/compat-envelope";
import { z } from "zod";

export const dynamic = "force-dynamic";

const suspendSchema = z.object({
  reason: z.string().min(1).default("owner requested suspension"),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireCompatAuth(request);
    const { id: agentId } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = suspendSchema.safeParse(body);
    const reason = parsed.success
      ? parsed.data.reason
      : "owner requested suspension";

    logger.info("[compat] Suspend requested", { agentId, reason });

    const agent = await miladySandboxService.getAgent(
      agentId,
      user.organization_id,
    );
    if (!agent) {
      return NextResponse.json(errorEnvelope("Agent not found"), {
        status: 404,
      });
    }

    const result = await miladySandboxService.shutdown(
      agentId,
      user.organization_id,
    );
    if (!result.success) {
      const status =
        result.error === "Agent not found"
          ? 404
          : result.error === "Agent provisioning is in progress"
            ? 409
            : 500;
      return NextResponse.json(
        errorEnvelope(result.error ?? "Suspend failed"),
        { status },
      );
    }

    return NextResponse.json(
      envelope(toCompatOpResult(agentId, "suspend", true)),
    );
  } catch (err) {
    return handleCompatError(err);
  }
}
