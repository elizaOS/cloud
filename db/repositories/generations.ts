import { eq, desc, and, sql, count, sum } from "drizzle-orm";
import { db } from "../client";
import {
  generations,
  type Generation,
  type NewGeneration,
} from "../schemas/generations";

export type { Generation, NewGeneration };

/**
 * Repository for generation (image/video) database operations.
 */
export class GenerationsRepository {
  /**
   * Finds a generation by ID.
   */
  async findById(id: string): Promise<Generation | undefined> {
    return await db.query.generations.findFirst({
      where: eq(generations.id, id),
    });
  }

  /**
   * Finds a generation by job ID.
   */
  async findByJobId(jobId: string): Promise<Generation | undefined> {
    return await db.query.generations.findFirst({
      where: eq(generations.job_id, jobId),
    });
  }

  /**
   * Lists generations for an organization, ordered by creation date.
   */
  async listByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<Generation[]> {
    return await db.query.generations.findMany({
      where: eq(generations.organization_id, organizationId),
      orderBy: desc(generations.created_at),
      limit,
    });
  }

  /**
   * Lists generations for an organization filtered by type.
   */
  async listByOrganizationAndType(
    organizationId: string,
    type: string,
    limit?: number,
  ): Promise<Generation[]> {
    return await db.query.generations.findMany({
      where: and(
        eq(generations.organization_id, organizationId),
        eq(generations.type, type),
      ),
      orderBy: desc(generations.created_at),
      limit,
    });
  }

  /**
   * Lists generations for an organization filtered by status with optional filters.
   */
  async listByOrganizationAndStatus(
    organizationId: string,
    status: string,
    options?: {
      userId?: string;
      type?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<Generation[]> {
    const conditions = [
      eq(generations.organization_id, organizationId),
      eq(generations.status, status),
    ];

    if (options?.userId) {
      conditions.push(eq(generations.user_id, options.userId));
    }

    if (options?.type) {
      conditions.push(eq(generations.type, options.type));
    }

    return await db.query.generations.findMany({
      where: and(...conditions),
      orderBy: desc(generations.created_at),
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  /**
   * Creates a new generation record.
   */
  async create(data: NewGeneration): Promise<Generation> {
    const [generation] = await db.insert(generations).values(data).returning();
    return generation;
  }

  /**
   * Updates an existing generation.
   */
  async update(
    id: string,
    data: Partial<NewGeneration>,
  ): Promise<Generation | undefined> {
    const [updated] = await db
      .update(generations)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(generations.id, id))
      .returning();
    return updated;
  }

  /**
   * Deletes a generation by ID.
   */
  async delete(id: string): Promise<void> {
    await db.delete(generations).where(eq(generations.id, id));
  }

  /**
   * Gets gallery statistics for completed generations with storage URLs.
   * Uses efficient SQL aggregation instead of fetching all records.
   */
  async getGalleryStats(
    organizationId: string,
    userId?: string,
  ): Promise<{
    totalImages: number;
    totalVideos: number;
    totalSize: bigint;
  }> {
    const conditions = [
      eq(generations.organization_id, organizationId),
      eq(generations.status, "completed"),
      sql`${generations.storage_url} IS NOT NULL`,
    ];

    if (userId) {
      conditions.push(eq(generations.user_id, userId));
    }

    const [result] = await db
      .select({
        images: sql<number>`count(*) filter (where ${generations.type} = 'image')::int`,
        videos: sql<number>`count(*) filter (where ${generations.type} = 'video')::int`,
        totalSize: sql<bigint>`COALESCE(sum(${generations.file_size}), 0)::bigint`,
      })
      .from(generations)
      .where(and(...conditions));

    return {
      totalImages: result?.images ?? 0,
      totalVideos: result?.videos ?? 0,
      totalSize: result?.totalSize ?? BigInt(0),
    };
  }

  /**
   * Gets generation statistics for an organization within an optional date range.
   */
  async getStats(
    organizationId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalGenerations: number;
    completedGenerations: number;
    failedGenerations: number;
    pendingGenerations: number;
    totalCredits: number;
    byType: Array<{
      type: string;
      count: number;
      totalCredits: number;
    }>;
  }> {
    const conditions = [eq(generations.organization_id, organizationId)];

    if (startDate) {
      conditions.push(sql`${generations.created_at} >= ${startDate}`);
    }

    if (endDate) {
      conditions.push(sql`${generations.created_at} <= ${endDate}`);
    }

    const [totalResult] = await db
      .select({
        total: count(),
        completed: sql<number>`count(*) filter (where ${generations.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${generations.status} = 'failed')::int`,
        pending: sql<number>`count(*) filter (where ${generations.status} = 'pending')::int`,
        totalCredits: sum(generations.credits),
      })
      .from(generations)
      .where(and(...conditions));

    const byTypeResult = await db
      .select({
        type: generations.type,
        count: sql<number>`count(*)::int`,
        totalCredits: sql<number>`sum(${generations.credits})::numeric`,
      })
      .from(generations)
      .where(and(...conditions))
      .groupBy(generations.type);

    return {
      totalGenerations: Number(totalResult?.total || 0),
      completedGenerations: Number(totalResult?.completed || 0),
      failedGenerations: Number(totalResult?.failed || 0),
      pendingGenerations: Number(totalResult?.pending || 0),
      totalCredits: Number(totalResult?.totalCredits || 0),
      byType: byTypeResult.map((r) => ({
        type: r.type,
        count: Number(r.count),
        totalCredits: Number(r.totalCredits || 0),
      })),
    };
  }
}

/**
 * Singleton instance of GenerationsRepository.
 */
export const generationsRepository = new GenerationsRepository();
