// TODO(node-only): blocked from Workers due to @elizaos/plugin-
// Original handler preserved in git history.

import { Hono } from "hono";

import type { AppEnv } from "../../../../src/lib/context";

const app = new Hono<AppEnv>();
app.all("*", (c) =>
  c.json(
    {
      success: false,
      error: "not_yet_migrated",
      reason: "node-only dep: @elizaos/plugin-",
    },
    501,
  ),
);

export default app;
