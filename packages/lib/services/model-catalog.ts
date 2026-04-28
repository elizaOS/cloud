import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheStaleTTL, CacheTTL } from "@/lib/cache/keys";
import {
  type CatalogModel,
  GROQ_NATIVE_MODELS,
  mergeCatalogModels,
} from "@/lib/models";
import {
  getOpenRouterProvider,
  hasGroqProviderConfigured,
  hasOpenRouterProviderConfigured,
} from "@/lib/providers";
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

async function fetchOpenRouterModelCatalog(): Promise<CatalogModel[]> {
  if (!hasOpenRouterProviderConfigured()) {
    logger.info(
      "[Model Catalog] OpenRouter is not configured; skipping catalog fetch",
    );
    return [];
  }

  try {
    const response = await getOpenRouterProvider().listModels();
    const data = (await response.json()) as OpenAIModelsResponse;

    if (!Array.isArray(data.data)) {
      logger.warn(
        "[Model Catalog] OpenRouter returned an invalid model catalog",
      );
      return [];
    }

    return data.data;
  } catch (error) {
    logger.warn("[Model Catalog] Failed to fetch OpenRouter model catalog", {
      error,
    });
    return [];
  }
}

export async function getCachedOpenRouterModelCatalog(): Promise<
  CatalogModel[]
> {
  const cached = await cache.getWithSWR<CatalogModel[]>(
    CacheKeys.models.openrouterCatalog(),
    CacheStaleTTL.models.catalog,
    fetchOpenRouterModelCatalog,
    CacheTTL.models.catalog,
  );

  return cached ?? [];
}

export async function refreshOpenRouterModelCatalog(): Promise<CatalogModel[]> {
  const models = await fetchOpenRouterModelCatalog();

  await cache.set(
    CacheKeys.models.openrouterCatalog(),
    buildSWRValue(models),
    CacheTTL.models.catalog,
  );

  return models;
}

export async function getCachedMergedModelCatalog(): Promise<CatalogModel[]> {
  const openRouterModels = hasOpenRouterProviderConfigured()
    ? await getCachedOpenRouterModelCatalog()
    : [];
  let models = openRouterModels;

  if (hasGroqProviderConfigured()) {
    models = mergeCatalogModels(models, GROQ_NATIVE_MODELS);
  }

  return models;
}

export async function getCachedOpenRouterModelById(
  modelId: string,
): Promise<CatalogModel | null> {
  const openRouterModels = await getCachedOpenRouterModelCatalog();

  return openRouterModels.find((model) => model.id === modelId) ?? null;
}
