/**
 * POST /api/my-agents/characters/avatar
 *
 * Uploads a character avatar image to blob storage.
 * Mirrors `_legacy_actions/characters.ts → uploadCharacterAvatar`.
 *
 * TODO(node-only): blocked from Workers — `@/lib/blob` depends on
 * `@vercel/blob` (Node `Buffer`, `process.env`). Stub returns 501 until
 * blob storage is moved behind a Workers-friendly client (R2 + presigned
 * URL) or handed off to a Node sidecar.
 */

import { Hono } from "hono";
import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();

app.all("/*", (c) =>
  c.json({ error: "not_yet_migrated", reason: "@vercel/blob not Workers-compatible" }, 501),
);

export default app;
