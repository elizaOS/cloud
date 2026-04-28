/**
 * Cloud API — Hono + Cloudflare Workers entrypoint.
 *
 * Replaces the Next.js App Router under `cloud/app/api/` (now mirrored at
 * `cloud/api/`). Routes are converted in place; this file mounts them via
 * the codegen-emitted `_router.generated.ts`.
 *
 *   bun run codegen   # regen the router after adding/removing routes
 *   bun run dev       # wrangler dev
 *   bun run deploy    # wrangler deploy
 */

import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { requestId } from "hono/request-id";
import { mountRoutes } from "./_router.generated";
import type { AppEnv } from "./lib/context";
import { corsMiddleware } from "./lib/cors";
import { makeCronHandler } from "./lib/cron";
import { failureResponse } from "./lib/errors";
import { authMiddleware } from "./middleware/auth";
import { handleQueue } from "./queue";

const app = new Hono<AppEnv>();

// Global middleware. Order matters: requestId -> CORS -> logger -> auth.
app.use("*", requestId());
app.use("*", corsMiddleware);
app.use("*", honoLogger());
app.use("*", async (c, next) => {
  c.set("requestId", c.get("requestId") ?? crypto.randomUUID());
  c.set("user", undefined as unknown as null); // sentinel — getCurrentUser memoizes
  await next();
});
app.use("*", authMiddleware);

mountRoutes(app);

app.notFound((c) =>
  c.json({ success: false, error: "Not found", code: "resource_not_found" as const }, 404),
);

app.onError((err, c) => {
  console.error("[api] unhandled error:", err);
  return failureResponse(c, err);
});

const scheduled = makeCronHandler(app.fetch as never);

export default {
  fetch: app.fetch,
  scheduled,
  queue: handleQueue,
};
