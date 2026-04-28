/**
 * /api/fal/proxy — proxies to fal.ai through @fal-ai/server-proxy.
 *
 * Uses the package's native Hono adapter so the proxy plumbing is owned
 * upstream. We layer Steward auth via requireUserOrApiKeyWithOrg before
 * delegating to the proxy handler.
 */

import { DEFAULT_ALLOWED_URL_PATTERNS, resolveApiKeyFromEnv } from "@fal-ai/server-proxy";
import { createRouteHandler } from "@fal-ai/server-proxy/hono";
import { Hono } from "hono";

import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";

const falHandler = createRouteHandler({
  allowedUrlPatterns: DEFAULT_ALLOWED_URL_PATTERNS,
  allowedEndpoints: ["fal-ai/**"],
  allowUnauthorizedRequests: false,
  isAuthenticated: async () => true,
  resolveFalAuth: resolveApiKeyFromEnv,
});

const app = new Hono<AppEnv>();

const handle = async (c: Parameters<typeof falHandler>[0]) => {
  try {
    await requireUserOrApiKeyWithOrg(c);
  } catch (error) {
    return failureResponse(c, error);
  }
  return falHandler(c);
};

app.get("/", handle);
app.post("/", handle);
app.put("/", handle);

export default app;
