/**
 * POST /api/auth/logout
 * Logs out the current user by ending all sessions and clearing auth cookies.
 * Also invalidates Redis caches to ensure immediate token invalidation.
 */

import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";

import { invalidateSessionCaches } from "@/lib/auth";
import { userSessionsService } from "@/lib/services/user-sessions";
import { logger } from "@/lib/utils/logger";
import { getCurrentUser } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { rateLimit, RateLimitPresets } from "@/api-lib/rate-limit";

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STANDARD));

app.post("/", async (c) => {
  try {
    const privyToken = getCookie(c, "privy-token");

    const user = await getCurrentUser(c);

    if (privyToken) {
      await invalidateSessionCaches(privyToken);
      logger.debug("[Logout] Invalidated session caches for token");
    }

    if (user) {
      await userSessionsService.endAllUserSessions(user.id);
    }

    deleteCookie(c, "privy-token", { path: "/" });
    deleteCookie(c, "privy-refresh-token", { path: "/" });
    deleteCookie(c, "privy-id-token", { path: "/" });
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
