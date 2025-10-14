import { eq, and, sql } from "drizzle-orm";
import { db } from "../client";
import { apiKeys, type ApiKey, type NewApiKey } from "../schemas/api-keys";

export type { ApiKey, NewApiKey };

export class ApiKeysRepository {
  async findById(id: string): Promise<ApiKey | undefined> {
    return await db.query.apiKeys.findFirst({
      where: eq(apiKeys.id, id),
    });
  }

  async findByHash(hash: string): Promise<ApiKey | undefined> {
    return await db.query.apiKeys.findFirst({
      where: eq(apiKeys.key_hash, hash),
    });
  }

  async findActiveByHash(hash: string): Promise<ApiKey | undefined> {
    const apiKey = await db.query.apiKeys.findFirst({
      where: and(eq(apiKeys.key_hash, hash), eq(apiKeys.is_active, true)),
    });

    if (!apiKey) {
      return undefined;
    }

    // Check expiration
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      return undefined;
    }

    return apiKey;
  }

  async listByOrganization(organizationId: string): Promise<ApiKey[]> {
    return await db.query.apiKeys.findMany({
      where: eq(apiKeys.organization_id, organizationId),
    });
  }

  async create(data: NewApiKey): Promise<ApiKey> {
    const [apiKey] = await db.insert(apiKeys).values(data).returning();
    return apiKey;
  }

  async update(
    id: string,
    data: Partial<NewApiKey>,
  ): Promise<ApiKey | undefined> {
    const [updated] = await db
      .update(apiKeys)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(apiKeys.id, id))
      .returning();
    return updated;
  }

  async incrementUsage(id: string): Promise<void> {
    // FIXED: Use SQL atomic increment to prevent race condition
    // Multiple concurrent requests won't lose counts
    await db
      .update(apiKeys)
      .set({
        usage_count: sql`${apiKeys.usage_count} + 1`,
        last_used_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(apiKeys.id, id));
  }

  async delete(id: string): Promise<void> {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  }
}

// Export singleton instance
export const apiKeysRepository = new ApiKeysRepository();
