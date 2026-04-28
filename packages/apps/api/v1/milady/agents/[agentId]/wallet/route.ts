/**
 * GET /api/v1/milady/agents/[agentId]/wallet
 *
 * Returns wallet information for an agent (address, provider, balance, chain).
 * All Docker-node agents use Steward for wallet management.
 */

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { agentServerWallets } from "@/db/schemas/agent-server-wallets";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { elizaSandboxService } from "@/lib/services/eliza-sandbox";
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

    const agent = await elizaSandboxService.getAgent(agentId, user.organization_id);
    if (!agent) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 }),
        CORS_METHODS,
      );
    }

    const isDockerAgent = !!agent.node_id;
    if (isDockerAgent) {
      const stewardInfo = await getStewardWalletInfo(agentId, {
        organizationId: user.organization_id,
      });

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
            },
          }),
          CORS_METHODS,
        );
      }

      logger.warn(`[wallet-api] Steward unreachable for agent ${agentId}, falling back to DB`);
    }

    // DB fallback (legacy wallet rows linked by character_id, kept until
    // the operator runs the Privy → Steward wallet migration).
    if (agent.character_id) {
      const walletRecord = await db.query.agentServerWallets.findFirst({
        where: eq(agentServerWallets.character_id, agent.character_id),
      });
      if (walletRecord) {
        return applyCorsHeaders(
          NextResponse.json({
            success: true,
            data: {
              agentId,
              walletAddress: walletRecord.address,
              walletProvider: walletRecord.wallet_provider,
              walletStatus: "active",
              balance: null,
              chain: walletRecord.chain_type === "evm" ? "base" : walletRecord.chain_type,
            },
          }),
          CORS_METHODS,
        );
      }
    }

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
