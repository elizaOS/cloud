/**
 * /api/fal/proxy — proxies to fal.ai through @fal-ai/server-proxy.
 *
 * The proxy SDK assumes a Next-shaped handler with `getRequestBody`,
 * `getHeaders`, etc. We reuse those helpers but feed Hono primitives.
 */

import {
  DEFAULT_ALLOWED_URL_PATTERNS,
  fromHeaders,
  handleRequest,
  type ProxyConfig,
  resolveApiKeyFromEnv,
  responsePassthrough,
} from "@fal-ai/server-proxy";
import { Hono } from "hono";

import { requireUserOrApiKeyWithOrg } from "../../../src/lib/auth";
import type { AppEnv } from "../../../src/lib/context";
import { failureResponse } from "../../../src/lib/errors";

const FAL_PROXY_CONFIG: ProxyConfig = {
  allowedUrlPatterns: DEFAULT_ALLOWED_URL_PATTERNS,
  allowedEndpoints: ["fal-ai/**"],
  allowUnauthorizedRequests: false,
  isAuthenticated: async () => true,
  resolveFalAuth: resolveApiKeyFromEnv,
};

const app = new Hono<AppEnv>();

const handle = async (c: Parameters<Parameters<typeof app.all>[1]>[0]) => {
  try {
    await requireUserOrApiKeyWithOrg(c);
  } catch (error) {
    return failureResponse(c, error);
  }

  const responseHeaders = new Headers();
  const req = c.req.raw;

  return handleRequest<Response>(
    {
      id: "hono-workers",
      method: req.method,
      getRequestBody: async () => req.text(),
      getHeaders: () => fromHeaders(req.headers),
      getHeader: (name) => req.headers.get(name),
      sendHeader: (name, value) => responseHeaders.set(name, value),
      respondWith: (status, data) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { ...Object.fromEntries(responseHeaders), "Content-Type": "application/json" },
        }),
      sendResponse: responsePassthrough,
    },
    FAL_PROXY_CONFIG,
  );
};

app.get("/", handle);
app.post("/", handle);
app.put("/", handle);

export default app;
