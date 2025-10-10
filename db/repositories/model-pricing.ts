import { eq, and } from "drizzle-orm";
import { db } from "../client";
import { modelPricing, type ModelPricing, type NewModelPricing } from "../schemas/model-pricing";

export type { ModelPricing, NewModelPricing };

export class ModelPricingRepository {
  async findByModelAndProvider(
    model: string,
    provider: string,
  ): Promise<ModelPricing | undefined> {
    return await db.query.modelPricing.findFirst({
      where: and(
        eq(modelPricing.model, model),
        eq(modelPricing.provider, provider),
        eq(modelPricing.is_active, true),
      ),
    });
  }

  async findById(id: string): Promise<ModelPricing | undefined> {
    return await db.query.modelPricing.findFirst({
      where: eq(modelPricing.id, id),
    });
  }

  async listActive(): Promise<ModelPricing[]> {
    return await db.query.modelPricing.findMany({
      where: eq(modelPricing.is_active, true),
    });
  }

  async create(data: NewModelPricing): Promise<ModelPricing> {
    const [pricing] = await db.insert(modelPricing).values(data).returning();
    return pricing;
  }

  async update(
    id: string,
    data: Partial<NewModelPricing>,
  ): Promise<ModelPricing | undefined> {
    const [updated] = await db
      .update(modelPricing)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(modelPricing.id, id))
      .returning();
    return updated;
  }
}

// Export singleton instance
export const modelPricingRepository = new ModelPricingRepository();
