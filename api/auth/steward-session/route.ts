/**
 * POST /api/auth/steward-session — set steward-token cookie from a steward JWT.
 * DELETE /api/auth/steward-session — clear steward cookies (logout).
 */

import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

import { verifyStewardTokenCached } from "@/lib/auth/steward-client";
import type { AppEnv } from "../../../src/lib/context";

const STEWARD_REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

let stewardAuthMetricCounter = 0;
function logStewardAuth(outcome: string, ttl: number | null) {
  stewardAuthMetricCounter += 1;
  console.log("[steward-auth]", {
    timestamp: new Date().toISOString(),
    ttl,
    outcome,
    metric: stewardAuthMetricCounter,
  });
}

const app = new Hono<AppEnv>();

app.post("/", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { token?: string; refreshToken?: string };
    const token = body.token;
    const refreshToken = body.refreshToken;

    if (!token || typeof token !== "string") {
      logStewardAuth("missing-token", null);
      return c.json({ error: "Token required" }, 400);
    }

    const claims = await verifyStewardTokenCached(token);
    if (!claims) {
      logStewardAuth("invalid-token", null);
      return c.json({ error: "Invalid token" }, 401);
    }

    const ttl = claims.expiration
      ? Math.max(0, claims.expiration - Math.floor(Date.now() / 1000))
      : null;

    const secure = c.env.NODE_ENV === "production";

    setCookie(c, "steward-token", token, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      ...(typeof ttl === "number" ? { maxAge: ttl } : {}),
    });

    if (typeof refreshToken === "string" && refreshToken.length > 0) {
      setCookie(c, "steward-refresh-token", refreshToken, {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        path: "/",
        maxAge: STEWARD_REFRESH_COOKIE_MAX_AGE,
      });
    }

    setCookie(c, "steward-authed", "1", {
      httpOnly: false,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    logStewardAuth("ok", ttl);
    return c.json({ ok: true, userId: claims.userId });
  } catch {
    logStewardAuth("error", null);
    return c.json({ error: "Internal error" }, 500);
  }
});

app.delete("/", (c) => {
  deleteCookie(c, "steward-token", { path: "/" });
  deleteCookie(c, "steward-refresh-token", { path: "/" });
  deleteCookie(c, "steward-authed", { path: "/" });
  logStewardAuth("deleted", null);
  return c.json({ ok: true });
});

export default app;
