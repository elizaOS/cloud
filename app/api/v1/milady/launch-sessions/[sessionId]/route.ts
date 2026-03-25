import { NextRequest, NextResponse } from "next/server";
import { cache } from "@/lib/cache/client";
import {
  type ManagedLaunchSessionPayload,
  resolveLaunchSessionCacheKey,
  resolveMiladyLaunchAllowedOrigins,
} from "@/lib/services/milady-managed-launch";

export const dynamic = "force-dynamic";

function getCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigins = new Set(resolveMiladyLaunchAllowedOrigins());
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };

  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request.headers.get("origin")),
  });
}

type RouteParams = { params: Promise<{ sessionId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { sessionId } = await params;
  const headers = getCorsHeaders(request.headers.get("origin"));
  const payload = await cache.getAndDelete<ManagedLaunchSessionPayload>(
    resolveLaunchSessionCacheKey(sessionId),
  );

  if (!payload) {
    return NextResponse.json(
      {
        success: false,
        error: "Launch session not found or expired",
      },
      {
        status: 404,
        headers,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: payload,
    },
    { headers },
  );
}
