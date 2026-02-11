
/**
 * Shared CORS utilities for proxy service routes.
 * 
 * CORS: Unrestricted by design for public API endpoints.
 * All Solana route files share these helpers to ensure consistent CORS behavior.
 */

import { NextResponse } from "next/server";

export function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleCorsOptions(allowMethods: string = "GET, POST, OPTIONS"): NextResponse {
  const headers = getCorsHeaders();
  headers["Access-Control-Allow-Methods"] = allowMethods;
  return new NextResponse(null, { status: 204, headers });
}
