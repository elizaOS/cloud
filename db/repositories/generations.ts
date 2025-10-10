import {
  eq,
  desc,
  and,
  sql,
  count,
  sum,
  type InferSelectModel,
  type InferInsertModel,
} from "drizzle-orm";
import { db } from "../client";
import { generations } from "../schemas/generations";

export type Generation = InferSelectModel<typeof generations>;
export type NewGeneration = InferInsertModel<typeof generations>;

export class GenerationsRepository {
  async findById(id: string): Promise<Generation | undefined> {
    return await db.query.generations.findFirst({
      where: eq(generations.id, id),
    });
  }

  async findByJobId(jobId: string): Promise<Generation | undefined> {
    return await db.query.generations.findFirst({
      where: eq(generations.job_id, jobId),
    });
  }

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

  async listByOrganizationAndStatus(
    organizationId: string,
    status: string,
  ): Promise<Generation[]> {
    return await db.query.generations.findMany({
      where: and(
        eq(generations.organization_id, organizationId),
        eq(generations.status, status),
      ),
      orderBy: desc(generations.created_at),
    });
  }

  async create(data: NewGeneration): Promise<Generation> {
    const [generation] = await db
      .insert(generations)
      .values(data)
      .returning();
    return generation;
  }

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

  async delete(id: string): Promise<void> {
    await db.delete(generations).where(eq(generations.id, id));
  }

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
        totalCredits: sql<number>`sum(${generations.credits})::int`,
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

// Export singleton instance
export const generationsRepository = new GenerationsRepository();
