/**
 * Shared CORS utilities for app API routes
 */

import { NextResponse } from "next/server";

export const APP_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Token, X-Api-Key, X-Payment, X-Payment-Response",
} as const;

export function corsOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...APP_CORS_HEADERS,
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * Wraps a app route handler with CORS error handling.
 * Ensures all errors return proper CORS headers so clients can read them.
 */
export function withCors<T>(
  handler: () => Promise<NextResponse<T>>
): Promise<NextResponse<T | { success: false; error: string }>> {
  return handler().catch((error: Error) => {
    const status = error.message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json(
      { success: false, error: error.message },
      { status, headers: APP_CORS_HEADERS }
    );
  });
}

