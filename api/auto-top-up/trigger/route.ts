/**
 * POST /api/auto-top-up/trigger
 * Manually triggers an auto top-up check for the authenticated user's
 * organization. Useful for testing without waiting for cron.
 */

import { Hono } from "hono";

import { organizationsRepository } from "@/db/repositories";
import { autoTopUpService } from "@/lib/services/auto-top-up";
import { logger } from "@/lib/utils/logger";
import { requireUserOrApiKeyWithOrg } from "../../../src/lib/auth";
import type { AppEnv } from "../../../src/lib/context";
import { failureResponse } from "../../../src/lib/errors";
import { rateLimit, RateLimitPresets } from "../../../src/lib/rate-limit";

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STRICT));

app.post("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const org = await organizationsRepository.findById(user.organization_id);
    if (!org) return c.json({ error: "Organization not found" }, 404);

    if (!org.auto_top_up_enabled) {
      return c.json(
        { error: "Auto top-up is not enabled", message: "Please enable auto top-up first" },
        400,
      );
    }

    const currentBalance = Number(org.credit_balance || 0);
    const threshold = Number(org.auto_top_up_threshold || 0);

    if (currentBalance >= threshold) {
      return c.json({
        success: false,
        message: `Balance ($${currentBalance.toFixed(2)}) is above threshold ($${threshold.toFixed(2)}). Auto top-up not needed.`,
        currentBalance,
        threshold,
      });
    }

    const result = await (
      autoTopUpService as unknown as { executeAutoTopUp: (org: typeof org) => Promise<unknown> }
    ).executeAutoTopUp(org);
    const r = result as {
      success: boolean;
      amount?: number;
      newBalance?: number;
      error?: string;
    };

    if (r.success) {
      return c.json({
        success: true,
        message: `Auto top-up successful! Added $${r.amount?.toFixed(2)}`,
        amount: r.amount,
        previousBalance: currentBalance,
        newBalance: r.newBalance,
      });
    }
    return c.json(
      {
        success: false,
        error: r.error || "Auto top-up failed",
        message: "Please check your payment method and try again",
      },
      400,
    );
  } catch (error) {
    logger.error("Error triggering auto top-up:", error);
    return failureResponse(c, error);
  }
});

export default app;
