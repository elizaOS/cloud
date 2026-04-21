/**
 * GET/POST /api/compat/agents — thin-client compat layer
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { envelope, toCompatAgent, toCompatCreateResult } from "@/lib/api/compat-envelope";
import { stripReservedElizaConfigKeys } from "@/lib/services/eliza-agent-config";
import { elizaSandboxService } from "@/lib/services/eliza-sandbox";
import { logger } from "@/lib/utils/logger";
import { requireCompatAuth } from "../_lib/auth";
import { handleCompatCorsOptions, withCompatCors } from "../_lib/cors";
import { handleCompatError } from "../_lib/error-handler";

export const dynamic = "force-dynamic";
const CORS_METHODS = "GET, POST, OPTIONS";

const createAgentSchema = z.object({
  agentName: z.string().min(1).max(100),
  agentConfig: z.record(z.string(), z.unknown()).optional(),
  environmentVars: z.record(z.string(), z.string()).optional(),
});

export function OPTIONS() {
  return handleCompatCorsOptions(CORS_METHODS);
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireCompatAuth(request);
    const agents = await elizaSandboxService.listAgents(user.organization_id);
    return withCompatCors(
      NextResponse.json(envelope(agents.map((a) => toCompatAgent(a)))),
      CORS_METHODS,
    );
  } catch (err) {
    return handleCompatError(err, CORS_METHODS);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireCompatAuth(request);
    const body = await request.json();

    const parsed = createAgentSchema.safeParse(body);
    if (!parsed.success) {
      return withCompatCors(
        NextResponse.json(
          {
            success: false,
            error: "Invalid request data",
            details: parsed.error.issues,
          },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }

    // Strip reserved __milady* keys from user-supplied agentConfig to prevent
    // callers from spoofing internal lifecycle flags.
    const sanitizedConfig = stripReservedElizaConfigKeys(parsed.data.agentConfig);

    let agent = await elizaSandboxService.createAgent({
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
        const result = await elizaSandboxService.provision(agent.id, user.organization_id);
        if (result.success && result.sandboxRecord) {
          agent = result.sandboxRecord;
        } else if (!result.success) {
          provisionWarning =
            "Auto-provision was requested but did not succeed; the agent was created and can be provisioned manually.";
          logger.warn("[compat] Auto-provision did not succeed", {
            agentId: agent.id,
            error: result.error,
          });
        }
      } catch (provErr) {
        provisionWarning =
          "Auto-provision was requested but failed; the agent was created and can be provisioned manually.";
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

    return withCompatCors(NextResponse.json(responseBody, { status: 201 }), CORS_METHODS);
  } catch (err) {
    return handleCompatError(err, CORS_METHODS);
  }
}
