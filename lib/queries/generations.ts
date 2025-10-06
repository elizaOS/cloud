import { db, schema, eq, and, desc, sql } from "@/lib/db";
import type { Generation, NewGeneration } from "@/lib/types";

export async function createGeneration(
  data: NewGeneration,
): Promise<Generation> {
  const [generation] = await db
    .insert(schema.generations)
    .values(data)
    .returning();
  return generation;
}

export async function updateGeneration(
  id: string,
  data: Partial<Omit<Generation, "id" | "created_at">>,
): Promise<Generation | undefined> {
  const [generation] = await db
    .update(schema.generations)
    .set({ ...data, updated_at: new Date() })
    .where(eq(schema.generations.id, id))
    .returning();
  return generation;
}

export async function getGenerationById(
  id: string,
): Promise<Generation | undefined> {
  return await db.query.generations.findFirst({
    where: eq(schema.generations.id, id),
  });
}

export async function listGenerationsByOrganization(
  organizationId: string,
  options?: {
    limit?: number;
    offset?: number;
    type?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  },
): Promise<Generation[]> {
  const {
    limit = 100,
    offset = 0,
    type,
    status,
    startDate,
    endDate,
  } = options || {};

  const conditions = [eq(schema.generations.organization_id, organizationId)];

  if (type) {
    conditions.push(eq(schema.generations.type, type));
  }

  if (status) {
    conditions.push(eq(schema.generations.status, status));
  }

  if (startDate) {
    conditions.push(sql`${schema.generations.created_at} >= ${startDate}`);
  }

  if (endDate) {
    conditions.push(sql`${schema.generations.created_at} <= ${endDate}`);
  }

  return await db.query.generations.findMany({
    where: and(...conditions),
    orderBy: desc(schema.generations.created_at),
    limit,
    offset,
  });
}

export async function listGenerationsByUser(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    type?: string;
    status?: string;
  },
): Promise<Generation[]> {
  const { limit = 100, offset = 0, type, status } = options || {};

  const conditions = [eq(schema.generations.user_id, userId)];

  if (type) {
    conditions.push(eq(schema.generations.type, type));
  }

  if (status) {
    conditions.push(eq(schema.generations.status, status));
  }

  return await db.query.generations.findMany({
    where: and(...conditions),
    orderBy: desc(schema.generations.created_at),
    limit,
    offset,
  });
}

export async function listGenerationsByApiKey(
  apiKeyId: string,
  options?: {
    limit?: number;
    offset?: number;
    type?: string;
    status?: string;
  },
): Promise<Generation[]> {
  const { limit = 100, offset = 0, type, status } = options || {};

  const conditions = [eq(schema.generations.api_key_id, apiKeyId)];

  if (type) {
    conditions.push(eq(schema.generations.type, type));
  }

  if (status) {
    conditions.push(eq(schema.generations.status, status));
  }

  return await db.query.generations.findMany({
    where: and(...conditions),
    orderBy: desc(schema.generations.created_at),
    limit,
    offset,
  });
}

export async function getGenerationStats(
  organizationId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
  },
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
  const { startDate, endDate } = options || {};

  const conditions = [eq(schema.generations.organization_id, organizationId)];

  if (startDate) {
    conditions.push(sql`${schema.generations.created_at} >= ${startDate}`);
  }

  if (endDate) {
    conditions.push(sql`${schema.generations.created_at} <= ${endDate}`);
  }

  const totalResult = await db
    .select({
      totalGenerations: sql<number>`count(*)::int`,
      completedGenerations: sql<number>`count(*) filter (where ${schema.generations.status} = 'completed')::int`,
      failedGenerations: sql<number>`count(*) filter (where ${schema.generations.status} = 'failed')::int`,
      pendingGenerations: sql<number>`count(*) filter (where ${schema.generations.status} = 'pending')::int`,
      totalCredits: sql<number>`coalesce(sum(${schema.generations.credits}), 0)::int`,
    })
    .from(schema.generations)
    .where(and(...conditions));

  const byTypeResult = await db
    .select({
      type: schema.generations.type,
      count: sql<number>`count(*)::int`,
      totalCredits: sql<number>`coalesce(sum(${schema.generations.credits}), 0)::int`,
    })
    .from(schema.generations)
    .where(and(...conditions))
    .groupBy(schema.generations.type);

  return {
    totalGenerations: totalResult[0]?.totalGenerations || 0,
    completedGenerations: totalResult[0]?.completedGenerations || 0,
    failedGenerations: totalResult[0]?.failedGenerations || 0,
    pendingGenerations: totalResult[0]?.pendingGenerations || 0,
    totalCredits: totalResult[0]?.totalCredits || 0,
    byType: byTypeResult,
  };
}
