import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Edge Middleware
 *
 * Handles CORS preflight (OPTIONS) requests globally.
 * This is necessary because Next.js 16+ route handlers may not properly
 * receive OPTIONS requests when CORS headers are also configured in next.config.ts.
 *
 * This middleware runs at the edge before route handlers and ensures
 * OPTIONS requests always receive a proper 204 response with CORS headers.
 */
export function middleware(request: NextRequest) {
  // Only handle OPTIONS preflight requests for API routes
  if (request.method === "OPTIONS" && request.nextUrl.pathname.startsWith("/api/")) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-API-Key, X-Request-ID, Cookie, X-Miniapp-Token, X-Anonymous-Session",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Continue to route handler for all other requests
  return NextResponse.next();
}

// Configure which paths the middleware runs on
export const config = {
  matcher: [
    // Match all API routes
    "/api/:path*",
  ],
};
