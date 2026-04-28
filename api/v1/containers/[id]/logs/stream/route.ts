// Container backend = Hetzner-Docker over SSH (see cloud/INFRA.md).
// Live log streaming requires holding an open SSH channel for the lifetime
// of the client connection — incompatible with the Worker request model
// even if `ssh2` could run on Workers. This route stays 501 until the
// Node sidecar adds an SSE wrapper around `docker logs --follow`.

import { Hono } from "hono";

import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();
app.all("*", (c) =>
  c.json(
    {
      success: false,
      error: "node_sidecar_required",
      reason:
        "Live log stream needs an SSE wrapper around `docker logs --follow`; not yet implemented on the Node sidecar.",
    },
    501,
  ),
);

export default app;
