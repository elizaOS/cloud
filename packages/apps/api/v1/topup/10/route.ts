/**
 * POST /api/v1/topup/10 — x402 crypto topup of $10.
 *
 * STUBBED at 501: depends on `x402-next` (Next.js-specific middleware
 * wrapper). Workers needs an `x402-hono` adapter or equivalent. Original
 * logic is preserved in `packages/lib/services/topup-handler.ts`. To
 * re-enable: port `withX402` (route protection + payment verification)
 * to Hono middleware, or front this with a Node sidecar.
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
