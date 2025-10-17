/**
 * ALB Listener Rule Priority Manager
 * 
 * Manages unique priority assignment for ALB listener rules.
 * ALB priorities must be unique integers between 1 and 50,000.
 * 
 * This service uses DynamoDB to track assigned priorities and ensure
 * no conflicts when creating new container deployments.
 */

import crypto from "node:crypto";

/**
 * Generate a deterministic priority number from a user ID
 * Maps any string to a number between 1 and 50,000
 */
export function generatePriorityFromUserId(userId: string): number {
  // Use first 8 characters of SHA-256 hash
  const hash = crypto.createHash("sha256").update(userId).digest("hex");
  const hashInt = parseInt(hash.substring(0, 8), 16);
  
  // Map to range 1-50000
  const priority = (hashInt % 49999) + 1;
  
  return priority;
}

/**
 * In-memory priority tracking (in production, use DynamoDB or Redis)
 */
class PriorityManager {
  private assignedPriorities = new Map<number, string>(); // priority -> userId
  private userPriorities = new Map<string, number>(); // userId -> priority

  /**
   * Get a unique priority for a user ID
   * If user already has a priority, return it
   * Otherwise, generate a new one and handle collisions
   */
  async allocatePriority(userId: string): Promise<number> {
    // Check if user already has a priority
    const existing = this.userPriorities.get(userId);
    if (existing !== undefined) {
      return existing;
    }

    // Generate initial priority from user ID
    let priority = generatePriorityFromUserId(userId);
    let attempts = 0;
    const maxAttempts = 100;

    // Handle collisions by incrementing
    while (this.assignedPriorities.has(priority) && attempts < maxAttempts) {
      priority = (priority % 49999) + 1; // Wrap around if needed
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error("Failed to allocate unique ALB priority - too many containers");
    }

    // Store assignment
    this.assignedPriorities.set(priority, userId);
    this.userPriorities.set(userId, priority);

    console.log(`Allocated ALB priority ${priority} for user ${userId}`);

    return priority;
  }

  /**
   * Release a priority when a container is deleted
   */
  async releasePriority(userId: string): Promise<void> {
    const priority = this.userPriorities.get(userId);
    if (priority !== undefined) {
      this.assignedPriorities.delete(priority);
      this.userPriorities.delete(userId);
      console.log(`Released ALB priority ${priority} for user ${userId}`);
    }
  }

  /**
   * Get priority for a user (without allocating if doesn't exist)
   */
  getPriority(userId: string): number | undefined {
    return this.userPriorities.get(userId);
  }

  /**
   * Check if a priority is available
   */
  isPriorityAvailable(priority: number): boolean {
    return !this.assignedPriorities.has(priority);
  }

  /**
   * Get all assigned priorities (for debugging)
   */
  getAssignedPriorities(): Map<number, string> {
    return new Map(this.assignedPriorities);
  }
}

// Singleton instance
const priorityManager = new PriorityManager();

export { priorityManager };

/**
 * Database-backed priority manager (PRODUCTION IMPLEMENTATION)
 * 
 * Uses PostgreSQL with atomic transactions and unique constraints
 * to prevent race conditions and ensure ALB priority uniqueness.
 */
export class DatabasePriorityManager {
  /**
   * Allocate a unique ALB priority for a user
   * Uses database transaction with retry logic for collision handling
   */
  async allocatePriority(userId: string): Promise<number> {
    const { db } = await import("@/db/client");
    const { albPriorities } = await import("@/db/schemas/alb-priorities");
    const { eq } = await import("drizzle-orm");

    // Check if user already has a priority
    const existing = await db.query.albPriorities.findFirst({
      where: eq(albPriorities.userId, userId),
    });

    if (existing) {
      console.log(`User ${userId} already has priority ${existing.priority}`);
      return existing.priority;
    }

    // Generate initial priority from user ID
    let priority = generatePriorityFromUserId(userId);
    let attempts = 0;
    const maxAttempts = 100;

    // Attempt to insert with collision handling
    while (attempts < maxAttempts) {
      try {
        const [inserted] = await db
          .insert(albPriorities)
          .values({
            userId,
            priority,
            createdAt: new Date(),
            expiresAt: null,
          })
          .returning();

        console.log(`✅ Allocated ALB priority ${priority} for user ${userId}`);
        return inserted.priority;
      } catch (error: unknown) {
        // Handle unique constraint violation (priority already taken)
        if (
          error instanceof Error &&
          ("code" in error) &&
          (error as { code: string }).code === "23505"
        ) {
          // Priority collision - try next priority
          priority = (priority % 49999) + 1;
          attempts++;
          console.log(
            `Priority collision, trying ${priority} (attempt ${attempts}/${maxAttempts})`
          );
        } else {
          // Unexpected error
          console.error("Failed to allocate ALB priority:", error);
          throw error;
        }
      }
    }

    throw new Error(
      `Failed to allocate unique ALB priority after ${maxAttempts} attempts - too many containers`
    );
  }

  /**
   * Release a priority when a container is deleted
   * Sets expiry for cleanup but keeps record for audit trail
   */
  async releasePriority(userId: string): Promise<void> {
    const { db } = await import("@/db/client");
    const { albPriorities } = await import("@/db/schemas/alb-priorities");
    const { eq } = await import("drizzle-orm");

    // Set expiry date (24 hours from now for audit trail)
    const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await db
      .update(albPriorities)
      .set({ expiresAt: expiryDate })
      .where(eq(albPriorities.userId, userId))
      .returning();

    if (result.length > 0) {
      console.log(
        `✅ Released ALB priority ${result[0].priority} for user ${userId} (expires: ${expiryDate.toISOString()})`
      );
    } else {
      console.warn(`⚠️  No ALB priority found for user ${userId}`);
    }
  }

  /**
   * Get priority for a user (without allocating if doesn't exist)
   */
  async getPriority(userId: string): Promise<number | undefined> {
    const { db } = await import("@/db/client");
    const { albPriorities } = await import("@/db/schemas/alb-priorities");
    const { eq } = await import("drizzle-orm");

    const result = await db.query.albPriorities.findFirst({
      where: eq(albPriorities.userId, userId),
    });

    return result?.priority;
  }

  /**
   * Cleanup expired priorities (run this periodically via cron)
   * Permanently deletes priorities that have been expired for >24h
   */
  async cleanupExpiredPriorities(): Promise<number> {
    const { db } = await import("@/db/client");
    const { albPriorities } = await import("@/db/schemas/alb-priorities");
    const { lt, and, isNotNull } = await import("drizzle-orm");

    const now = new Date();
    const deleted = await db
      .delete(albPriorities)
      .where(
        and(
          isNotNull(albPriorities.expiresAt),
          lt(albPriorities.expiresAt, now)
        )
      )
      .returning();

    if (deleted.length > 0) {
      console.log(`🧹 Cleaned up ${deleted.length} expired ALB priorities`);
    }

    return deleted.length;
  }

  /**
   * Get all assigned priorities (for debugging/monitoring)
   */
  async getAllPriorities(): Promise<
    Array<{ userId: string; priority: number }>
  > {
    const { db } = await import("@/db/client");
    const { albPriorities } = await import("@/db/schemas/alb-priorities");
    const { isNull } = await import("drizzle-orm");

    const results = await db.query.albPriorities.findMany({
      where: isNull(albPriorities.expiresAt),
      columns: {
        userId: true,
        priority: true,
      },
    });

    return results;
  }
}

export const dbPriorityManager = new DatabasePriorityManager();

