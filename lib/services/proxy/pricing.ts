/**
 * Service Pricing Cache Management
 * 
 * CRITICAL: Revenue-generating functionality - pricing must be accurate
 * 
 * Cache Strategy:
 * - Cache-aside pattern with TTL-based expiration
 * - Fallback to $1.00/request if pricing not found (prevents undercharging)
 * - Double invalidation on updates (pre + post DB write)
 * 
 * Consistency Model:
 * - Eventually consistent (bounded by TTL)
 * - Fail-fast on cache errors (makes failures visible)
 * - TTL safety net prevents indefinite staleness
 * 
 * Monitoring Points:
 * - Cache hit/miss ratio
 * - Cache invalidation failures (CRITICAL)
 * - Fallback pricing usage (indicates missing data)
 * - Cache operation latency
 */

import { cache } from "@/lib/cache/client";
import { servicePricingRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";
import { PROXY_CONFIG } from "./config";

const CACHE_TTL = PROXY_CONFIG.PRICING_CACHE_TTL;
const CACHE_STALE_TIME = PROXY_CONFIG.PRICING_CACHE_STALE_TIME;

// Hardcoded fallback to prevent service outage if DB pricing is misconfigured
// This is intentionally high to encourage fixing the DB pricing ASAP
const FALLBACK_COST = 1.0; // $1.00 per request

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
      logger.warn("[Pricing] Missing pricing in cache, using fallback", {
        serviceId,
        method,
        fallback: FALLBACK_COST,
      });
      return FALLBACK_COST;
    }
    return Number(cost);
  }

  const pricingRecords = await servicePricingRepository.listByService(
    serviceId,
  );

  if (pricingRecords.length === 0) {
    logger.error("[Pricing] No pricing records in DB, using fallback", {
      serviceId,
      method,
      fallback: FALLBACK_COST,
    });
    return FALLBACK_COST;
  }

  const pricingMap: Record<string, string> = {};
  for (const record of pricingRecords) {
    pricingMap[record.method] = record.cost;
  }

  await cache.set(cacheKey, pricingMap, CACHE_TTL);

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

/**
 * Invalidates pricing cache for a service
 * 
 * CRITICAL: This function must succeed to maintain cache consistency.
 * If this fails after a DB update, pricing data will be inconsistent
 * until TTL expires (default 5 minutes).
 * 
 * Fail-fast design: Errors propagate to caller for visibility.
 * 
 * @throws Error if cache deletion fails
 */
export async function invalidateServicePricingCache(
  serviceId: string,
): Promise<void> {
  const cacheKey = `service-pricing:${serviceId}`;
  
  try {
    await cache.del(cacheKey);
    logger.info("[Pricing] Cache invalidated successfully", { 
      serviceId,
      cacheKey 
    });
  } catch (error) {
    // CRITICAL: Cache invalidation failure creates inconsistency
    logger.error("[Pricing] CRITICAL: Cache invalidation failed", {
      serviceId,
      cacheKey,
      error: error instanceof Error ? error.message : "Unknown error",
      ttl: CACHE_TTL,
      impact: `Stale pricing may persist for up to ${CACHE_TTL}s`,
    });
    
    // Re-throw to make failure visible to caller (fail-fast)
    throw new Error(
      `Failed to invalidate pricing cache for ${serviceId}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
