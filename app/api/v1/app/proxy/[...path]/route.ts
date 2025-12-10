/**
 * App API Proxy - Proxies requests from apps to cloud API.
 * 
 * Allows apps to make authenticated API calls without exposing credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { addCorsHeaders, validateOrigin, createPreflightResponse } from "@/lib/middleware/cors-apps";
import { logger } from "@/lib/utils/logger";

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, [...ALLOWED_METHODS, "OPTIONS"]);
}

async function handleProxy(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const corsResult = await validateOrigin(request);
  const { path } = await params;
  const targetPath = "/" + path.join("/");

  try {
    const { user, organization } = await requireAuthOrApiKeyWithOrg(request);

    // Build target URL
    const targetUrl = new URL(`/api/v1${targetPath}`, BASE_URL);
    
    // Copy query params
    const { searchParams } = new URL(request.url);
    searchParams.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });

    // Get request body for non-GET requests
    let body: string | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.text();
    }

    // Make proxied request
    const proxyResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: {
        "Content-Type": request.headers.get("Content-Type") || "application/json",
        "X-Organization-Id": organization.id,
        "X-User-Id": user.id,
        "X-Proxy-Source": "app",
      },
      body,
    });

    // Forward response
    const responseBody = await proxyResponse.text();
    const response = new NextResponse(responseBody, {
      status: proxyResponse.status,
      headers: {
        "Content-Type": proxyResponse.headers.get("Content-Type") || "application/json",
      },
    });

    return addCorsHeaders(response, corsResult.origin);
  } catch (error) {
    logger.error("[App Proxy] Error", { error, path: targetPath });

    const status = error instanceof Error && error.message.includes("Unauthorized") ? 401 : 500;
    const response = NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Proxy error" },
      { status }
    );

    return addCorsHeaders(response, corsResult.origin);
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;

