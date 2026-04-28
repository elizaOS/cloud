/**
 * GET /api/my-agents/characters/:id/stats
 * Returns view/interaction/message counts for the authed user's character.
 * Currently a placeholder returning zeros; the real counters live elsewhere.
 */

import { Hono } from "hono";
import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { charactersService } from "@/lib/services/characters/characters";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const id = c.req.param("id") ?? "";
    const character = await charactersService.getByIdForUser(id, user.id);
    if (!character) {
      return c.json({ success: false, error: "Character not found" }, 404);
    }
    const stats = { views: 0, interactions: 0, messageCount: 0 };
    return c.json({ success: true, data: { stats } });
  } catch {
    return c.json({ success: false, error: "Failed to get stats" }, 500);
  }
});

export default app;
