import { NextRequest, NextResponse } from "next/server";
import { syncUserFromPrivy } from "@/lib/privy-sync";
import { getUserFromIdToken, getUserById } from "@/lib/auth/privy-client";
import { cookies } from "next/headers";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

/**
 * POST /api/auth/sync-user
 * Ensures a Privy user is synced to the local database immediately after authentication.
 * This prevents "please try reconnecting" errors for new users signing in.
 *
 * Called by the client after successful Privy authentication to guarantee
 * the user exists in our database before any other API calls are made.
 *
 * Rate limited: STANDARD (60 req/min per IP in production)
 */
async function handleSyncUser(request: NextRequest) {
  try {
    const body = await request.json();
    const { privyUserId } = body;

    if (!privyUserId) {
      return NextResponse.json(
        { success: false, error: "Missing privyUserId" },
        { status: 400 },
      );
    }

    logger.info("[SyncUser] Syncing user:", { privyUserId });

    // Get Privy user data from ID token or API
    let privyUser = null;

    // Try efficient method first: use privy-id-token to avoid rate limits
    const cookieStore = await cookies();
    const idToken = cookieStore.get("privy-id-token");
    
    if (idToken?.value) {
      logger.debug("[SyncUser] Using privy-id-token for user lookup");
      try {
        privyUser = await getUserFromIdToken(idToken.value);
      } catch (idTokenError) {
        logger.warn("[SyncUser] privy-id-token method failed, will fallback to userId");
      }
    }

    // Fallback: use userId directly (counts against rate limits)
    if (!privyUser) {
      logger.debug("[SyncUser] Using userId for user lookup (fallback)");
      privyUser = await getUserById(privyUserId);
    }

    if (!privyUser) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch user from Privy" },
        { status: 404 },
      );
    }

    // Sync user to database (create if doesn't exist, update if does)
    const user = await syncUserFromPrivy(privyUser);

    logger.info("[SyncUser] ✓ User synced successfully:", {
      userId: user.id,
      privyUserId: user.privy_user_id,
      organizationId: user.organization_id,
    });

    return NextResponse.json(
      {
        success: true,
        userId: user.id,
        organizationId: user.organization_id,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error(
      "[SyncUser] ✗ Error:",
      error instanceof Error ? error.message : error,
    );

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync user",
      },
      { status: 500 },
    );
  }
}

// Export rate-limited handler
export const POST = withRateLimit(handleSyncUser, RateLimitPresets.STANDARD);
