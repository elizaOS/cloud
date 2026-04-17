/**
 * GET /api/v1/milady/agents/[agentId]/wallet
 *
 * Returns detailed wallet information for an agent, including address,
 * provider type, balance, and chain info.
 *
 * For steward-backed agents: queries Steward API for live wallet data.
 * For privy-backed agents: returns DB-stored wallet info.
 */

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { agentServerWallets } from "@/db/schemas/agent-server-wallets";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";
import { getStewardWalletInfo } from "@/lib/services/steward-client";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const CORS_METHODS = "GET, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;

    // Verify the agent belongs to this user's org
    const agent = await miladySandboxService.getAgent(
      agentId,
      user.organization_id,
    );
    if (!agent) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, error: "Agent not found" },
          { status: 404 },
        ),
        CORS_METHODS,
      );
    }

    // Check if there's a privy server wallet linked by character_id
    let privyWallet: { address: string; chain_type: string } | null = null;
    if (agent.character_id) {
      const walletRecord = await db.query.agentServerWallets.findFirst({
        where: eq(agentServerWallets.character_id, agent.character_id),
      });
      if (walletRecord) {
        privyWallet = {
          address: walletRecord.address,
          chain_type: walletRecord.chain_type,
        };
      }
    }

    // All Docker-node agents use Steward for wallet management.
    // Try Steward first for any agent with a node_id (Docker-backed).
    const isDockerAgent = !!agent.node_id;

    if (isDockerAgent) {
      const stewardInfo = await getStewardWalletInfo(agentId);

      if (stewardInfo) {
        return applyCorsHeaders(
          NextResponse.json({
            success: true,
            data: {
              agentId,
              walletAddress: stewardInfo.walletAddress,
              walletProvider: "steward",
              walletStatus: stewardInfo.walletStatus,
              balance: stewardInfo.balance,
              chain: stewardInfo.chain ?? "base",
              // Include privy wallet info if it exists (legacy/dual period)
              ...(privyWallet
                ? {
                    legacyWallet: {
                      address: privyWallet.address,
                      provider: "privy",
                      chainType: privyWallet.chain_type,
                    },
                  }
                : {}),
            },
          }),
          CORS_METHODS,
        );
      }

      // Steward unreachable — fall through to privy wallet if available
      logger.warn(
        `[wallet-api] Steward unreachable for agent ${agentId}, falling back to DB`,
      );
    }

    // Privy / DB fallback
    if (privyWallet) {
      return applyCorsHeaders(
        NextResponse.json({
          success: true,
          data: {
            agentId,
            walletAddress: privyWallet.address,
            walletProvider: "privy",
            walletStatus: "active",
            balance: null, // Privy doesn't expose balance via our API
            chain:
              privyWallet.chain_type === "evm"
                ? "base"
                : privyWallet.chain_type,
          },
        }),
        CORS_METHODS,
      );
    }

    // No wallet found
    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        data: {
          agentId,
          walletAddress: null,
          walletProvider: null,
          walletStatus: "none",
          balance: null,
          chain: null,
        },
      }),
      CORS_METHODS,
    );
  } catch (error) {
    logger.error("[wallet-api] GET /agents/[agentId]/wallet error", { error });
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
