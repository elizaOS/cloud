import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth";
import { migrateAnonymousSession } from "@/lib/session";
import { anonymousSessionsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

const ANON_SESSION_COOKIE = "eliza-anon-session";

/**
 * POST /api/auth/migrate-anonymous
 * 
 * Migrates anonymous user data to the authenticated user.
 * Should be called from the frontend after successful Privy authentication.
 * 
 * This endpoint:
 * 1. Gets the anonymous session from the cookie (or request body)
 * 2. Verifies the authenticated user
 * 3. Calls convertAnonymousToReal to migrate all data
 * 
 * Request body (optional):
 * {
 *   sessionToken?: string  // Anonymous session token if cookie not available
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Get the authenticated user
    const user = await requireAuth();

    if (!user.privy_user_id) {
      return NextResponse.json(
        { error: "User does not have a Privy ID" },
        { status: 400 }
      );
    }

    logger.info("[Migrate Anonymous] Starting migration for user:", user.id);

    // 2. Get anonymous session token from cookie or request body
    const cookieStore = await cookies();
    let sessionToken = cookieStore.get(ANON_SESSION_COOKIE)?.value;
    
    // Also check request body for token (in case cookie is not available)
    if (!sessionToken) {
      try {
        const body = await request.json().catch(() => ({}));
        sessionToken = body.sessionToken;
      } catch {
        // No body or invalid JSON - that's okay
      }
    }

    if (!sessionToken) {
      logger.info("[Migrate Anonymous] No anonymous session found, nothing to migrate");
      return NextResponse.json({
        success: true,
        message: "No anonymous session to migrate",
        migrated: false,
      });
    }

    // 3. Get the anonymous session and user
    const anonSession = await anonymousSessionsService.getByToken(sessionToken);
    
    if (!anonSession) {
      logger.info("[Migrate Anonymous] Anonymous session not found for token:", sessionToken.slice(0, 8) + "...");
      return NextResponse.json({
        success: true,
        message: "Anonymous session not found or already migrated",
        migrated: false,
      });
    }

    // Check if already converted
    if (anonSession.converted_at) {
      logger.info("[Migrate Anonymous] Session already converted:", anonSession.id);
      
      // Clean up the cookie
      cookieStore.delete(ANON_SESSION_COOKIE);
      
      return NextResponse.json({
        success: true,
        message: "Session already migrated",
        migrated: false,
      });
    }

    // 4. Perform the migration
    logger.info("[Migrate Anonymous] Migrating anonymous user:", {
      anonymousUserId: anonSession.user_id,
      toPrivyUserId: user.privy_user_id,
      authenticatedUserId: user.id,
      messageCount: anonSession.message_count,
    });

    const migrationResult = await migrateAnonymousSession(
      anonSession.user_id,
      user.privy_user_id
    );

    logger.info("[Migrate Anonymous] Migration completed", migrationResult);

    // Cookie is cleared by migrateAnonymousSession, but ensure it's cleared here too
    try {
      cookieStore.delete(ANON_SESSION_COOKIE);
    } catch {
      // May fail if not in request context
    }

    return NextResponse.json({
      success: true,
      message: "Anonymous data migrated successfully",
      migrated: true,
      details: migrationResult.mergedData,
    });
  } catch (error) {
    logger.error("[Migrate Anonymous] Error during migration:", error);
    
    // Don't expose internal errors
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to migrate anonymous data",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
