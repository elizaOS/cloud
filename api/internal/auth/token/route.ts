/**
 * POST /api/internal/auth/token — stubbed.
 *
 * Same blocker as the sibling /refresh route: `@/lib/auth/jwks` reads
 * private/public key material from `process.env` at module load.
 */

import { Hono } from "hono";

import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();
app.all("/*", (c) =>
  c.json(
    { error: "not_yet_migrated", reason: "@/lib/auth/jwks reads process.env at module init" },
    501,
  ),
);
export default app;
