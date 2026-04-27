import { afterEach, describe, expect, test } from "bun:test";
import type { ApiKey } from "@/db/repositories";
import { apiKeysRepository } from "@/db/repositories";
import { cache } from "@/lib/cache/client";
import { apiKeysService } from "@/lib/services/api-keys";

const VALID_API_KEY: ApiKey = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Milady",
  description: null,
  key: "eliza_test",
  key_hash: "hash",
  key_prefix: "eliza_te",
  organization_id: "22222222-2222-4222-8222-222222222222",
  user_id: "33333333-3333-4333-8333-333333333333",
  permissions: [],
  rate_limit: 1000,
  is_active: true,
  usage_count: 0,
  expires_at: null,
  last_used_at: null,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
};

const originalCacheGet = cache.get.bind(cache);
const originalCacheDel = cache.del.bind(cache);
const originalFindActiveByHash = apiKeysRepository.findActiveByHash.bind(apiKeysRepository);

describe("ApiKeysService cache validation", () => {
  afterEach(() => {
    cache.get = originalCacheGet;
    cache.del = originalCacheDel;
    apiKeysRepository.findActiveByHash = originalFindActiveByHash;
  });

  test("ignores stale cached API key records with legacy user ids", async () => {
    let deletedKey: string | null = null;
    let queriedHash: string | null = null;
    cache.get = async () => ({
      ...VALID_API_KEY,
      user_id: "1",
    });
    cache.del = async (key: string) => {
      deletedKey = key;
    };
    apiKeysRepository.findActiveByHash = async (hash: string) => {
      queriedHash = hash;
      return VALID_API_KEY;
    };

    const result = await apiKeysService.validateApiKey("eliza_test");

    expect(result).toBe(VALID_API_KEY);
    expect(deletedKey).toStartWith("apikey:validation:");
    expect(typeof queriedHash).toBe("string");
  });
});
