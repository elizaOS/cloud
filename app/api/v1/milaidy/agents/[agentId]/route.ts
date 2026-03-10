import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { userCharactersRepository } from "@/db/repositories/characters";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";

export const dynamic = "force-dynamic";

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
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 },
    );
  }

  // Resolve token linkage from associated character or JSONB fallback
  let tokenAddress: string | null = null;
  let tokenChain: string | null = null;
  let tokenName: string | null = null;
  let tokenTicker: string | null = null;

  if (agent.character_id) {
    const char = await userCharactersRepository.findById(agent.character_id);
    if (char) {
      tokenAddress = char.token_address ?? null;
      tokenChain = char.token_chain ?? null;
      tokenName = char.token_name ?? null;
      tokenTicker = char.token_ticker ?? null;
    }
  }

  // Fallback to agent_config JSONB
  if (!tokenAddress) {
    const cfg = agent.agent_config as Record<string, unknown> | null;
    tokenAddress = (cfg?.tokenContractAddress as string) ?? null;
    tokenChain = (cfg?.chain as string) ?? null;
    tokenName = (cfg?.tokenName as string) ?? null;
    tokenTicker = (cfg?.tokenTicker as string) ?? null;
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
  if (!deleted) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 },
    );
  }

  logger.info("[milady-api] Agent deleted", {
    agentId,
    orgId: user.organization_id,
  });

  return NextResponse.json({ success: true });
}
