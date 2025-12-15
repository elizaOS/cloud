/**
 * ALB Listener Rule Priority Manager
 *
 * Manages unique priority assignment for ALB listener rules.
 * ALB priorities must be unique integers between 1 and 50,000.
 *
 * SIMPLIFIED APPROACH:
 * - Sequential allocation: next_priority = max(priority) + 1
 * - Released priorities are marked with released_at timestamp
 * - Cleanup cron deletes released priorities after 1 hour (allows audit trail)
 * - No complex hashing or collision handling needed
 */

import { db } from "@/db/client";
import { albPriorities } from "@/db/schemas/alb-priorities";
import { eq, sql, lt, and, isNotNull, isNull } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

/**
 * Database-backed priority manager (PRODUCTION)
 *
 * Uses PostgreSQL with sequential allocation and soft deletes.
 */
export class DatabasePriorityManager {
  /**
   * Allocate next available ALB priority for a user
   * Uses simple sequential allocation with database transaction
   */
  async allocatePriority(userId: string): Promise<number> {
    logger.info(
      `[ALB allocatePriority] Starting allocation for user ${userId}`,
    );

    return await db.transaction(async (tx) => {
      logger.info(
        `[ALB allocatePriority] Inside transaction for user ${userId}`,
      );

      // Check if user already has an active priority
      const existing = await tx.query.albPriorities.findFirst({
        where: eq(albPriorities.userId, userId),
      });

      if (existing && !existing.expiresAt) {
        logger.info(
          `[ALB allocatePriority] User ${userId} already has priority ${existing.priority}`,
        );
        return existing.priority;
      }

      // Get the maximum priority (including expired ones to avoid conflicts)
      const [maxResult] = await tx
        .select({
          maxPriority: sql<number>`COALESCE(MAX(${albPriorities.priority}), 0)`,
        })
        .from(albPriorities);

      const nextPriority = (maxResult?.maxPriority || 0) + 1;

      // Validate we haven't exceeded ALB limit
      if (nextPriority > 50000) {
        throw new Error(
          "ALB priority limit exceeded - too many containers created (max 50,000)",
        );
      }

      logger.info(
        `[ALB] Attempting to allocate priority ${nextPriority} for user ${userId}`,
      );

      // Create new priority record
      // Note: priority column has unique constraint, so this will fail if there's a conflict
      const [inserted] = await tx
        .insert(albPriorities)
        .values({
          userId,
          priority: nextPriority,
          createdAt: new Date(),
          // expiresAt is omitted - will default to NULL in the database
        })
        .returning();

      logger.info(
        `✅ Allocated ALB priority ${nextPriority} for user ${userId}`,
      );
      return inserted.priority;
    });
  }

  /**
   * Release a priority when a container is deleted
   * Sets expiry timestamp for cleanup (1 hour grace period for audit)
   */
  async releasePriority(userId: string): Promise<void> {
    // Set expiry date (1 hour from now for audit trail)
    const expiryDate = new Date(Date.now() + 60 * 60 * 1000);

    const result = await db
      .update(albPriorities)
      .set({ expiresAt: expiryDate })
      .where(eq(albPriorities.userId, userId))
      .returning();

    if (result.length > 0) {
      logger.info(
        `✅ Released ALB priority ${result[0].priority} for user ${userId} (expires: ${expiryDate.toISOString()})`,
      );
    } else {
      console.warn(`⚠️  No ALB priority found for user ${userId}`);
    }
  }

  /**
   * Get priority for a user (without allocating if doesn't exist)
   */
  async getPriority(userId: string): Promise<number | undefined> {
    const result = await db.query.albPriorities.findFirst({
      where: eq(albPriorities.userId, userId),
    });

    // Only return if not expired
    if (result && !result.expiresAt) {
      return result.priority;
    }

    return undefined;
  }

  /**
   * Cleanup expired priorities (run this via cron every hour)
   * Permanently deletes priorities that have expired
   */
  async cleanupExpiredPriorities(): Promise<number> {
    const now = new Date();
    const deleted = await db
      .delete(albPriorities)
      .where(
        and(
          isNotNull(albPriorities.expiresAt),
          lt(albPriorities.expiresAt, now),
        ),
      )
      .returning();

    if (deleted.length > 0) {
      logger.info(
        `🧹 Cleaned up ${deleted.length} expired ALB priorities (freed ${deleted.map((p) => p.priority).join(", ")})`,
      );
    }

    return deleted.length;
  }

  /**
   * Get all active priorities (for debugging/monitoring)
   */
  async getAllActivePriorities(): Promise<
    Array<{ userId: string; priority: number; createdAt: Date }>
  > {
    const results = await db.query.albPriorities.findMany({
      where: isNull(albPriorities.expiresAt),
      columns: {
        userId: true,
        priority: true,
        createdAt: true,
      },
      orderBy: (albPriorities, { asc }) => [asc(albPriorities.priority)],
    });

    return results.map((r) => ({
      userId: r.userId,
      priority: r.priority,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Get statistics about priority allocation
   */
  async getStats(): Promise<{
    totalActive: number;
    totalExpired: number;
    highestPriority: number;
    availableSlots: number;
  }> {
    const [activeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(albPriorities)
      .where(isNull(albPriorities.expiresAt));

    const [expiredCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(albPriorities)
      .where(isNotNull(albPriorities.expiresAt));

    const [maxResult] = await db
      .select({ max: sql<number>`COALESCE(MAX(${albPriorities.priority}), 0)` })
      .from(albPriorities)
      .where(isNull(albPriorities.expiresAt));

    const highestPriority = maxResult?.max || 0;
    const totalActive = activeCount?.count || 0;
    const totalExpired = expiredCount?.count || 0;

    return {
      totalActive,
      totalExpired,
      highestPriority,
      availableSlots: 50000 - totalActive,
    };
  }
}

export const dbPriorityManager = new DatabasePriorityManager();
