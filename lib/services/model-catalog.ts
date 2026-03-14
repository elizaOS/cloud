import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheStaleTTL, CacheTTL } from "@/lib/cache/keys";
import { type CatalogModel, GROQ_NATIVE_MODELS, mergeCatalogModels } from "@/lib/models";
import { getProvider, hasGroqProviderConfigured } from "@/lib/providers";
import type { OpenAIModelsResponse } from "@/lib/providers/types";
import { logger } from "@/lib/utils/logger";

interface SWRCachedValue<T> {
  data: T;
  cachedAt: number;
  staleAt: number;
}

function buildSWRValue<T>(data: T): SWRCachedValue<T> {
  const cachedAt = Date.now();

  return {
    data,
    cachedAt,
    staleAt: cachedAt + CacheStaleTTL.models.catalog * 1000,
  };
}

async function fetchGatewayModelCatalog(): Promise<CatalogModel[]> {
  const response = await getProvider().listModels();
  const data = (await response.json()) as OpenAIModelsResponse;

  if (!Array.isArray(data.data)) {
    logger.warn("[Model Catalog] Gateway returned an invalid model catalog");
    return [];
  }

  return data.data;
}

export async function getCachedGatewayModelCatalog(): Promise<CatalogModel[]> {
  const cached = await cache.getWithSWR<CatalogModel[]>(
    CacheKeys.models.gatewayCatalog(),
    CacheStaleTTL.models.catalog,
    fetchGatewayModelCatalog,
    CacheTTL.models.catalog,
  );

  return cached ?? [];
}

export async function refreshGatewayModelCatalog(): Promise<CatalogModel[]> {
  const models = await fetchGatewayModelCatalog();

  await cache.set(
    CacheKeys.models.gatewayCatalog(),
    buildSWRValue(models),
    CacheTTL.models.catalog,
  );

  return models;
}

export async function getCachedMergedModelCatalog(): Promise<CatalogModel[]> {
  const gatewayModels = await getCachedGatewayModelCatalog();

  if (!hasGroqProviderConfigured()) {
    return gatewayModels;
  }

  return mergeCatalogModels(gatewayModels, GROQ_NATIVE_MODELS);
}

export async function getCachedGatewayModelById(modelId: string): Promise<CatalogModel | null> {
  const gatewayModels = await getCachedGatewayModelCatalog();

  return gatewayModels.find((model) => model.id === modelId) ?? null;
}
