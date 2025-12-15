/**
 * App API Proxy
 *
 * Proxies all app requests to the main /api/v1/* endpoints with CORS support.
 * This allows apps to call the unified API with proper cross-origin handling.
 *
 * /api/v1/app/credentials/* -> /api/v1/credentials/*
 * /api/v1/app/secrets/*     -> /api/v1/secrets/*
 * /api/v1/app/bots/*        -> /api/v1/bots/*
 * /api/v1/app/tasks/*       -> /api/v1/tasks/*
 * etc.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  validateOrigin,
  addCorsHeaders,
  createPreflightResponse,
} from "@/lib/middleware/cors";

const EXCLUDED_PATHS = ["auth", "user", "storage"]; // These stay app-specific

export async function OPTIONS(request: NextRequest) {
  const cors = await validateOrigin(request);
  return createPreflightResponse(cors.origin, [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ]);
}

async function proxyRequest(
  request: NextRequest,
  path: string[],
  method: string,
) {
  const cors = await validateOrigin(request);

  // Build target URL - proxy to main API
  const targetPath = `/api/v1/${path.join("/")}`;
  const targetUrl = new URL(targetPath, request.url);

  // Preserve query params
  request.nextUrl.searchParams.forEach((v, k) =>
    targetUrl.searchParams.set(k, v),
  );

  // Forward headers
  const headers = new Headers();
  [
    "content-type",
    "authorization",
    "x-api-key",
    "x-app-token",
    "x-app-id",
  ].forEach((h) => {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  });

  // Get body for non-GET
  let body: string | null = null;
  if (method !== "GET" && method !== "HEAD") {
    body = await request.text();
  }

  const response = await fetch(targetUrl.toString(), { method, headers, body });
  const data = await response.json().catch(() => ({}));

  return addCorsHeaders(
    NextResponse.json(data, { status: response.status }),
    cors.origin,
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (EXCLUDED_PATHS.includes(path[0])) {
    // Let specific app routes handle these
    return NextResponse.json(
      { error: "Use specific endpoint" },
      { status: 404 },
    );
  }
  return proxyRequest(request, path, "GET");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (EXCLUDED_PATHS.includes(path[0])) {
    return NextResponse.json(
      { error: "Use specific endpoint" },
      { status: 404 },
    );
  }
  return proxyRequest(request, path, "POST");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path, "PUT");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path, "PATCH");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyRequest(request, path, "DELETE");
}
