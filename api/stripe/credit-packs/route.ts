/**
 * GET /api/stripe/credit-packs
 * Public — lists active credit packs available for purchase.
 */

import { Hono } from "hono";
import type { AppEnv } from "@/api-lib/context";
import { RateLimitPresets, rateLimit } from "@/api-lib/rate-limit";
import { creditsService } from "@/lib/services/credits";
import { logger } from "@/lib/utils/logger";

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.RELAXED));

app.get("/", async (c) => {
  try {
    const creditPacks = await creditsService.listActiveCreditPacks();
    return c.json({ creditPacks });
  } catch (error) {
    logger.error("Error fetching credit packs:", error);
    return c.json({ error: "Failed to fetch credit packs" }, 500);
  }
});

export default app;
