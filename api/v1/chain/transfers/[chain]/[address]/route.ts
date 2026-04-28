// TODO(node-only): blocked from Workers — depends on @/lib/services/proxy/engine
// which uses node:crypto and next/server. Original handler preserved in git history.

import { Hono } from "hono";

import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();
app.all("*", (c) =>
  c.json(
    {
      success: false,
      error: "not_yet_migrated",
      reason: "node-only dep: proxy engine (node:crypto + next/server)",
    },
    501,
  ),
);

export default app;
