/**
 * GET /api/credits/balance
 * Gets the credit balance for the authenticated user's organization.
 * Supports both Privy session and API key authentication.
 *
 * Query: `fresh=true` bypasses cache and reads from DB (kept for parity —
 * the Workers shim doesn't have the Next session cache so every read is fresh).
 */

import { Hono } from "hono";

import { organizationsService } from "@/lib/services/organizations";
import { logger } from "@/lib/utils/logger";
import { requireUserOrApiKeyWithOrg } from "../../../src/lib/auth";
import type { AppEnv } from "../../../src/lib/context";
import { failureResponse } from "../../../src/lib/errors";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const freshOrg = await organizationsService.getById(user.organization_id);
    const balance = Number(freshOrg?.credit_balance || 0);

    return c.json({ balance }, 200, {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    });
  } catch (error) {
    logger.error("[Balance API] Error:", error);
    return failureResponse(c, error);
  }
});

export default app;
