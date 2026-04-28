/**
 * /api/eliza-app/webhook/discord — stubbed.
 *
 * Wraps withInternalAuth (loads @/lib/auth/jwks which reads process.env at
 * module init) AND spawns an elizaOS runtime via runtime-factory. Two
 * Node-only blockers.
 */

import { Hono } from "hono";

import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();
app.all("/*", (c) =>
  c.json(
    {
      error: "not_yet_migrated",
      reason: "withInternalAuth + elizaOS runtime are not Workers-compatible",
    },
    501,
  ),
);
export default app;
