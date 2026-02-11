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
 * KNOWN RACE CONDITION:
 * Pricing updates can race with cache population, resulting in stale
 * pricing being cached. See detailed analysis in:
 * - app/api/v1/admin/service-pricing/route.ts (implementation comments)
 * - docs/api-security.md (risk assessment and mitigations)
 * 
 * Summary:
 * - Impact: Stale pricing cached for up to 5 minutes
 * - Probability: Low (requires specific timing + replica lag)
 * - Mitigation: Short TTL, high fallback pricing, double invalidation
 * - Accepted risk: Trade-off between consistency and operational complexity
 * 
 * Monitoring Points:
 * - Cache hit/miss ratio
 * - Cache invalidation failures (CRITICAL)
 * - Fallback pricing usage (indicates missing data)
 * - Cache operation latency
 * - Replica lag (impacts race probability)
 */

import { cache } from "@/lib/cache/client";
import { servicePricingRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";
import { PROXY_CONFIG } from "./config";

const CACHE_TTL = PROXY_CONFIG.PRICING_CACHE_TTL;

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

/**
 * Gets pricing for a service method with cache-aside pattern
 * 
 * RACE CONDITION AWARENESS:
 * This function has a known race condition with pricing updates.
 * 
 * Scenario: Admin updates pricing while this function executes
 * 1. Admin pre-invalidates cache
 * 2. Admin updates DB
 * 3. This function: cache miss, reads from DB
 * 4. Admin post-invalidates cache
 * 5. This function: writes to cache (might be stale if replica lag)
 * 
 * Impact: Cached pricing might be stale for up to CACHE_TTL (5min)
 * 
 * Mitigations:
 * - Short CACHE_TTL (5 minutes) limits exposure
 * - High FALLBACK_COST ($1.00) prevents undercharging
 * - Double invalidation reduces window (but doesn't eliminate it)
 * - Database transactions ensure consistency
 * 
 * Alternative solutions considered:
 * - Distributed locks: Adds latency and complexity
 * - Versioned cache keys: More complex key management
 * - Read-repair on write: Doesn't solve initial read problem
 * 
 * @param serviceId - Service identifier
 * @param method - Method name
 * @returns Cost in USD
 */
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

  // Cache miss - fetch from database
  // NOTE: This read might race with admin pricing updates
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

  // Write to cache - race condition possible here
  // Admin might invalidate between our read and this write
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
