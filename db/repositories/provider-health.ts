import { eq, desc } from "drizzle-orm";
import { db } from "../client";
import { providerHealth, type ProviderHealth, type NewProviderHealth } from "../schemas/provider-health";

export type { ProviderHealth, NewProviderHealth };

export class ProviderHealthRepository {
  async listAll(): Promise<ProviderHealth[]> {
    return await db.query.providerHealth.findMany({
      orderBy: desc(providerHealth.last_checked),
    });
  }

  async findByProvider(provider: string): Promise<ProviderHealth | undefined> {
    return await db.query.providerHealth.findFirst({
      where: eq(providerHealth.provider, provider),
    });
  }

  async createOrUpdate(data: NewProviderHealth): Promise<ProviderHealth> {
    const existing = await this.findByProvider(data.provider);

    if (existing) {
      const [updated] = await db
        .update(providerHealth)
        .set({
          ...data,
          updated_at: new Date(),
        })
        .where(eq(providerHealth.provider, data.provider))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(providerHealth)
      .values(data)
      .returning();
    return created;
  }

  async updateStatus(
    provider: string,
    status: string,
    responseTime?: number,
    errorRate?: number,
  ): Promise<ProviderHealth | undefined> {
    const [updated] = await db
      .update(providerHealth)
      .set({
        status,
        response_time: responseTime,
        error_rate: errorRate ? errorRate.toString() : undefined,
        last_checked: new Date(),
        updated_at: new Date(),
      })
      .where(eq(providerHealth.provider, provider))
      .returning();
    return updated;
  }
}

// Export singleton instance
export const providerHealthRepository = new ProviderHealthRepository();
