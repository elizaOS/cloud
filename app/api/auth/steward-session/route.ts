import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { verifyStewardTokenCached } from "@/lib/auth/steward-client";

/**
 * POST /api/auth/steward-session
 *
 * Sets a steward-token cookie from a steward JWT.
 * Called by the client after steward auth succeeds (localStorage → cookie bridge).
 *
 * Body: { token: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body?.token;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Verify the token is valid before setting cookie
    const claims = await verifyStewardTokenCached(token);
    if (!claims) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Set cookie (httpOnly for security, same-site lax for redirects)
    const cookieStore = await cookies();
    cookieStore.set("steward-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({ ok: true, userId: claims.userId });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/auth/steward-session
 * Clears the steward-token cookie (logout)
 */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("steward-token");
  return NextResponse.json({ ok: true });
}
