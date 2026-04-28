/**
 * POST /api/auth/pair
 *
 * Validates a one-time pairing token and returns the agent's API key
 * (or a generated session key) so pair.html can bootstrap the web UI.
 */

import { Hono } from "hono";
import type { AppEnv } from "@/api-lib/context";
import { RateLimitPresets, rateLimit } from "@/api-lib/rate-limit";
import { miladySandboxesRepository } from "@/db/repositories/milady-sandboxes";
import { getPairingTokenService } from "@/lib/services/pairing-token";

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STRICT));

app.post("/", async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as { token?: string } | null;
    const token = body?.token;

    if (!token) {
      return c.json({ error: "Pairing code required" }, 400);
    }

    const origin = c.req.header("origin") ?? null;
    if (!origin) {
      return c.json({ error: "Origin header required" }, 400);
    }

    const tokenService = getPairingTokenService();
    const pairingToken = await tokenService.validateToken(token, origin);
    if (!pairingToken) {
      return c.json({ error: "Invalid or expired pairing code" }, 401);
    }

    const sandbox = await miladySandboxesRepository.findByIdAndOrg(
      pairingToken.agentId,
      pairingToken.orgId,
    );
    if (!sandbox) {
      return c.json({ error: "Agent not found" }, 404);
    }

    const envVars = (sandbox.environment_vars ?? {}) as Record<string, string>;
    const apiKey = envVars.MILADY_API_TOKEN || null;

    return c.json(
      {
        message: "Paired successfully",
        apiKey,
        agentName: sandbox.agent_name ?? "Agent",
      },
      200,
      { "Cache-Control": "no-store, no-cache, must-revalidate" },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth/pair] error:", msg);
    return c.json({ error: "Pairing failed" }, 500);
  }
});

export default app;
