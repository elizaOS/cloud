/**
 * App Auth Login Endpoint - Redirects to OAuth provider.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider") || "google";
  const redirect = searchParams.get("redirect") || "/";
  
  // Build login URL with provider and redirect
  const loginUrl = new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai");
  loginUrl.searchParams.set("provider", provider);
  loginUrl.searchParams.set("redirect_uri", redirect);
  
  return NextResponse.redirect(loginUrl.toString());
}

