import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { userCharactersRepository } from "@/db/repositories/characters";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { reusesExistingMiladyCharacter } from "@/lib/services/milady-agent-config";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const patchAgentSchema = z.object({
  action: z.enum(["shutdown"]),
});

/**
 * GET /api/v1/milady/agents/[agentId]
 * Get details for a specific Milady cloud agent.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  const agent = await miladySandboxService.getAgent(agentId, user.organization_id);
  if (!agent) {
    return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
  }

  // Resolve token linkage from associated character or JSONB fallback
  let tokenAddress: string | null = null;
  let tokenChain: string | null = null;
  let tokenName: string | null = null;
  let tokenTicker: string | null = null;

  if (agent.character_id) {
    const char = await userCharactersRepository.findByIdInOrganization(
      agent.character_id,
      user.organization_id,
    );
    if (char) {
      tokenAddress = char.token_address ?? null;
      tokenChain = char.token_chain ?? null;
      tokenName = char.token_name ?? null;
      tokenTicker = char.token_ticker ?? null;
    }
  }

  // Fallback to agent_config JSONB — use typeof guards since JSONB
  // values are untyped and could be numbers, objects, etc.
  if (!tokenAddress) {
    const cfg = agent.agent_config as Record<string, unknown> | null;
    tokenAddress = typeof cfg?.tokenContractAddress === "string" ? cfg.tokenContractAddress : null;
    tokenChain = typeof cfg?.chain === "string" ? cfg.chain : null;
    tokenName = typeof cfg?.tokenName === "string" ? cfg.tokenName : null;
    tokenTicker = typeof cfg?.tokenTicker === "string" ? cfg.tokenTicker : null;
  }

  return NextResponse.json({
    success: true,
    data: {
      id: agent.id,
      agentName: agent.agent_name,
      status: agent.status,
      databaseStatus: agent.database_status,
      bridgeUrl: agent.bridge_url,
      lastBackupAt: agent.last_backup_at,
      lastHeartbeatAt: agent.last_heartbeat_at,
      errorMessage: agent.error_message,
      errorCount: agent.error_count,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
      // Canonical token linkage
      token_address: tokenAddress,
      token_chain: tokenChain,
      token_name: tokenName,
      token_ticker: tokenTicker,
    },
  });
}

/**
 * PATCH /api/v1/milady/agents/[agentId]
 * Perform agent lifecycle actions that do not fit cleanly as separate resources.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;
  const body = await request.json().catch(() => null);

  const parsed = patchAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request data",
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  if (parsed.data.action === "shutdown") {
    const result = await miladySandboxService.shutdown(agentId, user.organization_id);
    if (!result.success) {
      const status =
        result.error === "Agent not found"
          ? 404
          : result.error === "Agent provisioning is in progress"
            ? 409
            : 400;
      return NextResponse.json(
        { success: false, error: result.error ?? "Shutdown failed" },
        { status },
      );
    }

    logger.info("[milady-api] Agent shutdown complete", {
      agentId,
      orgId: user.organization_id,
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });
}

/**
 * DELETE /api/v1/milady/agents/[agentId]
 * Delete a Milady cloud agent and all associated infrastructure.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  const deleted = await miladySandboxService.deleteAgent(agentId, user.organization_id);
  if (!deleted.success) {
    const status =
      deleted.error === "Agent not found"
        ? 404
        : deleted.error === "Agent provisioning is in progress"
          ? 409
          : 500;
    return NextResponse.json({ success: false, error: deleted.error }, { status });
  }

  const characterId = deleted.deletedSandbox.character_id;
  const sandboxConfig = deleted.deletedSandbox.agent_config as Record<string, unknown> | null;
  const reusesExistingCharacter = reusesExistingMiladyCharacter(sandboxConfig);

  if (characterId && !reusesExistingCharacter) {
    try {
      await userCharactersRepository.delete(characterId);
      logger.info("[milady-api] Cleaned up linked character after delete", {
        agentId,
        characterId,
      });
    } catch (characterErr) {
      logger.warn("[milady-api] Failed to clean up linked character after delete", {
        agentId,
        characterId,
        error: characterErr instanceof Error ? characterErr.message : String(characterErr),
      });
    }
  }

  logger.info("[milady-api] Agent deleted", {
    agentId,
    orgId: user.organization_id,
  });

  return NextResponse.json({ success: true });
}
