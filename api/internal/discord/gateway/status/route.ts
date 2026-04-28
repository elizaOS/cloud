/**
 * Internal API route — stubbed.
 *
 * Depends on `withInternalAuth` (`@/lib/auth/internal-api`) which transitively
 * loads `@/lib/auth/jwks` and reads JWT signing keys from `process.env` at
 * module init. Workers exposes env via `c.env`, so this can't run as-is.
 */

import { Hono } from "hono";

import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();
app.all("/*", (c) =>
  c.json(
    {
      error: "not_yet_migrated",
      reason: "withInternalAuth depends on @/lib/auth/jwks which reads process.env at module init",
    },
    501,
  ),
);
export default app;
