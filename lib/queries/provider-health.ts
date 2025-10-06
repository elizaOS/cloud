import { db, schema, eq, desc } from "@/lib/db";
import type { ProviderHealth, NewProviderHealth } from "@/lib/types";

export async function listProviderHealth(): Promise<ProviderHealth[]> {
  return await db.query.providerHealth.findMany({
    orderBy: desc(schema.providerHealth.last_checked),
  });
}

export async function getProviderHealthByName(
  provider: string,
): Promise<ProviderHealth | undefined> {
  return await db.query.providerHealth.findFirst({
    where: eq(schema.providerHealth.provider, provider),
  });
}

export async function createOrUpdateProviderHealth(
  data: NewProviderHealth,
): Promise<ProviderHealth> {
  const existing = await getProviderHealthByName(data.provider);

  if (existing) {
    const [updated] = await db
      .update(schema.providerHealth)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(schema.providerHealth.provider, data.provider))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(schema.providerHealth)
    .values(data)
    .returning();
  return created;
}

export async function updateProviderHealthStatus(
  provider: string,
  status: string,
  responseTime?: number,
  errorRate?: number,
): Promise<ProviderHealth | undefined> {
  const [updated] = await db
    .update(schema.providerHealth)
    .set({
      status,
      response_time: responseTime,
      error_rate: errorRate ? errorRate.toString() : undefined,
      last_checked: new Date(),
      updated_at: new Date(),
    })
    .where(eq(schema.providerHealth.provider, provider))
    .returning();
  return updated;
}
