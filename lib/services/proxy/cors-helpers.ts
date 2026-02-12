
/**
 * Shared CORS helpers for Solana proxy route handlers.
 *
 * CORS: Unrestricted by design - see lib/services/proxy/cors.ts for security rationale.
 */

import { NextResponse } from "next/server";

export function getCorsHeaders(
  methods = "GET, POST, OPTIONS",
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleCorsOptions(methods = "GET, POST, OPTIONS"): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(methods),
  });
}
