import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeOAuth3Session } from "@/lib/auth/oauth3-client";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const OAUTH3_TOKEN_COOKIE = "oauth3-token";

export async function POST(_request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(OAUTH3_TOKEN_COOKIE)?.value;

    if (token) {
      // Revoke the session on the OAuth3 agent
      await revokeOAuth3Session(token);

      logger.info("[OAuth3Logout] Session revoked", {
        tokenPrefix: token.substring(0, 10),
      });
    }

    // Clear the cookie
    const response = NextResponse.json({ success: true });
    response.cookies.delete(OAUTH3_TOKEN_COOKIE);

    // Also clear legacy Privy cookies for migration
    response.cookies.delete("privy-token");
    response.cookies.delete("privy-refresh-token");
    response.cookies.delete("privy-id-token");

    return response;
  } catch (error) {
    logger.error(
      "[OAuth3Logout] Error:",
      error instanceof Error ? error.message : error
    );

    // Still clear cookies even if server-side revocation fails
    const response = NextResponse.json({ success: true });
    response.cookies.delete(OAUTH3_TOKEN_COOKIE);
    response.cookies.delete("privy-token");
    response.cookies.delete("privy-refresh-token");
    response.cookies.delete("privy-id-token");

    return response;
  }
}

