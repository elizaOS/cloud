/**
 * GET /api/v1/credits/balance — credit balance for the user's org.
 * Query: fresh=true bypasses cached session and fetches from DB.
 *
 * CORS is handled globally (wildcard origin, no credentials).
 */

import { Hono } from "hono";

import { organizationsService } from "@/lib/services/organizations";
import { logger } from "@/lib/utils/logger";
import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";
import { rateLimit, RateLimitPresets } from "@/api-lib/rate-limit";

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STANDARD));

app.get("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const forceFresh = c.req.query("fresh") === "true";

    let balance: number;
    if (forceFresh) {
      const freshOrg = await organizationsService.getById(user.organization_id);
      balance = Number(freshOrg?.credit_balance || 0);
    } else {
      // Cached session value — refetch via service to get credit_balance.
      const org = await organizationsService.getById(user.organization_id);
      balance = Number(org?.credit_balance || 0);
    }

    c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    c.header("Pragma", "no-cache");
    c.header("Expires", "0");
    return c.json({ balance });
  } catch (error) {
    logger.error("[Balance API v1] Error:", error);
    return failureResponse(c, error);
  }
});

export default app;
