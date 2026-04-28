/**
 * POST /api/v1/topup/100 — x402 crypto topup of $100.
 *
 * STUBBED at 501: depends on `x402-next` (Next.js-specific middleware
 * wrapper). See /api/v1/topup/10/route.ts for re-enable plan.
 */

import { Hono } from "hono";

import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();

app.post("/", (c) =>
  c.json(
    {
      success: false,
      error: "x402 topup is not yet available on the Workers runtime",
      code: "not_implemented",
    },
    501,
  ),
);

export default app;
