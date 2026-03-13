/**
 * GET/POST /api/compat/agents — thin-client compat layer
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { z } from "zod";
import { requireCompatAuth } from "../_lib/auth";
import { handleCompatError } from "../_lib/error-handler";
import {
  toCompatAgent,
  toCompatCreateResult,
  envelope,
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
    return handleCompatError(err);
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

    // Strip reserved __milady* keys from user-supplied agentConfig to prevent
    // callers from spoofing internal flags that control delete-time behaviour.
    const sanitizedConfig = parsed.data.agentConfig
      ? Object.fromEntries(
          Object.entries(parsed.data.agentConfig).filter(
            ([k]) => !k.toLowerCase().startsWith("__milady"),
          ),
        )
      : undefined;

    let agent = await miladySandboxService.createAgent({
      organizationId: user.organization_id,
      userId: user.id,
      agentName: parsed.data.agentName,
      agentConfig: sanitizedConfig,
      environmentVars: parsed.data.environmentVars,
    });

    logger.info("[compat] Agent created", {
      agentId: agent.id,
      orgId: user.organization_id,
    });

    let provisionWarning: string | undefined;
    if (process.env.WAIFU_AUTO_PROVISION === "true") {
      try {
        const result = await miladySandboxService.provision(agent.id, user.organization_id);
        if (result.success && result.sandboxRecord) {
          agent = result.sandboxRecord;
        } else if (!result.success) {
          provisionWarning = "Auto-provision was requested but did not succeed; the agent was created and can be provisioned manually.";
          logger.warn("[compat] Auto-provision did not succeed", {
            agentId: agent.id,
            error: result.error,
          });
        }
      } catch (provErr) {
        provisionWarning = "Auto-provision was requested but failed; the agent was created and can be provisioned manually.";
        logger.error("[compat] Auto-provision failed", {
          agentId: agent.id,
          error: provErr instanceof Error ? provErr.message : String(provErr),
        });
      }
    }

    const data = toCompatCreateResult(agent);
    const responseBody = provisionWarning
      ? { ...envelope(data), warning: provisionWarning }
      : envelope(data);

    return NextResponse.json(responseBody, { status: 201 });
  } catch (err) {
    return handleCompatError(err);
  }
}
