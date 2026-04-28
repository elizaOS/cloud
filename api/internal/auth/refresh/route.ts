/**
 * POST /api/internal/auth/refresh — stubbed.
 *
 * Depends on `@/lib/auth/jwks` and `@/lib/auth/jwt-internal` which read
 * `process.env.JWT_SIGNING_PRIVATE_KEY`/`PUBLIC_KEY`/`KEY_ID` at module
 * initialization. Workers exposes env via `c.env`, so those modules can't
 * be loaded eagerly here without a refactor.
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
