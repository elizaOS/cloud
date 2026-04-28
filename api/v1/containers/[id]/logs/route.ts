// Container backend = Hetzner-Docker over SSH (see cloud/INFRA.md).
// SSH (`ssh2`) is Node-only; this Hono leaf returns 501 on the Worker.
// The real handler lives in the Node sidecar that hosts the container
// control plane and is reachable by proxying this URL there. The
// implementation is `tailLogs()` on `hetzner-client.ts`.

import { Hono } from "hono";

import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();
app.all("*", (c) =>
  c.json(
    {
      success: false,
      error: "node_sidecar_required",
      reason:
        "Container log fetch is `docker logs` over SSH; runs on the Node sidecar (see hetzner-client.ts).",
    },
    501,
  ),
);

export default app;
