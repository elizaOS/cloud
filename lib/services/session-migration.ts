import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { anonymousSessionsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

/**
 * Session Migration Utilities
 * 
 * Handles migrating anonymous user data to authenticated user accounts
 * when users sign up after using the platform anonymously.
 */

export interface MigrationResult {
  success: boolean;
  charactersTransferred: number;
  roomsTransferred: number;
  error?: string;
}

/**
 * Migrate all data from anonymous user to authenticated user
 * 
 * This includes:
 * - Characters created by anonymous user
 * - Chat rooms and conversations
 * - Room-character mappings
 * 
 * @param anonymousUserId - The UUID of the anonymous user
 * @param authenticatedUserId - The UUID of the new authenticated user
 * @param sessionId - The session token to mark as converted
 * @returns Migration result with counts
 */
export async function migrateAnonymousSession(
  anonymousUserId: string,
  authenticatedUserId: string,
  sessionId: string
): Promise<MigrationResult> {
  logger.info("[Session Migration] Starting migration", {
    from: anonymousUserId,
    to: authenticatedUserId,
    session: sessionId,
  });

  try {
    // Start transaction
    const result = await db.transaction(async (tx) => {
      let charactersTransferred = 0;
      let roomsTransferred = 0;

      // 1. Transfer characters to new user
      const charactersResult = await tx.execute(
        sql`
          UPDATE user_characters 
          SET user_id = ${authenticatedUserId},
              updated_at = NOW()
          WHERE user_id = ${anonymousUserId}
          RETURNING id
        `
      );
      charactersTransferred = charactersResult.rowCount || 0;

      logger.info(
        `[Session Migration] Transferred ${charactersTransferred} characters`
      );

      // 2. Transfer room-character mappings to new user
      const roomsResult = await tx.execute(
        sql`
          UPDATE eliza_room_characters 
          SET user_id = ${authenticatedUserId},
              updated_at = NOW()
          WHERE user_id = ${anonymousUserId}
          RETURNING room_id
        `
      );
      roomsTransferred = roomsResult.rowCount || 0;

      logger.info(
        `[Session Migration] Transferred ${roomsTransferred} room mappings`
      );

      // 3. Update room participants (ElizaOS tables)
      // Note: This updates the entity connections to use new user ID
      await tx.execute(
        sql`
          UPDATE participants 
          SET metadata = COALESCE(metadata, '{}'::jsonb) || 
                        jsonb_build_object('migratedUserId', ${authenticatedUserId})
          WHERE metadata->>'userId' = ${anonymousUserId}
        `
      );

      // 4. Mark anonymous session as converted
      await tx.execute(
        sql`
          UPDATE anonymous_sessions
          SET converted_at = NOW(),
              is_active = false
          WHERE session_token = ${sessionId}
        `
      );

      return {
        charactersTransferred,
        roomsTransferred,
      };
    });

    logger.info("[Session Migration] ✅ Migration completed successfully", {
      ...result,
      from: anonymousUserId,
      to: authenticatedUserId,
    });

    return {
      success: true,
      ...result,
    };
  } catch (error) {
    logger.error("[Session Migration] ❌ Migration failed", error);

    return {
      success: false,
      charactersTransferred: 0,
      roomsTransferred: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if a session can be migrated
 * 
 * @param sessionId - The session token to check
 * @returns Whether the session exists and is valid for migration
 */
export async function canMigrateSession(sessionId: string): Promise<boolean> {
  try {
    const session = await anonymousSessionsService.getByToken(sessionId);

    if (!session) {
      return false;
    }

    // Cannot migrate already converted sessions
    if (session.converted_at) {
      logger.warn(
        `[Session Migration] Session ${sessionId} already converted`
      );
      return false;
    }

    // Cannot migrate expired sessions
    if (session.expires_at < new Date()) {
      logger.warn(`[Session Migration] Session ${sessionId} expired`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[Session Migration] Error checking migration eligibility", error);
    return false;
  }
}

/**
 * Get migration preview - what will be transferred
 * 
 * @param anonymousUserId - The anonymous user ID
 * @returns Counts of items that will be migrated
 */
export async function getMigrationPreview(anonymousUserId: string): Promise<{
  characters: number;
  rooms: number;
  messages: number;
}> {
  try {
    // Count characters
    const charactersResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM user_characters WHERE user_id = ${anonymousUserId}`
    );
    const charactersCount = Number(charactersResult.rows[0]?.count || 0);

    // Count rooms
    const roomsResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM eliza_room_characters WHERE user_id = ${anonymousUserId}`
    );
    const roomsCount = Number(roomsResult.rows[0]?.count || 0);

    // Estimate messages (from anonymous session)
    const messagesResult = await db.execute(
      sql`
        SELECT COALESCE(SUM(message_count), 0) as count 
        FROM anonymous_sessions 
        WHERE user_id = ${anonymousUserId}
      `
    );
    const messagesCount = Number(messagesResult.rows[0]?.count || 0);

    return {
      characters: charactersCount,
      rooms: roomsCount,
      messages: messagesCount,
    };
  } catch (error) {
    logger.error("[Session Migration] Error getting preview", error);
    return {
      characters: 0,
      rooms: 0,
      messages: 0,
    };
  }
}

/**
 * Clean up anonymous user data after successful migration
 * 
 * WARNING: This permanently deletes the anonymous user and related sessions
 * Only call this after confirming successful migration!
 * 
 * @param anonymousUserId - The anonymous user ID to clean up
 */
export async function cleanupAnonymousUser(anonymousUserId: string): Promise<void> {
  logger.info(`[Session Migration] Cleaning up anonymous user ${anonymousUserId}`);

  try {
    // Delete anonymous sessions (CASCADE will handle related data)
    await db.execute(
      sql`DELETE FROM anonymous_sessions WHERE user_id = ${anonymousUserId}`
    );

    // Note: Don't delete the user record itself - it may have references
    // Just mark sessions as inactive and converted
    logger.info(`[Session Migration] ✅ Cleanup completed for ${anonymousUserId}`);
  } catch (error) {
    logger.error("[Session Migration] ❌ Cleanup failed", error);
    // Don't throw - cleanup failure shouldn't break the flow
  }
}

