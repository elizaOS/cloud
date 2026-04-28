/**
 * /api/v1/connections/[platform] — generic dispatcher to per-platform connect/
 * disconnect handlers. Currently supports `twilio` and `blooio`.
 */

import { Hono } from "hono";

import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";

import blooioConnect from "../../blooio/connect/route";
import blooioDisconnect from "../../blooio/disconnect/route";
import twilioConnect from "../../twilio/connect/route";
import twilioDisconnect from "../../twilio/disconnect/route";

type SupportedPlatform = "twilio" | "blooio";

function resolvePlatform(raw: string | undefined): SupportedPlatform | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === "twilio" || normalized === "blooio") return normalized;
  return null;
}

const app = new Hono<AppEnv>();

app.post("/", async (c) => {
  try {
    const platform = resolvePlatform(c.req.param("platform"));
    if (!platform) return c.json({ error: "Unsupported platform" }, 404);

    const sub = platform === "twilio" ? twilioConnect : blooioConnect;
    return sub.fetch(c.req.raw, c.env, c.executionCtx);
  } catch (error) {
    return failureResponse(c, error);
  }
});

app.delete("/", async (c) => {
  try {
    const platform = resolvePlatform(c.req.param("platform"));
    if (!platform) return c.json({ error: "Unsupported platform" }, 404);

    const sub = platform === "twilio" ? twilioDisconnect : blooioDisconnect;
    return sub.fetch(c.req.raw, c.env, c.executionCtx);
  } catch (error) {
    return failureResponse(c, error);
  }
});

// Support clients that use POST semantics for disconnect via PATCH.
app.patch("/", async (c) => {
  try {
    const platform = resolvePlatform(c.req.param("platform"));
    if (!platform) return c.json({ error: "Unsupported platform" }, 404);

    const sub = platform === "twilio" ? twilioDisconnect : blooioDisconnect;
    // Re-issue as POST so the disconnect sub-app handles it.
    const url = new URL(c.req.url);
    url.pathname = "/";
    const forwarded = new Request(url.toString(), {
      method: "POST",
      headers: c.req.raw.headers,
      body: c.req.raw.body,
    });
    return sub.fetch(forwarded, c.env, c.executionCtx);
  } catch (error) {
    return failureResponse(c, error);
  }
});

export default app;
