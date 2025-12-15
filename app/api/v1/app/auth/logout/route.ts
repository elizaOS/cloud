/**
 * App Auth Logout Endpoint - Clears session.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  addCorsHeaders,
  validateOrigin,
  createPreflightResponse,
} from "@/lib/middleware/cors-apps";

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return createPreflightResponse(origin, ["POST", "OPTIONS"]);
}

export async function POST(request: NextRequest) {
  const corsResult = await validateOrigin(request);

  // Clear session cookie
  const response = NextResponse.json({ success: true });
  response.cookies.delete("privy-token");
  response.cookies.delete("privy-session");

  return addCorsHeaders(response, corsResult.origin);
}
