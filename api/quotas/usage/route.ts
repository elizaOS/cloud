/**
 * GET /api/quotas/usage
 * Gets current quota usage statistics for the organization.
 */

import { Hono } from "hono";

import { usageQuotasService } from "@/lib/services/usage-quotas";
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
    const usage = await usageQuotasService.getCurrentUsage(user.organization_id);
    return c.json({ success: true, data: usage });
  } catch (error) {
    logger.error("Error fetching quota usage:", error);
    return failureResponse(c, error);
  }
});

export default app;
