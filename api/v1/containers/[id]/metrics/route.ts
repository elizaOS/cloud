// TODO(node-only): blocked from Workers due to @aws-sdk/client-cloudwatch
// Original handler preserved in git history.

import { Hono } from "hono";

import type { AppEnv } from "../../../../../src/lib/context";

const app = new Hono<AppEnv>();
app.all("*", (c) =>
  c.json(
    {
      success: false,
      error: "not_yet_migrated",
      reason: "node-only dep: @aws-sdk/client-cloudwatch",
    },
    501,
  ),
);

export default app;
