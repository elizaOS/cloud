import { eq, and, lte, gte, sql } from "drizzle-orm";
import { db } from "../client";
import {
  usageQuotas,
  type UsageQuota,
  type NewUsageQuota,
} from "../schemas/usage-quotas";

export type { UsageQuota, NewUsageQuota };

export class UsageQuotasRepository {
  async findById(id: string): Promise<UsageQuota | undefined> {
    return await db.query.usageQuotas.findFirst({
      where: eq(usageQuotas.id, id),
    });
  }

  async findByOrganization(organizationId: string): Promise<UsageQuota[]> {
    return await db.query.usageQuotas.findMany({
      where: eq(usageQuotas.organization_id, organizationId),
    });
  }

  async findActiveByOrganization(
    organizationId: string,
  ): Promise<UsageQuota[]> {
    return await db.query.usageQuotas.findMany({
      where: and(
        eq(usageQuotas.organization_id, organizationId),
        eq(usageQuotas.is_active, true)
      ),
    });
  }

  async findByOrganizationAndType(
    organizationId: string,
    quotaType: string,
    modelName?: string | null,
  ): Promise<UsageQuota | undefined> {
    const conditions = [
      eq(usageQuotas.organization_id, organizationId),
      eq(usageQuotas.quota_type, quotaType),
      eq(usageQuotas.is_active, true),
    ];

    if (modelName) {
      conditions.push(eq(usageQuotas.model_name, modelName));
    } else {
      conditions.push(sql`${usageQuotas.model_name} IS NULL`);
    }

    return await db.query.usageQuotas.findFirst({
      where: and(...conditions),
    });
  }

  async create(data: NewUsageQuota): Promise<UsageQuota> {
    const [quota] = await db.insert(usageQuotas).values(data).returning();
    return quota;
  }

  async update(
    id: string,
    data: Partial<NewUsageQuota>,
  ): Promise<UsageQuota | undefined> {
    const [updated] = await db
      .update(usageQuotas)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(usageQuotas.id, id))
      .returning();
    return updated;
  }

  async resetUsage(id: string): Promise<UsageQuota | undefined> {
    const [updated] = await db
      .update(usageQuotas)
      .set({
        current_usage: "0.00",
        updated_at: new Date(),
      })
      .where(eq(usageQuotas.id, id))
      .returning();
    return updated;
  }

  async incrementUsage(
    id: string,
    amount: number,
  ): Promise<UsageQuota | undefined> {
    const [updated] = await db
      .update(usageQuotas)
      .set({
        current_usage: sql`${usageQuotas.current_usage} + ${amount}`,
        updated_at: new Date(),
      })
      .where(eq(usageQuotas.id, id))
      .returning();
    return updated;
  }

  async checkQuotaExceeded(id: string): Promise<boolean> {
    const quota = await this.findById(id);
    if (!quota) {
      return false;
    }

    const currentUsage = Number(quota.current_usage);
    const creditsLimit = Number(quota.credits_limit);

    return currentUsage >= creditsLimit;
  }

  async listExpiredQuotas(): Promise<UsageQuota[]> {
    const now = new Date();
    return await db.query.usageQuotas.findMany({
      where: and(
        eq(usageQuotas.is_active, true),
        lte(usageQuotas.period_end, now)
      ),
    });
  }

  async updatePeriod(
    id: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UsageQuota | undefined> {
    const [updated] = await db
      .update(usageQuotas)
      .set({
        period_start: periodStart,
        period_end: periodEnd,
        current_usage: "0.00",
        updated_at: new Date(),
      })
      .where(eq(usageQuotas.id, id))
      .returning();
    return updated;
  }

  async delete(id: string): Promise<void> {
    await db.delete(usageQuotas).where(eq(usageQuotas.id, id));
  }

  async getCurrentUsage(organizationId: string): Promise<{
    global: { used: number; limit: number | null };
    modelSpecific: Record<string, { used: number; limit: number }>;
  }> {
    const quotas = await this.findActiveByOrganization(organizationId);

    const result = {
      global: { used: 0, limit: null as number | null },
      modelSpecific: {} as Record<string, { used: number; limit: number }>,
    };

    for (const quota of quotas) {
      if (quota.quota_type === "global") {
        result.global.used = Number(quota.current_usage);
        result.global.limit = Number(quota.credits_limit);
      } else if (quota.quota_type === "model_specific" && quota.model_name) {
        result.modelSpecific[quota.model_name] = {
          used: Number(quota.current_usage),
          limit: Number(quota.credits_limit),
        };
      }
    }

    return result;
  }
}

export const usageQuotasRepository = new UsageQuotasRepository();
