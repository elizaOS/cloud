/**
 * POST /api/auth/logout
 * Logs out the current user by ending all sessions and clearing auth cookies.
 * Also invalidates Redis caches to ensure immediate token invalidation.
 */

import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { getCurrentUser } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { RateLimitPresets, rateLimit } from "@/api-lib/rate-limit";
import { invalidateSessionCaches } from "@/lib/auth";
import { userSessionsService } from "@/lib/services/user-sessions";
import { logger } from "@/lib/utils/logger";

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STANDARD));

app.post("/", async (c) => {
  try {
    const stewardToken = getCookie(c, "steward-token");

    const user = await getCurrentUser(c);

    if (stewardToken) {
      await invalidateSessionCaches(stewardToken);
      logger.debug("[Logout] Invalidated session caches for token");
    }

    if (user) {
      await userSessionsService.endAllUserSessions(user.id);
    }

    deleteCookie(c, "steward-token", { path: "/" });
    deleteCookie(c, "steward-refresh-token", { path: "/" });
    deleteCookie(c, "steward-authed", { path: "/" });
    deleteCookie(c, "eliza-anon-session", { path: "/" });

    return c.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    logger.error("Error during logout:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to logout",
      },
      500,
    );
  }
});

export default app;
