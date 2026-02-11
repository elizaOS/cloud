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
import { requireAdmin, WalletRequiredError, AdminRequiredError } from "@/lib/auth";
import { WalletRequiredError, AdminRequiredError } from "@/lib/auth-errors";
import { servicePricingRepository } from "@/db/repositories";
import { invalidateServicePricingCache } from "@/lib/services/proxy/pricing";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

export async function GET(request: NextRequest) {
  let user;
  try {
    const result = await requireAdmin(request);
    user = result.user;
  } catch (error) {
    if (error instanceof WalletRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error("[Admin] Service pricing auth error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  try {
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
  } catch (error) {
    if (error instanceof WalletRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error("[Admin] Service pricing GET error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
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

  // Double cache invalidation: pre (clear stale) → DB update → post (clear any
  // data cached during update window). Replica-lag race after post-invalidate is
  // bounded by the 5-minute cache TTL. See file header for monitoring notes.

  // Step 1: Pre-invalidation (fail-fast)
  logger.debug("[Admin] Pre-invalidating pricing cache", { service_id });
  await invalidateServicePricingCache(service_id);

  // Step 2: Database update (source of truth)
  logger.debug("[Admin] Updating pricing in database", {
    service_id,
    method,
    cost,
  });
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;

  const result = await servicePricingRepository.upsert(
    service_id,
    method,
    cost,
    user.id,
    reason,
    description,
    metadata,
    ipAddress ?? undefined,
    userAgent ?? undefined,
  );

  // Step 3: Post-invalidation (critical - DB already updated)
  // If this fails the DB update still succeeded; return success with a warning
  // rather than a 500 (which would trick the admin into retrying the upsert).
  let cacheInvalidated = true;
  try {
    await invalidateServicePricingCache(service_id);

    if (service_id === "solana-rpc") {
      const { cache } = await import("@/lib/cache/client");
      await cache.del("solana-rpc:allowed-methods");
    }
  } catch (cacheError) {
    cacheInvalidated = false;
    logger.error("[Admin] CRITICAL: Post-invalidation failed after DB update", {
      service_id,
      method,
      new_cost: cost,
      error: cacheError instanceof Error ? cacheError.message : "Unknown error",
    });

    // Emergency re-invalidation (fire-and-forget)
    invalidateServicePricingCache(service_id).catch((retryError) => {
      logger.error("[Admin] Emergency cache clear also failed", {
        service_id,
        retryError: retryError instanceof Error ? retryError.message : "Unknown",
      });
    });
  }

  logger.info("[Admin] Service pricing updated", {
    service_id,
    method,
    cost,
    updated_by: user.id,
    reason,
    cache_invalidated: cacheInvalidated,
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
    cache_invalidated: cacheInvalidated,
  });
}
