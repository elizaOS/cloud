import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyOAuth3Token, getOAuth3User } from "@/lib/auth/oauth3-client";
import { syncUserFromOAuth3 } from "@/lib/oauth3-sync";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const OAUTH3_TOKEN_COOKIE = "oauth3-token";
const OAUTH3_AGENT_URL = process.env.OAUTH3_AGENT_URL ?? "http://localhost:4200";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    logger.error("[OAuth3LinkCallback] Link error:", error);
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    logger.error("[OAuth3LinkCallback] Missing authorization code");
    return NextResponse.redirect(
      new URL("/settings?error=missing_code", request.url)
    );
  }

  try {
    // Get the current session
    const cookieStore = await cookies();
    const token = cookieStore.get(OAUTH3_TOKEN_COOKIE)?.value;

    if (!token) {
      return NextResponse.redirect(
        new URL("/login?error=not_authenticated", request.url)
      );
    }

    const currentClaims = await verifyOAuth3Token(token);

    if (!currentClaims) {
      return NextResponse.redirect(
        new URL("/login?error=session_expired", request.url)
      );
    }

    // Complete the account linking
    const response = await fetch(`${OAUTH3_AGENT_URL}/auth/link/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: currentClaims.sessionId,
        code,
        state,
        redirectUri: `${request.nextUrl.origin}/api/auth/oauth3/link-callback`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("[OAuth3LinkCallback] Link completion failed:", errorText);
      return NextResponse.redirect(
        new URL("/settings?error=link_failed", request.url)
      );
    }

    // Refresh user data
    const oauth3User = await getOAuth3User(currentClaims.sessionId);

    if (oauth3User) {
      await syncUserFromOAuth3(oauth3User);
    }

    logger.info("[OAuth3LinkCallback] Account linked successfully", {
      identityId: currentClaims.identityId.substring(0, 16),
    });

    return NextResponse.redirect(
      new URL("/settings?success=account_linked", request.url)
    );
  } catch (error) {
    logger.error(
      "[OAuth3LinkCallback] Error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.redirect(
      new URL("/settings?error=link_failed", request.url)
    );
  }
}

