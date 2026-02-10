import { cache } from "@/lib/cache/client";
import { servicePricingRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";

const CACHE_TTL = 300;
const CACHE_STALE_TIME = 150;

export class PricingNotFoundError extends Error {
  constructor(
    public readonly serviceId: string,
    public readonly method: string,
  ) {
    super(`Pricing not found for service ${serviceId}, method ${method}`);
    this.name = "PricingNotFoundError";
  }
}

export async function getServiceMethodCost(
  serviceId: string,
  method: string,
): Promise<number> {
  const cacheKey = `service-pricing:${serviceId}`;

  const cached = await cache.get<Record<string, string>>(cacheKey);
  if (cached) {
    const cost = cached[method] ?? cached["_default"];
    if (!cost) {
      throw new PricingNotFoundError(serviceId, method);
    }
    return Number(cost);
  }

  const pricingRecords = await servicePricingRepository.listByService(
    serviceId,
  );

  if (pricingRecords.length === 0) {
    throw new PricingNotFoundError(serviceId, method);
  }

  const pricingMap: Record<string, string> = {};
  for (const record of pricingRecords) {
    pricingMap[record.method] = record.cost;
  }

  await cache.set(cacheKey, pricingMap, { ex: CACHE_TTL });

  const cost = pricingMap[method] ?? pricingMap["_default"];
  if (!cost) {
    throw new PricingNotFoundError(serviceId, method);
  }

  return Number(cost);
}

export async function invalidateServicePricingCache(
  serviceId: string,
): Promise<void> {
  const cacheKey = `service-pricing:${serviceId}`;
  await cache.del(cacheKey);
  logger.info(`Invalidated pricing cache for service: ${serviceId}`);
}
