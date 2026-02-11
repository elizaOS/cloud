/**
 * Admin Service Pricing Management API
 * 
 * CRITICAL: Revenue-generating endpoint - pricing changes affect billing
 * 
 * Cache Consistency Strategy:
 * - Double invalidation (pre + post DB update) prevents race conditions
 * - TTL-based safety net (5min) limits stale data exposure
 * - Fail-fast behavior makes cache failures visible
 * - Critical logging for post-update cache failures
 * 
 * Monitoring Recommendations:
 * - Alert on CRITICAL log level for cache invalidation failures
 * - Track pricing cache hit/miss ratios
 * - Monitor cache invalidation error rates
 * - Set up dead letter queue for failed invalidations
 * 
 * @see lib/services/proxy/pricing.ts for cache implementation
 * @see docs/api-security.md for security architecture
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { servicePricingRepository } from "@/db/repositories";
import { invalidateServicePricingCache } from "@/lib/services/proxy/pricing";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const { user } = await requireAdmin(request);

  const url = new URL(request.url);
  const serviceId = url.searchParams.get("service_id");

  if (!serviceId) {
    return NextResponse.json(
      { error: "service_id query parameter required" },
      { status: 400 },
    );
  }

  const pricing = await servicePricingRepository.listByService(serviceId);

  return NextResponse.json({
    service_id: serviceId,
    pricing: pricing.map((p) => ({
      id: p.id,
      method: p.method,
      cost: Number(p.cost),
      description: p.description,
      metadata: p.metadata,
      is_active: p.is_active,
      updated_by: p.updated_by,
      updated_at: p.updated_at,
    })),
  });
}

const UpsertSchema = z.object({
  service_id: z.string(),
  method: z.string(),
  cost: z.number().positive(),
  reason: z.string(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function PUT(request: NextRequest) {
  const { user } = await requireAdmin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpsertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { service_id, method, cost, reason, description, metadata } =
    parsed.data;

  /**
   * PRICING UPDATE STRATEGY - Critical for revenue consistency
   * 
   * Double cache invalidation reduces (but doesn't eliminate) race conditions:
   * 
   * 1. Pre-invalidation: Clear cache BEFORE DB update
   *    - Prevents serving stale cached pricing during the update window
   *    - If this fails, entire operation fails (fail-fast)
   * 
   * 2. DB Update: Write new pricing to database (transactional)
   *    - Source of truth for all pricing data
   *    - If this fails, operation fails with no side effects
   * 
   * 3. Post-invalidation: Clear cache AFTER DB update
   *    - Attempts to clear any stale data cached during update window
   *    - If this fails after DB update, we have a critical inconsistency
   *    - Cache TTL (5min) limits exposure, but still requires monitoring
   * 
   * KNOWN RACE CONDITIONS:
   * 
   * Race 1: Between pre-invalidation and post-invalidation
   * Timeline:
   *   T1: Pre-invalidate (cache empty)
   *   T2: DB update commits
   *   T3: Concurrent request - cache miss, reads DB (might get old from replica lag)
   *   T4: Concurrent request - writes stale pricing to cache
   *   T5: Post-invalidate (clears stale data) ✓
   * Impact: Minimal - post-invalidation catches it
   * 
   * Race 2: After post-invalidation (BILLING RISK)
   * Timeline:
   *   T1: Pre-invalidate
   *   T2: DB update commits
   *   T3: Post-invalidate completes
   *   T4: Concurrent request - cache miss, reads from lagging replica (old pricing)
   *   T5: Concurrent request - writes old pricing to cache ⚠️
   *   T6: Subsequent requests use stale cached pricing until TTL expires
   * Impact: CRITICAL - Wrong pricing cached for up to 5 minutes
   * Mitigation: Short TTL (5min), fallback pricing ($1.00), monitoring
   * 
   * ALTERNATIVE STRATEGIES (Not Implemented):
   * 
   * Option 1: Cache invalidation within DB transaction
   *   Pros: Atomic invalidation with DB update
   *   Cons: Violates separation of concerns (Redis ops in PG transaction)
   *         Can't rollback cache operations if transaction fails
   *         Increases transaction duration
   * 
   * Option 2: Versioned cache keys (e.g., pricing:v123:solana-rpc)
   *   Pros: Eliminates invalidation race conditions entirely
   *         Old cached data expires naturally
   *   Cons: More complex cache key management
   *         Requires version tracking in DB
   *         Multiple versions in cache increases memory usage
   * 
   * Option 3: Read-through cache with locking
   *   Pros: Prevents concurrent cache population during updates
   *   Cons: Requires distributed locks (Redis)
   *         Increased complexity and latency
   *         Lock contention under high load
   * 
   * CURRENT SAFEGUARDS:
   * - Double invalidation (reduces race window)
   * - Short cache TTL (5 minutes) limits exposure
   * - Fallback pricing ($1.00) prevents undercharging
   * - Critical logging for post-invalidation failures
   * - Monitoring alerts on cache failures (recommended)
   * - Database transactions ensure atomic pricing updates
   * 
   * ACCEPTED RISKS:
   * - Race condition window exists (< 1 second typically)
   * - Replica lag can extend window (monitor replication)
   * - Maximum impact: Wrong pricing for up to 5 minutes
   * - Mitigation: High fallback pricing prevents revenue loss
   */

  // Step 1: Pre-invalidation (fail-fast if this fails)
  logger.debug("[Admin] Pre-invalidating pricing cache", { service_id });
  await invalidateServicePricingCache(service_id);

  // Step 2: Database update (source of truth)
  logger.debug("[Admin] Updating pricing in database", {
    service_id,
    method,
    cost,
  });
  const result = await servicePricingRepository.upsert(
    service_id,
    method,
    cost,
    user.id,
    reason,
    description,
    metadata,
  );

  // Step 3: Post-invalidation (critical - DB already updated)
  logger.debug("[Admin] Post-invalidating pricing cache", { service_id });
  try {
    await invalidateServicePricingCache(service_id);
    
    // IMPORTANT: Also invalidate allowed methods cache if this is solana-rpc
    // New methods or disabled methods need to reflect immediately
    if (service_id === "solana-rpc") {
      const { cache } = await import("@/lib/cache/client");
      await cache.del("solana-rpc:allowed-methods");
      logger.info("[Admin] Invalidated allowed methods cache", { service_id, method });
    }
  } catch (error) {
    // CRITICAL: DB updated but cache invalidation failed
    // This creates a revenue risk - cache has stale pricing
    logger.error("[Admin] CRITICAL: Post-invalidation failed after DB update", {
      service_id,
      method,
      old_cost: "unknown",
      new_cost: cost,
      error: error instanceof Error ? error.message : "Unknown error",
      impact: "Stale pricing in cache until TTL expires",
      db_updated: true,
      cache_stale: true,
    });

    // Attempt emergency re-invalidation (best effort, non-blocking)
    invalidateServicePricingCache(service_id).catch((retryError) => {
      logger.error("[Admin] Emergency cache clear also failed", {
        service_id,
        retryError: retryError instanceof Error ? retryError.message : "Unknown",
      });
    });

    // Re-throw to inform caller of critical failure (fail-fast)
    throw error;
  }

  logger.info("[Admin] Service pricing updated successfully", {
    service_id,
    method,
    cost,
    updated_by: user.id,
    reason,
    cache_invalidated: true,
  });

  return NextResponse.json({
    success: true,
    pricing: {
      id: result.id,
      service_id: result.service_id,
      method: result.method,
      cost: Number(result.cost),
      description: result.description,
      metadata: result.metadata,
    },
  });
}
