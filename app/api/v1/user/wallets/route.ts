import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getErrorStatusCode, nextJsonFromCaughtError } from "@/lib/api/errors";
import { requireAuthOrApiKey } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { dbWrite } from "@/packages/db/helpers";
import { agentServerWallets } from "@/packages/db/schemas/agent-server-wallets";

/**
 * GET /api/v1/user/wallets
 *
 * Returns all server-side wallets provisioned for the authenticated user's org.
 * Used by the desktop agent to retrieve wallet addresses after cloud login
 * (especially when re-provisioning returns a conflict).
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(req);

    if (!user.organization?.id) {
      return NextResponse.json(
        { success: false, error: "User does not belong to an organization" },
        { status: 403 },
      );
    }

    const wallets = await dbWrite
      .select({
        id: agentServerWallets.id,
        address: agentServerWallets.address,
        chainType: agentServerWallets.chain_type,
        clientAddress: agentServerWallets.client_address,
        walletProvider: agentServerWallets.wallet_provider,
        stewardAgentId: agentServerWallets.steward_agent_id,
        createdAt: agentServerWallets.created_at,
      })
      .from(agentServerWallets)
      .where(eq(agentServerWallets.organization_id, user.organization.id));

    return NextResponse.json({
      success: true,
      data: wallets,
    });
  } catch (error) {
    if (getErrorStatusCode(error) >= 500) {
      logger.error("[user-wallets] Error listing wallets:", error);
    }
    return nextJsonFromCaughtError(error);
  }
}
