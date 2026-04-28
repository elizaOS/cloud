/**
 * GET /api/cron/cleanup-cli-sessions
 * Cleans up expired CLI auth sessions. Protected by CRON_SECRET.
 */

import { Hono } from "hono";
import { requireCronSecret } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";
import { cliAuthSessionsService } from "@/lib/services/cli-auth-sessions";
import { logger } from "@/lib/utils/logger";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  try {
    requireCronSecret(c);
    await cliAuthSessionsService.cleanupExpiredSessions();
    return c.json({ success: true, message: "Expired CLI auth sessions cleaned up successfully" });
  } catch (error) {
    logger.error("Error cleaning up CLI auth sessions:", error);
    return failureResponse(c, error);
  }
});

export default app;
