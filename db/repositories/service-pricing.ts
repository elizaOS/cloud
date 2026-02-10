import { eq, and, desc } from "drizzle-orm";
import { dbRead, dbWrite } from "../helpers";
import {
  servicePricing,
  servicePricingAudit,
  type ServicePricing,
  type NewServicePricing,
  type ServicePricingAudit,
  type NewServicePricingAudit,
} from "../schemas/service-pricing";

export type {
  ServicePricing,
  NewServicePricing,
  ServicePricingAudit,
  NewServicePricingAudit,
};

export class ServicePricingRepository {
  async findByServiceAndMethod(
    serviceId: string,
    method: string,
  ): Promise<ServicePricing | undefined> {
    return await dbRead.query.servicePricing.findFirst({
      where: and(
        eq(servicePricing.service_id, serviceId),
        eq(servicePricing.method, method),
        eq(servicePricing.is_active, true),
      ),
    });
  }

  async listByService(serviceId: string): Promise<ServicePricing[]> {
    return await dbRead.query.servicePricing.findMany({
      where: and(
        eq(servicePricing.service_id, serviceId),
        eq(servicePricing.is_active, true),
      ),
    });
  }

  async upsert(
    serviceId: string,
    method: string,
    cost: number,
    userId: string,
    reason?: string,
    description?: string,
    metadata?: Record<string, unknown>,
  ): Promise<ServicePricing> {
    return await dbWrite.transaction(async (tx) => {
      const existing = await tx.query.servicePricing.findFirst({
        where: and(
          eq(servicePricing.service_id, serviceId),
          eq(servicePricing.method, method),
        ),
      });

      let result: ServicePricing;
      let changeType: string;
      let oldCost: number | null = null;

      if (existing) {
        oldCost = Number(existing.cost);
        changeType = "update";

        const [updated] = await tx
          .update(servicePricing)
          .set({
            cost: cost.toString(),
            description: description ?? existing.description,
            metadata: metadata ?? existing.metadata,
            updated_by: userId,
            updated_at: new Date(),
          })
          .where(eq(servicePricing.id, existing.id))
          .returning();

        result = updated;
      } else {
        changeType = "create";

        const [created] = await tx
          .insert(servicePricing)
          .values({
            service_id: serviceId,
            method,
            cost: cost.toString(),
            description: description ?? null,
            metadata: metadata ?? {},
            updated_by: userId,
          })
          .returning();

        result = created;
      }

      await tx.insert(servicePricingAudit).values({
        service_pricing_id: result.id,
        service_id: serviceId,
        method,
        old_cost: oldCost !== null ? oldCost.toString() : null,
        new_cost: cost.toString(),
        change_type: changeType,
        changed_by: userId,
        reason: reason ?? null,
      });

      return result;
    });
  }

  async listAuditHistory(
    serviceId: string,
    limit: number = 50,
  ): Promise<ServicePricingAudit[]> {
    return await dbRead.query.servicePricingAudit.findMany({
      where: eq(servicePricingAudit.service_id, serviceId),
      orderBy: [desc(servicePricingAudit.created_at)],
      limit,
    });
  }
}

export const servicePricingRepository = new ServicePricingRepository();
