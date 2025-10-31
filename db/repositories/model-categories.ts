import { eq, and } from "drizzle-orm";
import { db } from "../client";
import {
  modelCategories,
  type ModelCategory,
  type NewModelCategory,
} from "../schemas/model-categories";

export type { ModelCategory, NewModelCategory };

export class ModelCategoriesRepository {
  async findByModel(
    model: string,
    provider?: string
  ): Promise<ModelCategory | undefined> {
    if (provider) {
      return await db.query.modelCategories.findFirst({
        where: and(
          eq(modelCategories.model, model),
          eq(modelCategories.provider, provider),
          eq(modelCategories.is_active, true)
        ),
      });
    }

    return await db.query.modelCategories.findFirst({
      where: and(
        eq(modelCategories.model, model),
        eq(modelCategories.is_active, true)
      ),
    });
  }

  async findById(id: string): Promise<ModelCategory | undefined> {
    return await db.query.modelCategories.findFirst({
      where: eq(modelCategories.id, id),
    });
  }

  async listByCategory(category: string): Promise<ModelCategory[]> {
    return await db.query.modelCategories.findMany({
      where: and(
        eq(modelCategories.category, category),
        eq(modelCategories.is_active, true)
      ),
    });
  }

  async listByProvider(provider: string): Promise<ModelCategory[]> {
    return await db.query.modelCategories.findMany({
      where: and(
        eq(modelCategories.provider, provider),
        eq(modelCategories.is_active, true)
      ),
    });
  }

  async listActive(): Promise<ModelCategory[]> {
    return await db.query.modelCategories.findMany({
      where: eq(modelCategories.is_active, true),
    });
  }

  async listFreeModels(): Promise<ModelCategory[]> {
    return await db.query.modelCategories.findMany({
      where: and(
        eq(modelCategories.category, "free"),
        eq(modelCategories.is_active, true)
      ),
    });
  }

  async create(data: NewModelCategory): Promise<ModelCategory> {
    const [category] = await db
      .insert(modelCategories)
      .values(data)
      .returning();
    return category;
  }

  async update(
    id: string,
    data: Partial<NewModelCategory>
  ): Promise<ModelCategory | undefined> {
    const [updated] = await db
      .update(modelCategories)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(modelCategories.id, id))
      .returning();
    return updated;
  }

  async delete(id: string): Promise<void> {
    await db.delete(modelCategories).where(eq(modelCategories.id, id));
  }
}

export const modelCategoriesRepository = new ModelCategoriesRepository();
