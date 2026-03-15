import {
  DEFAULT_ALLOWED_URL_PATTERNS,
  fromHeaders,
  handleRequest,
  type ProxyConfig,
  resolveApiKeyFromEnv,
  responsePassthrough,
} from "@fal-ai/server-proxy";
import { NextRequest, NextResponse } from "next/server";
import { getErrorStatusCode, getSafeErrorMessage } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";

const FAL_PROXY_CONFIG: ProxyConfig = {
  allowedUrlPatterns: DEFAULT_ALLOWED_URL_PATTERNS,
  allowedEndpoints: ["fal-ai/**"],
  allowUnauthorizedRequests: false,
  isAuthenticated: async () => true,
  resolveFalAuth: resolveApiKeyFromEnv,
};

async function handle(request: NextRequest) {
  try {
    await requireAuthOrApiKeyWithOrg(request);
  } catch (error) {
    return NextResponse.json(
      { error: getSafeErrorMessage(error) },
      { status: getErrorStatusCode(error) },
    );
  }

  const responseHeaders = new Headers();

  return handleRequest<Response>(
    {
      id: "nextjs-app-router",
      method: request.method,
      getRequestBody: async () => request.text(),
      getHeaders: () => fromHeaders(request.headers),
      getHeader: (name) => request.headers.get(name),
      sendHeader: (name, value) => responseHeaders.set(name, value),
      respondWith: (status, data) =>
        NextResponse.json(data, {
          status,
          headers: responseHeaders,
        }),
      sendResponse: responsePassthrough,
    },
    FAL_PROXY_CONFIG,
  );
}

export { handle as GET, handle as POST, handle as PUT };
