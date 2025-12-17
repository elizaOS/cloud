import { db } from "../client";
import { jobs } from "../schemas/jobs";
import type { Job, NewJob } from "../schemas/jobs";
import { eq, and, sql, desc } from "drizzle-orm";

export type { Job, NewJob };

/**
 * Generic repository for background job database operations.
 * Handles CRUD operations for all types of background jobs.
 * 
 * Job types can include:
 * - knowledge_processing
 * - image_generation
 * - video_generation
 * - voice_cloning
 * - etc.
 */
export class JobsRepository {
  /**
   * Creates a new background job.
   *
   * @param jobData - Job data conforming to NewJob type.
   * @returns Created job record.
   */
  async create(jobData: NewJob): Promise<Job> {
    const [job] = await db.insert(jobs).values(jobData).returning();
    return job;
  }

  /**
   * Finds a job by ID.
   *
   * @param id - Job ID.
   * @returns Job record or undefined.
   */
  async findById(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return job;
  }

  /**
   * Gets jobs filtered by type, status, and organization.
   * Generic method that can be used by any service.
   *
   * @param filters - Filter criteria.
   * @returns List of matching jobs.
   */
  async findByFilters(filters: {
    type?: string;
    status?: string;
    organizationId?: string;
    limit?: number;
    orderBy?: "asc" | "desc";
  }): Promise<Job[]> {
    const conditions = [];

    if (filters.type) {
      conditions.push(eq(jobs.type, filters.type));
    }
    if (filters.status) {
      conditions.push(eq(jobs.status, filters.status));
    }
    if (filters.organizationId) {
      conditions.push(eq(jobs.organization_id, filters.organizationId));
    }

    // Build query in one chain to avoid TypeScript inference issues
    const query = db
      .select()
      .from(jobs)
      .$dynamic();

    return await (conditions.length > 0 ? query.where(and(...conditions)) : query)
      .limit(filters.limit || 1000)
      .orderBy(filters.orderBy === "desc" ? desc(jobs.created_at) : jobs.created_at);
  }

  /**
   * Gets jobs with a custom JSON data filter.
   * Useful for filtering by data fields like characterId.
   *
   * @param filters - Filter criteria including JSON path query.
   * @returns List of matching jobs.
   */
  async findByDataField(filters: {
    type: string;
    organizationId: string;
    dataField: "characterId";
    dataValue: string;
    orderBy?: "asc" | "desc";
  }): Promise<Job[]> {
    // Only allow whitelisted data fields to prevent SQL injection
    const allowedFields = ["characterId"] as const;
    if (!allowedFields.includes(filters.dataField)) {
      throw new Error(`Invalid data field: ${filters.dataField}`);
    }

    return await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.type, filters.type),
          eq(jobs.organization_id, filters.organizationId),
          sql`${jobs.data}->>'characterId' = ${filters.dataValue}`,
        ),
      )
      .orderBy(
        filters.orderBy === "desc" ? desc(jobs.created_at) : jobs.created_at,
      );
  }

  /**
   * Updates a job with partial data.
   * Generic update method for any job fields.
   *
   * @param id - Job ID to update.
   * @param updates - Partial job data to update.
   * @returns Updated job record.
   */
  async update(id: string, updates: Partial<Job>): Promise<Job> {
    const [updated] = await db
      .update(jobs)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }

  /**
   * Updates job status.
   *
   * @param id - Job ID to update.
   * @param status - New status.
   * @param additionalFields - Optional additional fields to update.
   */
  async updateStatus(
    id: string,
    status: string,
    additionalFields?: Partial<Job>,
  ): Promise<void> {
    const updates: Partial<Job> = {
      status,
      updated_at: new Date(),
      ...additionalFields,
    };

    if (status === "in_progress" && !additionalFields?.started_at) {
      updates.started_at = new Date();
    }
    if (status === "completed" && !additionalFields?.completed_at) {
      updates.completed_at = new Date();
    }

    await db.update(jobs).set(updates).where(eq(jobs.id, id));
  }

  /**
   * Increments job attempt count and updates status.
   * Marks as failed if max attempts reached.
   * Implements exponential backoff for retries.
   *
   * @param id - Job ID to update.
   * @param error - Error message.
   * @param maxAttempts - Maximum allowed attempts.
   * @returns Updated job record or undefined if not found.
   */
  async incrementAttempt(
    id: string,
    error: string,
    maxAttempts: number,
  ): Promise<Job | undefined> {
    const job = await this.findById(id);
    if (!job) return undefined;

    const newAttempts = (job.attempts || 0) + 1;
    const isFailed = newAttempts >= maxAttempts;

    // Exponential backoff: 30s, 2min, 8min for attempts 1, 2, 3
    const backoffMs = isFailed ? 0 : Math.pow(4, newAttempts) * 30 * 1000;
    const scheduledFor = new Date(Date.now() + backoffMs);

    const [updated] = await db
      .update(jobs)
      .set({
        status: isFailed ? "failed" : "pending",
        error,
        attempts: newAttempts,
        updated_at: new Date(),
        scheduled_for: isFailed ? job.scheduled_for : scheduledFor,
      })
      .where(eq(jobs.id, id))
      .returning();

    return updated;
  }

  /**
   * Deletes a job.
   *
   * @param id - Job ID to delete.
   */
  async delete(id: string): Promise<void> {
    await db.delete(jobs).where(eq(jobs.id, id));
  }
}

// Singleton instance
export const jobsRepository = new JobsRepository();
