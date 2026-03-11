/**
 * GET/DELETE /api/compat/agents/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { userCharactersRepository } from "@/db/repositories/characters";
import { requireCompatAuth } from "../../_lib/auth";
import { handleCompatError } from "../../_lib/error-handler";
import {
  toCompatAgent,
  toCompatOpResult,
  envelope,
  errorEnvelope,
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

    // Look up the sandbox first to capture its character_id before deletion.
    // After deleteAgent removes the sandbox row, the FK (onDelete: set null)
    // would orphan the character and its token_address unique constraint would
    // block future re-provisioning with the same token.
    const sandbox = await miladySandboxService.getAgent(agentId, user.organization_id);
    if (!sandbox) {
      return NextResponse.json(errorEnvelope("Agent not found"), { status: 404 });
    }

    const characterId = sandbox.character_id;

    const deleted = await miladySandboxService.deleteAgent(agentId, user.organization_id);
    if (!deleted) {
      return NextResponse.json(errorEnvelope("Agent not found"), { status: 404 });
    }

    // Clean up the linked character row so the token_address unique constraint
    // is released. Best-effort: log but don't fail the delete if cleanup fails.
    if (characterId) {
      try {
        await userCharactersRepository.delete(characterId);
        logger.info("[compat] Cleaned up linked character after agent delete", {
          agentId,
          characterId,
        });
      } catch (charErr) {
        logger.warn("[compat] Failed to clean up linked character after agent delete", {
          agentId,
          characterId,
          error: charErr instanceof Error ? charErr.message : String(charErr),
        });
      }
    }

    logger.info("[compat] Agent deleted", { agentId, orgId: user.organization_id });
    return NextResponse.json(envelope(toCompatOpResult(agentId, "delete", true)));
  } catch (err) {
    return handleCompatError(err);
  }
}
