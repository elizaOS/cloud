/**
 * /api/a2a — Agent-to-Agent JSON-RPC endpoint (A2A spec v0.3.0).
 *
 * Workers stub: depends on the elizaOS agent runtime via
 * `packages/lib/services/agents/agents.ts`, which transitively imports
 * `@elizaos/core` and triggers forbidden top-level I/O. Agent runtime lives
 * on the Node sidecar (`services/agent-server`); the sidecar serves this URL.
 * See cloud/INFRA.md "Long-running services NOT migrated".
 */

import { Hono } from "hono";
import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();
app.all("/", (c) =>
  c.json(
    { success: false, error: "Not implemented on Workers (agent-server sidecar handles this)" },
    501,
  ),
);

export default app;
