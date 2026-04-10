import { servicePricingRepository } from "@/db/repositories/service-pricing";
import { cache } from "@/lib/cache/client";
import { logger } from "@/lib/utils/logger";
import { PROXY_CONFIG } from "./config";

const CACHE_TTL = PROXY_CONFIG.PRICING_CACHE_TTL;

// Hardcoded fallback to prevent service outage if DB pricing is misconfigured.
const FALLBACK_COST = 1.0;
const inflightPricingLoads = new Map<string, Promise<Record<string, string>>>();

export class PricingNotFoundError extends Error {
  constructor(
    public readonly serviceId: string,
    public readonly method: string,
  ) {
    super(`Pricing not found for service ${serviceId}, method ${method}`);
    this.name = "PricingNotFoundError";
  }
}

async function loadPricingMap(serviceId: string): Promise<Record<string, string>> {
  const existingLoad = inflightPricingLoads.get(serviceId);
  if (existingLoad) {
    return existingLoad;
  }

  const cacheKey = `service-pricing:${serviceId}`;
  const loadPromise = (async () => {
    const pricingRecords = await servicePricingRepository.listByService(serviceId);
    const pricingMap: Record<string, string> = {};

    if (pricingRecords.length === 0) {
      logger.error("[Pricing] No pricing records in DB, using fallback", {
        serviceId,
        fallback: FALLBACK_COST,
      });
      await cache.set(cacheKey, pricingMap, CACHE_TTL);
      return pricingMap;
    }

    for (const record of pricingRecords) {
      pricingMap[record.method] = String(record.cost);
    }

    await cache.set(cacheKey, pricingMap, CACHE_TTL);
    return pricingMap;
  })().finally(() => {
    inflightPricingLoads.delete(serviceId);
  });

  inflightPricingLoads.set(serviceId, loadPromise);
  return loadPromise;
}

export async function getServiceMethodCost(serviceId: string, method: string): Promise<number> {
  const cacheKey = `service-pricing:${serviceId}`;

  const cached = await cache.get<Record<string, string>>(cacheKey);
  if (cached) {
    const cost = cached[method] ?? cached["_default"];
    if (!cost) {
      logger.warn("[Pricing] Missing pricing in cache, using fallback", {
        serviceId,
        method,
        fallback: FALLBACK_COST,
      });
      return FALLBACK_COST;
    }

    return Number(cost);
  }

  const pricingMap = await loadPricingMap(serviceId);
  const cost = pricingMap[method] ?? pricingMap["_default"];

  if (!cost) {
    logger.warn("[Pricing] Method not found, using fallback", {
      serviceId,
      method,
      fallback: FALLBACK_COST,
    });
    return FALLBACK_COST;
  }

  return Number(cost);
}

export async function invalidateServicePricingCache(serviceId: string): Promise<void> {
  const cacheKey = `service-pricing:${serviceId}`;
  inflightPricingLoads.delete(serviceId);
  await cache.del(cacheKey);
  logger.info(`Invalidated pricing cache for service: ${serviceId}`);
}

export async function calculateBatchCost(
  serviceId: string,
  allowedMethods: Set<string>,
  body: unknown[],
  maxBatchSize: number,
): Promise<number> {
  if (body.length === 0) {
    throw new Error("Invalid JSON-RPC batch: empty array");
  }

  if (body.length > maxBatchSize) {
    throw new Error(`Invalid JSON-RPC batch: maximum ${maxBatchSize} requests`);
  }

  const methods: string[] = [];
  for (const item of body) {
    if (!item || typeof item !== "object" || !("method" in item)) {
      throw new Error("Invalid JSON-RPC batch: malformed request");
    }

    const method = String(item.method);
    if (!allowedMethods.has(method)) {
      throw new Error(`Batch contains unsupported method '${method}'`);
    }

    methods.push(method);
  }

  const uniqueMethods = [...new Set(methods)];
  const costMap = new Map<string, number>();

  await Promise.all(
    uniqueMethods.map(async (method) => {
      const cost = await getServiceMethodCost(serviceId, method);
      costMap.set(method, cost);
    }),
  );

  return methods.reduce((total, method) => total + (costMap.get(method) ?? 0), 0);
}
