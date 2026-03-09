/**
 * GET/POST /api/compat/agents — thin-client compat layer
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { z } from "zod";
import { requireCompatAuth } from "../_lib/auth";
import {
  toCompatAgent,
  toCompatCreateResult,
  envelope,
  errorEnvelope,
} from "@/lib/api/compat-envelope";

export const dynamic = "force-dynamic";

const createAgentSchema = z.object({
  agentName: z.string().min(1).max(100),
  agentConfig: z.record(z.string(), z.unknown()).optional(),
  environmentVars: z.record(z.string(), z.string()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireCompatAuth(request);
    const agents = await miladySandboxService.listAgents(user.organization_id);
    return NextResponse.json(envelope(agents.map(toCompatAgent)));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireCompatAuth(request);
    const body = await request.json();

    const parsed = createAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: parsed.error.issues },
        { status: 400 },
      );
    }

    let agent = await miladySandboxService.createAgent({
      organizationId: user.organization_id,
      userId: user.id,
      agentName: parsed.data.agentName,
      agentConfig: parsed.data.agentConfig,
      environmentVars: parsed.data.environmentVars,
    });

    logger.info("[compat] Agent created", {
      agentId: agent.id,
      orgId: user.organization_id,
    });

    if (process.env.WAIFU_AUTO_PROVISION === "true") {
      try {
        const result = await miladySandboxService.provision(agent.id, user.organization_id);
        if (result.success && result.sandboxRecord) {
          agent = result.sandboxRecord;
        }
      } catch (provErr) {
        logger.error("[compat] Auto-provision failed", { error: provErr });
      }
    }

    return NextResponse.json(envelope(toCompatCreateResult(agent)), { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

function handleError(err: unknown): NextResponse {
  if (err instanceof Error) {
    const msg = err.message;
    const status = msg.includes("Unauthorized") || msg.includes("Invalid")
      ? 401
      : msg.includes("Forbidden") || msg.includes("requires")
        ? 403
        : 500;
    return NextResponse.json(errorEnvelope(msg), { status });
  }
  return NextResponse.json(errorEnvelope("Internal server error"), { status: 500 });
}
