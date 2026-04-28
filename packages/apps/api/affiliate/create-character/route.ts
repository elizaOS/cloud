import { Hono } from "hono";

// TODO(node-only): blocked from Workers — depends on `@vercel/blob` via
// `processAffiliateImages` for avatar/reference uploads. Move blob storage
// behind a Workers-friendly client (R2 + presigned URL) or hand off to a
// Node sidecar to re-enable.
const app = new Hono();
app.all("/*", (c) =>
  c.json({ error: "not_yet_migrated", reason: "@vercel/blob not Workers-compatible" }, 501),
);
export default app;
