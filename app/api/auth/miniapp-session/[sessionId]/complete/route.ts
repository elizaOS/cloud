/**
 * POST /api/auth/miniapp-session/[sessionId]/complete
 * Complete miniapp authentication for a session
 *
 * Called by the Cloud web UI after user logs in via Privy.
 * Generates an auth token and returns the callback URL.
 *
 * For new users signing up through apps, sets initial credits to 100 ($1.00)
 * instead of the default 500 ($5.00).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { miniappAuthSessionsService } from "@/lib/services/miniapp-auth-sessions";
import { organizationsService } from "@/lib/services/organizations";
import { logger } from "@/lib/utils/logger";

// Initial credits for app users (100 credits = $1.00)
const APP_USER_INITIAL_CREDITS = "1.00";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 },
      );
    }

    // Require user to be authenticated via Privy
    const user = await requireAuthWithOrg();

    // Check if this is a new user (organization created within the last 60 seconds)
    // This indicates the user was just created through the app auth flow
    const orgCreatedAt = user.organization?.created_at;
    const isNewUser =
      orgCreatedAt && Date.now() - new Date(orgCreatedAt).getTime() < 60000;

    if (isNewUser && user.organization) {
      // New user signing up through app - set initial credits to 100 ($1.00)
      const currentBalance = parseFloat(user.organization.credit_balance);
      const defaultBalance = 5.0; // Default $5.00 from privy-sync

      // Only adjust if they have the default balance (not already modified)
      if (currentBalance === defaultBalance) {
        await organizationsService.update(user.organization_id, {
          credit_balance: APP_USER_INITIAL_CREDITS,
          updated_at: new Date(),
        });

        logger.info("[Miniapp Auth] Adjusted initial credits for app user", {
          userId: user.id,
          organizationId: user.organization_id,
          oldBalance: currentBalance,
          newBalance: APP_USER_INITIAL_CREDITS,
        });
      }
    }

    // Complete the authentication and generate auth token
    const result = await miniappAuthSessionsService.completeAuthentication(
      sessionId,
      user.id,
      user.organization_id,
    );

    return NextResponse.json({
      success: true,
      callbackUrl: result.callbackUrl,
      authToken: result.authToken,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    logger.error("Error completing miniapp authentication:", error);

    if (error instanceof Error) {
      if (
        error.message.includes("Invalid or expired session") ||
        error.message.includes("already authenticated")
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: "Failed to complete authentication" },
      { status: 500 },
    );
  }
}
