import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { userCharactersRepository } from "@/db/repositories/characters";
import { agentServerWallets } from "@/db/schemas/agent-server-wallets";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { reusesExistingMiladyCharacter } from "@/lib/services/milady-agent-config";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";
import { getStewardAgent } from "@/lib/services/steward-client";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const CORS_METHODS = "GET, PATCH, DELETE, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

const patchAgentSchema = z.object({
  action: z.enum(["shutdown", "suspend"]),
});

/**
 * GET /api/v1/milady/agents/[agentId]
 * Get details for a specific Milady cloud agent.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;

    const agent = await miladySandboxService.getAgent(agentId, user.organization_id);
    if (!agent) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 }),
        CORS_METHODS,
      );
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
      tokenAddress =
        typeof cfg?.tokenContractAddress === "string" ? cfg.tokenContractAddress : null;
      tokenChain = typeof cfg?.chain === "string" ? cfg.chain : null;
      tokenName = typeof cfg?.tokenName === "string" ? cfg.tokenName : null;
      tokenTicker = typeof cfg?.tokenTicker === "string" ? cfg.tokenTicker : null;
    }

    // Resolve wallet info — Docker agents use Steward, others use Privy
    let walletAddress: string | null = null;
    let walletProvider: "steward" | "privy" | null = null;
    let walletStatus: "active" | "pending" | "none" | "error" = "none";

    const isDockerAgent = !!agent.node_id;

    if (isDockerAgent) {
      // Steward-backed agent — query Steward for wallet address
      try {
        const stewardAgent = await getStewardAgent(agentId);
        if (stewardAgent?.walletAddress) {
          walletAddress = stewardAgent.walletAddress;
          walletProvider = "steward";
          walletStatus = "active";
        } else if (stewardAgent) {
          walletProvider = "steward";
          walletStatus = "pending";
        }
      } catch (err) {
        logger.warn(`[milady-api] Steward wallet lookup failed for ${agentId}`, { err });
      }
    }

    // Fallback: check for Privy server wallet via character_id
    if (!walletAddress && agent.character_id) {
      const walletRecord = await db.query.agentServerWallets.findFirst({
        where: eq(agentServerWallets.character_id, agent.character_id),
      });
      if (walletRecord) {
        walletAddress = walletRecord.address;
        walletProvider = "privy";
        walletStatus = "active";
      }
    }

    return applyCorsHeaders(
      NextResponse.json({
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
          // Wallet info
          walletAddress,
          walletProvider,
          walletStatus,
        },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    logger.error("[milady-api] GET /agents/[agentId] error", { error });
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}

/**
 * PATCH /api/v1/milady/agents/[agentId]
 * Perform agent lifecycle actions that do not fit cleanly as separate resources.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;
    const body = await request.json().catch(() => null);

    const parsed = patchAgentSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
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

    if (parsed.data.action === "shutdown" || parsed.data.action === "suspend") {
      const agent = await miladySandboxService.getAgentForWrite(agentId, user.organization_id);
      if (!agent) {
        return applyCorsHeaders(
          NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 }),
          CORS_METHODS,
        );
      }

      if (agent.status === "stopped") {
        return applyCorsHeaders(
          NextResponse.json({
            success: true,
            data: {
              agentId,
              action: parsed.data.action,
              message:
                parsed.data.action === "shutdown"
                  ? "Agent is already stopped"
                  : "Agent is already suspended",
              previousStatus: agent.status,
            },
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
              : 400;
        return applyCorsHeaders(
          NextResponse.json(
            {
              success: false,
              error: result.error ?? `${parsed.data.action} failed`,
            },
            { status },
          ),
          CORS_METHODS,
        );
      }

      logger.info(`[milady-api] Agent ${parsed.data.action} complete`, {
        agentId,
        orgId: user.organization_id,
      });

      return applyCorsHeaders(
        NextResponse.json({
          success: true,
          data: {
            agentId,
            action: parsed.data.action,
            message:
              parsed.data.action === "shutdown"
                ? "Agent shutdown complete"
                : "Agent suspended with snapshot. Use resume or provision to restart.",
            previousStatus: agent.status,
          },
        }),
        CORS_METHODS,
      );
    }

    return applyCorsHeaders(
      NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 }),
      CORS_METHODS,
    );
  } catch (error) {
    logger.error("[milady-api] PATCH /agents/[agentId] error", { error });
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}

/**
 * DELETE /api/v1/milady/agents/[agentId]
 * Delete a Milady cloud agent and all associated infrastructure.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
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
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: deleted.error }, { status }),
        CORS_METHODS,
      );
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

    return applyCorsHeaders(NextResponse.json({ success: true }), CORS_METHODS);
  } catch (error) {
    logger.error("[milady-api] DELETE /agents/[agentId] error", { error });
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
