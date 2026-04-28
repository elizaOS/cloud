/**
 * GET /api/v1/user/wallets — list server-side wallets provisioned for the user's org.
 */

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireUserOrApiKey } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";
import { RateLimitPresets, rateLimit } from "@/api-lib/rate-limit";
import { logger } from "@/lib/utils/logger";
import { dbWrite } from "@/packages/db/helpers";
import { agentServerWallets } from "@/packages/db/schemas/agent-server-wallets";

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STANDARD));

app.get("/", async (c) => {
  try {
    const user = await requireUserOrApiKey(c);
    if (!user.organization?.id) {
      return c.json({ success: false, error: "User does not belong to an organization" }, 403);
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

    return c.json({ success: true, data: wallets });
  } catch (error) {
    logger.error("[user-wallets] Error listing wallets:", error);
    return failureResponse(c, error);
  }
});

export default app;
