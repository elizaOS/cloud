/**
 * GET /api/v1/agents/[agentId]/status
 *
 * S2S: return agent status. Uses canonical CompatStatusShape.
 * Auth: X-Service-Key header.
 */

import { Hono } from "hono";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse, NotFoundError } from "@/api-lib/errors";
import { requireServiceKey } from "@/api-lib/service-key";
import { toCompatStatus } from "@/lib/api/compat-envelope";
import { elizaSandboxService } from "@/lib/services/eliza-sandbox";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  try {
    const identity = await requireServiceKey(c);
    const agentId = c.req.param("agentId") ?? "";
    const agent = await elizaSandboxService.getAgent(agentId, identity.organizationId);
    if (!agent) throw NotFoundError("Agent not found");
    return c.json(toCompatStatus(agent));
  } catch (error) {
    return failureResponse(c, error);
  }
});

export default app;
