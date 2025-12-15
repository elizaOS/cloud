/**
 * OAuth3 Callback Handler
 * 
 * Handles OAuth provider callbacks and completes the login flow.
 */

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { completeOAuth3Login } from "@/lib/auth-oauth3";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription || error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/login?error=Missing authorization code or state", request.url)
    );
  }

  const session = await completeOAuth3Login(state, code);

  const cookieStore = await cookies();
  cookieStore.set("oauth3-token", session.sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 86400,
    path: "/",
  });

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
