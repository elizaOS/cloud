import crypto from "crypto";
import { db, schema, eq, and } from "@/lib/db";
import type { ApiKey, NewApiKey } from "@/lib/types";
import { API_KEY_PREFIX_LENGTH } from "@/lib/pricing";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";

export function generateApiKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  const randomBytes = crypto.randomBytes(32).toString("hex");
  const key = `eliza_${randomBytes}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const prefix = key.substring(0, API_KEY_PREFIX_LENGTH);

  return { key, hash, prefix };
}

export async function validateApiKey(key: string): Promise<ApiKey | null> {
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const cacheKey = CacheKeys.apiKey.validation(hash);

  const cached = await cache.get<ApiKey>(cacheKey);
  if (cached) {
    logger.debug(`[API Key] Cache hit for key validation`);
    if (cached.expires_at && new Date(cached.expires_at) < new Date()) {
      await cache.del(cacheKey);
      return null;
    }
    return cached;
  }

  const apiKey = await db.query.apiKeys.findFirst({
    where: and(
      eq(schema.apiKeys.key_hash, hash),
      eq(schema.apiKeys.is_active, true),
    ),
  });

  if (!apiKey) {
    return null;
  }

  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return null;
  }

  await cache.set(cacheKey, apiKey, CacheTTL.apiKey.validation);

  return apiKey;
}

export async function createApiKey(
  data: Omit<NewApiKey, "key" | "key_hash" | "key_prefix">,
): Promise<{
  apiKey: ApiKey;
  plainKey: string;
}> {
  const { key, hash, prefix } = generateApiKey();

  const [apiKey] = await db
    .insert(schema.apiKeys)
    .values({
      ...data,
      key,
      key_hash: hash,
      key_prefix: prefix,
    })
    .returning();

  return {
    apiKey,
    plainKey: key,
  };
}

export async function listApiKeys(organizationId: string): Promise<ApiKey[]> {
  return await db.query.apiKeys.findMany({
    where: eq(schema.apiKeys.organization_id, organizationId),
  });
}

export async function getApiKeyById(id: string): Promise<ApiKey | undefined> {
  return await db.query.apiKeys.findFirst({
    where: eq(schema.apiKeys.id, id),
  });
}

export async function updateApiKey(
  id: string,
  data: Partial<NewApiKey>,
): Promise<ApiKey | undefined> {
  const existing = await db.query.apiKeys.findFirst({
    where: eq(schema.apiKeys.id, id),
  });

  const [updated] = await db
    .update(schema.apiKeys)
    .set({
      ...data,
      updated_at: new Date(),
    })
    .where(eq(schema.apiKeys.id, id))
    .returning();

  if (existing) {
    const cacheKey = CacheKeys.apiKey.validation(existing.key_hash);
    await cache.del(cacheKey);
  }

  return updated;
}

export async function deleteApiKey(id: string): Promise<void> {
  const existing = await db.query.apiKeys.findFirst({
    where: eq(schema.apiKeys.id, id),
  });

  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id));

  if (existing) {
    const cacheKey = CacheKeys.apiKey.validation(existing.key_hash);
    await cache.del(cacheKey);
  }
}

export async function incrementApiKeyUsage(id: string): Promise<void> {
  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(schema.apiKeys.id, id),
  });

  if (apiKey) {
    await db
      .update(schema.apiKeys)
      .set({
        usage_count: apiKey.usage_count + 1,
        last_used_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.apiKeys.id, id));
  }
}
