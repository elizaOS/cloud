import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { convertAnonymousToReal } from "@/lib/auth-anonymous";
import { anonymousSessionsService } from "@/lib/services";
import { requireAuth } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/auth/migrate-anonymous
 *
 * Called by client after successful Privy authentication to migrate
 * anonymous user data to the newly authenticated account.
 *
 * This must be called from the client (not webhook) because it needs
 * access to the user's browser cookies to read the anonymous session token.
 *
 * Flow:
 * 1. User authenticates with Privy (gets Privy session)
 * 2. Client detects authentication success
 * 3. Client calls this endpoint with cookies
 * 4. Server reads anonymous session cookie
 * 5. Server migrates anonymous data to authenticated user
 * 6. Server clears anonymous cookie
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user from Privy session
    const user = await requireAuth();
    const privyUserId = user.privy_user_id;

    if (!privyUserId) {
      logger.warn("migrate-anonymous", "No Privy user ID found", {
        userId: user.id,
      });
      return NextResponse.json(
        { error: "No Privy user ID found" },
        { status: 400 },
      );
    }

    // Check for anonymous session cookie
    const cookieStore = await cookies();
    const anonSessionToken = cookieStore.get("eliza-anon-session")?.value;

    if (!anonSessionToken) {
      // No anonymous session to migrate - this is fine
      logger.info("migrate-anonymous", "No anonymous session found", {
        privyUserId,
        userId: user.id,
      });
      return NextResponse.json({
        success: true,
        migrated: false,
        message: "No anonymous session to migrate",
      });
    }

    // Get anonymous session
    const anonSession =
      await anonymousSessionsService.getByToken(anonSessionToken);

    if (!anonSession) {
      logger.warn("migrate-anonymous", "Invalid anonymous session token", {
        privyUserId,
      });
      // Clear invalid cookie
      cookieStore.delete("eliza-anon-session");
      return NextResponse.json({
        success: true,
        migrated: false,
        message: "Invalid anonymous session",
      });
    }

    // Check if session was already converted
    if (anonSession.converted_at) {
      logger.info("migrate-anonymous", "Session already converted", {
        privyUserId,
        sessionId: anonSession.id,
        convertedAt: anonSession.converted_at,
      });
      cookieStore.delete("eliza-anon-session");
      return NextResponse.json({
        success: true,
        migrated: false,
        message: "Session already migrated",
      });
    }

    // Perform migration
    logger.info("migrate-anonymous", "Starting migration", {
      privyUserId,
      anonymousUserId: anonSession.user_id,
      messageCount: anonSession.message_count,
    });

    await convertAnonymousToReal(anonSession.user_id, privyUserId);

    // Clear cookie after successful migration (also cleared in convertAnonymousToReal)
    cookieStore.delete("eliza-anon-session");

    logger.info("migrate-anonymous", "Migration completed successfully", {
      privyUserId,
      anonymousUserId: anonSession.user_id,
      messagesTransferred: anonSession.message_count,
    });

    return NextResponse.json({
      success: true,
      migrated: true,
      message: "Anonymous data migrated successfully",
      messagesTransferred: anonSession.message_count,
    });
  } catch (error) {
    logger.error("migrate-anonymous", "Migration failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Don't fail the request - user can still use the app
    // Just log the error for manual review
    return NextResponse.json(
      {
        success: false,
        migrated: false,
        error: error instanceof Error ? error.message : "Migration failed",
      },
      { status: 500 },
    );
  }
}
