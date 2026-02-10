import { eq, and, desc, sql } from "drizzle-orm";
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
      // Atomic upsert using onConflictDoUpdate
      const [result] = await tx
        .insert(servicePricing)
        .values({
          service_id: serviceId,
          method,
          cost: cost.toString(),
          description: description ?? null,
          metadata: metadata ?? {},
          updated_by: userId,
        })
        .onConflictDoUpdate({
          target: [servicePricing.service_id, servicePricing.method],
          set: {
            cost: cost.toString(),
            description: sql`coalesce(${sql.param(description)}, ${servicePricing.description})`,
            metadata: sql`coalesce(${sql.param(metadata)}, ${servicePricing.metadata})`,
            updated_by: userId,
            updated_at: new Date(),
          },
        })
        .returning();

      // Determine if this was a create or update by checking the previous audit entry
      const previousAudit = await tx.query.servicePricingAudit.findFirst({
        where: eq(servicePricingAudit.service_pricing_id, result.id),
        orderBy: [desc(servicePricingAudit.created_at)],
      });

      const changeType = previousAudit ? "update" : "create";
      const oldCost = previousAudit ? previousAudit.new_cost : null;

      await tx.insert(servicePricingAudit).values({
        service_pricing_id: result.id,
        service_id: serviceId,
        method,
        old_cost: oldCost,
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
    offset: number = 0,
  ): Promise<ServicePricingAudit[]> {
    return await dbRead.query.servicePricingAudit.findMany({
      where: eq(servicePricingAudit.service_id, serviceId),
      orderBy: [desc(servicePricingAudit.created_at)],
      limit,
      offset,
    });
  }
}

export const servicePricingRepository = new ServicePricingRepository();
