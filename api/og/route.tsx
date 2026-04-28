// TODO(node-only): blocked from Workers due to `next/og` (ImageResponse uses Node satori + native fonts)
// Original handler removed for Workers — see git history for the JSX version.
// Recommended: render OG images from a separate worker or a Node sidecar
// (cloudflare-image-resizing, satori-html on a Node service, etc.).

import { Hono } from "hono";

import type { AppEnv } from "../../src/lib/context";

const app = new Hono<AppEnv>();

app.all("*", (c) =>
  c.json(
    {
      success: false,
      error: "not_yet_migrated",
      reason: "next/og ImageResponse not Workers-compatible",
    },
    501,
  ),
);

export default app;
