import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyOAuth3Token, getOAuth3User } from "@/lib/auth/oauth3-client";
import { syncUserFromOAuth3 } from "@/lib/oauth3-sync";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const OAUTH3_TOKEN_COOKIE = "oauth3-token";

export async function GET(_request: NextRequest) {
  const startTime = Date.now();

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(OAUTH3_TOKEN_COOKIE)?.value;

    if (!token) {
      return NextResponse.json(
        { session: null, user: null },
        { status: 200 }
      );
    }

    // Verify the OAuth3 token
    const claims = await verifyOAuth3Token(token);

    if (!claims) {
      // Invalid or expired token - clear the cookie
      const response = NextResponse.json(
        { session: null, user: null },
        { status: 200 }
      );
      response.cookies.delete(OAUTH3_TOKEN_COOKIE);
      return response;
    }

    // Get the full user data
    const oauth3User = await getOAuth3User(claims.sessionId);

    if (!oauth3User) {
      return NextResponse.json(
        { session: claims, user: null },
        { status: 200 }
      );
    }

    // Sync user to database and get the full user object
    const user = await syncUserFromOAuth3(oauth3User);

    logger.debug("[OAuth3Session] Session retrieved", {
      identityId: claims.identityId.substring(0, 16),
      userId: user.id,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      session: {
        sessionId: claims.sessionId,
        identityId: claims.identityId,
        smartAccount: claims.smartAccount,
        expiresAt: claims.expiresAt * 1000, // Convert to ms
        provider: claims.provider,
        providerId: claims.providerId,
        providerHandle: claims.providerHandle,
      },
      user: {
        id: user.id,
        identityId: claims.identityId,
        smartAccount: claims.smartAccount,
        provider: claims.provider,
        providerId: claims.providerId,
        providerHandle: claims.providerHandle,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        wallet: {
          address: user.wallet_address,
          chainId: 1, // Default to mainnet
        },
        linkedAccounts: oauth3User.linkedAccounts,
      },
    });
  } catch (error) {
    logger.error(
      "[OAuth3Session] Error getting session:",
      error instanceof Error ? error.message : error
    );

    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 500 }
    );
  }
}

