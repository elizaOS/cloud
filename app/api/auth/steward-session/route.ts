import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { verifyStewardTokenCached } from "@/lib/auth/steward-client";

const STEWARD_REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

let stewardAuthMetricCounter = 0;

function logStewardAuth(outcome: string, ttl: number | null) {
  stewardAuthMetricCounter += 1;
  console.log("[steward-auth]", {
    timestamp: new Date().toISOString(),
    ttl,
    outcome,
    metric: stewardAuthMetricCounter,
  });
}

/**
 * POST /api/auth/steward-session
 *
 * Sets a steward-token cookie from a steward JWT.
 * Called by the client after steward auth succeeds (localStorage → cookie bridge).
 *
 * Body: { token: string, refreshToken?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body?.token;
    const refreshToken = body?.refreshToken;

    if (!token || typeof token !== "string") {
      logStewardAuth("missing-token", null);
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    // Verify the token is valid before setting cookie
    const claims = await verifyStewardTokenCached(token);
    if (!claims) {
      logStewardAuth("invalid-token", null);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const ttl = claims.expiration ? Math.max(0, claims.expiration - Math.floor(Date.now() / 1000)) : null;

    // Set cookie (httpOnly for security, same-site lax for redirects)
    const cookieStore = await cookies();
    cookieStore.set("steward-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(typeof ttl === "number" ? { maxAge: ttl } : {}),
    });

    if (typeof refreshToken === "string" && refreshToken.length > 0) {
      cookieStore.set("steward-refresh-token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: STEWARD_REFRESH_COOKIE_MAX_AGE,
      });
    }

    // Non-httpOnly flag so client JS can detect steward auth
    cookieStore.set("steward-authed", "1", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    logStewardAuth("ok", ttl);
    return NextResponse.json({ ok: true, userId: claims.userId });
  } catch {
    logStewardAuth("error", null);
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
  cookieStore.delete("steward-refresh-token");
  cookieStore.delete("steward-authed");
  logStewardAuth("deleted", null);
  return NextResponse.json({ ok: true });
}
