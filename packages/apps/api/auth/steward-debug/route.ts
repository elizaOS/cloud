/**
 * POST /api/auth/steward-debug
 * Debug helper to verify a steward token and report JIT-sync results.
 */

import { Hono } from "hono";
import type { AppEnv } from "@/api-lib/context";
import { verifyStewardTokenCached } from "@/lib/auth/steward-client";
import { usersService } from "@/lib/services/users";
import { syncUserFromSteward } from "@/lib/steward-sync";

const app = new Hono<AppEnv>();

app.post("/", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as { token?: string };
    const token = body.token;
    if (!token) return c.json({ error: "no token" }, 400);

    const claims = await verifyStewardTokenCached(token);
    if (!claims) {
      return c.json({ error: "verification failed", step: "verify" });
    }

    let user = await usersService.getByStewardId(claims.userId);
    let synced = false;

    if (!user) {
      try {
        user = await syncUserFromSteward({
          stewardUserId: claims.userId,
          email: claims.email,
          walletAddress: claims.address,
        });
        synced = true;
      } catch (syncErr) {
        return c.json(
          {
            error: "sync failed",
            message: syncErr instanceof Error ? syncErr.message : String(syncErr),
            claims: {
              userId: claims.userId,
              email: claims.email,
              tenantId: claims.tenantId,
            },
          },
          500,
        );
      }
    }

    return c.json({
      ok: true,
      claims: {
        userId: claims.userId,
        email: claims.email,
        tenantId: claims.tenantId,
      },
      userFound: true,
      synced,
      userId: user?.id,
      orgId: user?.organization_id,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export default app;
