import { eq, and, desc, sql, getTableColumns } from "drizzle-orm";
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

  /**
   * Lists all pricing records for a service
   * 
   * @param serviceId - Service identifier (e.g., "solana-rpc")
   * @param activeOnly - If true, only return active methods (default: true)
   * @returns Array of service pricing records
   */
  async listByService(
    serviceId: string,
    activeOnly: boolean = true
  ): Promise<ServicePricing[]> {
    const conditions = [eq(servicePricing.service_id, serviceId)];
    
    if (activeOnly) {
      conditions.push(eq(servicePricing.is_active, true));
    }

    return await dbRead.query.servicePricing.findMany({
      where: and(...conditions),
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
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ServicePricing> {
    return await dbWrite.transaction(async (tx) => {
      const costStr = cost.toString();

      // Atomic upsert with conflict detection via xmax and old cost via subquery.
      // xmax=0 means INSERT (new row), xmax!=0 means UPDATE (conflict resolved).
      // The subquery fetches the previous cost from the audit trail in the same statement.
      const [row] = await tx
        .insert(servicePricing)
        .values({
          service_id: serviceId,
          method,
          cost: costStr,
          description: description ?? null,
          metadata: metadata ?? {},
          updated_by: userId,
        })
        .onConflictDoUpdate({
          target: [servicePricing.service_id, servicePricing.method],
          set: {
            cost: costStr,
            description: sql`coalesce(${sql.param(description ?? null)}, ${servicePricing.description})`,
            metadata: sql`coalesce(${sql.param(metadata ?? null)}::jsonb, ${servicePricing.metadata})`,
            updated_by: userId,
            updated_at: new Date(),
          },
        })
        .returning({
          ...getTableColumns(servicePricing),
          wasUpdate: sql<boolean>`xmax::text::int > 0`,
          previousCost: sql<string | null>`(
            SELECT new_cost FROM service_pricing_audit
            WHERE service_pricing_id = ${servicePricing.id}
            ORDER BY created_at DESC LIMIT 1
          )`,
        });

      const { wasUpdate, previousCost, ...result } = row;

      await tx.insert(servicePricingAudit).values({
        service_pricing_id: result.id,
        service_id: serviceId,
        method,
        old_cost: wasUpdate ? previousCost : null,
        new_cost: costStr,
        change_type: wasUpdate ? "update" : "create",
        changed_by: userId,
        reason: reason ?? null,
        ip_address: ipAddress ?? null,
        user_agent: userAgent ?? null,
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
