/**
 * /api/my-agents/characters/:id
 * GET: fetch one of the authed user's characters by id.
 * DELETE: hard-delete after ownership check.
 */

import { Hono } from "hono";
import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";
import { charactersService } from "@/lib/services/characters/characters";
import { logger } from "@/lib/utils/logger";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const id = c.req.param("id") ?? "";
    const character = await charactersService.getByIdForUser(id, user.id);
    if (!character) {
      return c.json({ success: false, error: "Character not found" }, 404);
    }
    return c.json({ success: true, data: { character } });
  } catch (error) {
    return failureResponse(c, error);
  }
});

app.delete("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const id = c.req.param("id") ?? "";

    logger.info("[My Agents API] Deleting character:", {
      characterId: id,
      userId: user.id,
    });

    const character = await charactersService.getByIdForUser(id, user.id);
    if (!character) {
      return c.json({ success: false, error: "Character not found or access denied" }, 404);
    }

    await charactersService.delete(id);
    // TODO(cache): /dashboard + /dashboard/my-agents revalidation dropped
    // (no Workers-side equivalent of next/cache revalidatePath).
    return c.json({ success: true, data: { message: "Character deleted successfully" } });
  } catch (error) {
    return failureResponse(c, error);
  }
});

export default app;
