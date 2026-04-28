// Container backend = Hetzner-Docker over SSH (see cloud/INFRA.md).
// Metrics are a `docker stats --no-stream` snapshot via SSH. Implemented
// in `getMetrics()` on `hetzner-client.ts` and served by the Node sidecar
// — this Hono leaf returns 501 because `ssh2` cannot run on Workers.

import { Hono } from "hono";

import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();
app.all("*", (c) =>
  c.json(
    {
      success: false,
      error: "node_sidecar_required",
      reason:
        "Container metrics use `docker stats` over SSH; runs on the Node sidecar (see hetzner-client.ts).",
    },
    501,
  ),
);

export default app;
