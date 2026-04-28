/**
 * /api/elevenlabs/tts — alias for /api/v1/voice/tts.
 *
 * The Next.js version re-exported the v1 route handler. With Hono mounts
 * each leaf separately, so the simplest port is to delegate by re-importing
 * the converted v1 sub-app once it exists. Until then, return 501.
 */

import { Hono } from "hono";

import type { AppEnv } from "@/api-lib/context";

const app = new Hono<AppEnv>();

app.all("*", (c) =>
  c.json(
    {
      success: false,
      error: "not_yet_migrated",
      reason: "v1/voice/tts has not been converted yet",
    },
    501,
  ),
);

export default app;
